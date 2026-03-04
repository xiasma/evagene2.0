# API Technical Architecture

## Module structure

```
api/evagene/
  main.py         FastAPI app factory, router mounting
  models.py       Pydantic models, enums, create/update schemas
  store.py        In-memory data store with CRUD + event indexing
  gedcom.py       GEDCOM 5.5.1 parser and serializer
  xeg.py          Evagene v1 .xeg XML parser
  routers/
    individuals.py    Individual CRUD + events
    relationships.py  Relationship CRUD + members + offspring
    events.py         Event CRUD + references
    pedigrees.py      Pedigree CRUD + entity membership + GEDCOM import/export + XEG import
    eggs.py           Egg CRUD + events
```

## Application setup (`main.py`)

The FastAPI app is created with a simple factory:

1. Instantiate `FastAPI()`
2. Include each router with its `/api` prefix
3. Optionally mount a static file directory at `/` for production serving

All routers import the shared `store` singleton from `store.py`.

## Data models (`models.py`)

### Domain enums

The API defines string enums for clinical attributes:

- `BiologicalSex` — 8 values (female, male, unknown, ambiguous_female, ambiguous_male, intersex, none, other)
- `DeathStatus` — 12 values (alive through pregnancy, plus other)
- `AffectionStatus` — 12 values (unknown through presymptomatic, plus other)
- `FertilityStatus` — 5 values (unknown, fertile, infertile, infertile_by_choice, other)
- `SmokerType` — 6 values
- `IndividualEventType` — birth, death, diagnosis, symptom, affection, fertility
- `RelationshipEventType` — pregnancy, marriage, divorce, partnership, other

### Entity models

Each entity follows a three-model pattern:

| Model | Purpose |
|-------|---------|
| `Individual` | Full entity with auto-generated UUID and all fields |
| `IndividualCreate` | POST body — same fields minus `id` and `events` |
| `IndividualUpdate` | PATCH body — all fields optional for partial updates |

The same pattern applies to Relationship, Egg, Event, and Pedigree.

### Individual fields

The `Individual` model is the richest entity:

- **Identity**: `id`, `display_name`, `name` (PersonName with given/family/prefix/suffix)
- **Clinical**: `biological_sex`, `proband` (0–360 degrees), `proband_text`, `generation`
- **Health**: `height_mm`, `weight_g`, `alcohol_units_per_week`, `smoker`
- **Spatial**: `x`, `y` (canvas coordinates)
- **Contact**: `contacts` dict of `VCardContact` objects (with phone, email, address arrays)
- **Extensibility**: `properties` dict, `events` list, `notes`, `consent_to_share`

### Supporting types

- `PersonName` — structured name (full, given[], family, prefix, suffix)
- `VCardContact` — contact card (fn, tel[], email[], adr[], org, title, note)
- `EntityReference` — typed link to another entity (entity_type + entity_id)
- `Event` — typed occurrence (type, date, display_name, properties, entity_references)

## Store (`store.py`)

### Design

The store is a singleton class holding four dictionaries:

```python
_individuals: dict[UUID, Individual]
_relationships: dict[UUID, Relationship]
_eggs: dict[UUID, Egg]
_pedigrees: dict[UUID, Pedigree]
```

Plus an event index for fast lookups:

```python
_event_index: dict[UUID, tuple[UUID, int]]  # event_id → (owner_id, list_position)
```

### Operations

All operations are synchronous dict mutations:

- **Create**: Generate UUID, store in dict, return model
- **Read**: Dict lookup, raise 404 if missing
- **Update**: Fetch existing, apply non-None fields from update schema, store back
- **Delete**: Remove from dict, cascade-remove from all pedigrees that reference it

### Event management

Events are stored as lists on their parent entity. The `_event_index` provides O(1) lookups by event UUID without scanning all entities. When events are added or removed, the index is rebuilt for that entity.

### Pedigree detail

`get_pedigree_detail()` resolves a pedigree's UUID lists into full entity objects, returning a `PedigreeDetail` with hydrated `individuals`, `relationships`, and `eggs` arrays. Deleted entities are silently skipped.

## Router patterns

Each router follows consistent patterns:

### Standard CRUD

```python
@router.post("/api/individuals")      # Create → 201
@router.get("/api/individuals")       # List → 200
@router.get("/api/individuals/{id}")  # Get → 200 or 404
@router.patch("/api/individuals/{id}")# Update → 200 or 404
@router.delete("/api/individuals/{id}")# Delete → 204 or 404
```

### Offspring creation (`relationships.py`)

The `/offspring` endpoint is a compound operation:

1. Validate that the relationship, individual, and pedigree all exist
2. Create a pregnancy event on the relationship
3. Create an egg linking the relationship to the child individual
4. Add the egg to the pedigree
5. Return both the event and egg as `OffspringResult`

### GEDCOM import/export (`gedcom.py`)

The `gedcom.py` module provides two functions:

- **`parse_gedcom(text)`** — Parses GEDCOM 5.5.1 text into `(individuals, relationships, eggs)` tuples. Processes INDI records (NAME, SEX, BIRT, DEAT, NOTE with CONT/CONC continuation) and FAM records (HUSB, WIFE, CHIL). Custom underscore-prefixed tags (`_X`, `_Y`, `_PROBAND`, `_AFFECTION`, `_FERTILITY`, `_DEATH_STATUS`, `_TWIN`, `_MONOZYGOTIC`) preserve Evagene-specific data for round-trip fidelity.

- **`serialize_gedcom(individuals, relationships, eggs, pedigree_name)`** — Produces GEDCOM 5.5.1 text with HEAD (SOUR EVAGENE, GEDC 5.5.1, CHAR UTF-8), INDI records, FAM records, and TRLR. UUIDs are mapped to sequential xrefs (`@I1@`, `@F1@`). Date conversion: ISO `YYYY-MM-DD` ↔ GEDCOM `DD MMM YYYY`.

The pedigrees router exposes these as `GET /{id}/export.ged` (returns `PlainTextResponse` with `Content-Disposition: attachment`) and `POST /{id}/import/gedcom` (accepts `GedcomImportBody` with a `content` string field).

### XEG import (`xeg.py`)

The `xeg.py` module provides `parse_xeg(text)` which parses Evagene v1 `.xeg` XML files into `(individuals, relationships, eggs)` tuples. It performs three passes:

1. **Individuals** — parses `<Individual>` elements with Name, Sex/Gender, X/Y coordinates, DefinedFields (Surname, Given names, Title, contact info, height, weight, consent), clinical properties (Affection, Fertility, Living), and Proband
2. **Marriages → Relationships** — parses `<Marriage>` elements with `Spouse1Ref`/`Spouse2Ref`, translating v1 GUIDs to new UUIDs
3. **EggLists → Eggs** — follows the linkage chain: `PregnancyList` → `Pregnancy` (via `MarriageRef`) → `EggList` (via `PregnancyRef`) → `Egg` → `Siblings/Individual[@IndividualRef]`

The pedigrees router exposes this as `POST /{id}/import/xeg` (accepts `XegImportBody` with a `content` string field).

### Error handling

All 404s raise `HTTPException(status_code=404)`. Pydantic handles validation errors automatically (422 responses).

## Testing

Tests use FastAPI's `TestClient` (via httpx) with a fresh `Store` instance per test (reset in `conftest.py`). The suite covers:

- All CRUD operations for each entity type
- Edge cases (not found, duplicate members, bad event types)
- Model validation (proband range, enum values, defaults)
- Cascade deletion (entity removal from pedigrees)
- Event index consistency across create/delete cycles
