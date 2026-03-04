# Evagene API

The Evagene API is a RESTful backend built with FastAPI that manages pedigree data — individuals, relationships, offspring (eggs), events, and pedigree containers. It uses an in-memory store, so data is session-scoped and lost on server restart.

## Running the API

```bash
# From the project root, with venv activated
uvicorn api.evagene.main:app --reload
```

The server starts on `http://localhost:8000`. Interactive API documentation is available at `http://localhost:8000/docs` (Swagger UI) and `http://localhost:8000/redoc` (ReDoc).

## API endpoints

### Individuals (`/api/individuals`)

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/individuals` | Create an individual |
| GET | `/api/individuals` | List all individuals |
| GET | `/api/individuals/{id}` | Get an individual |
| PATCH | `/api/individuals/{id}` | Update an individual (partial) |
| DELETE | `/api/individuals/{id}` | Delete an individual |
| POST | `/api/individuals/{id}/events` | Add an event to an individual |

### Relationships (`/api/relationships`)

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/relationships` | Create a relationship |
| GET | `/api/relationships` | List all relationships |
| GET | `/api/relationships/{id}` | Get a relationship |
| DELETE | `/api/relationships/{id}` | Delete a relationship |
| POST | `/api/relationships/{id}/members/{individual_id}` | Add a member |
| DELETE | `/api/relationships/{id}/members/{individual_id}` | Remove a member |
| POST | `/api/relationships/{id}/offspring` | Create offspring (egg + pregnancy event) |
| POST | `/api/relationships/{id}/events` | Add an event |

### Eggs (`/api/eggs`)

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/eggs` | Create an egg |
| GET | `/api/eggs` | List all eggs |
| GET | `/api/eggs/{id}` | Get an egg |
| DELETE | `/api/eggs/{id}` | Delete an egg |
| POST | `/api/eggs/{id}/events` | Add an event |

### Pedigrees (`/api/pedigrees`)

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/pedigrees` | Create a pedigree |
| GET | `/api/pedigrees` | List all pedigrees |
| GET | `/api/pedigrees/{id}` | Get pedigree detail (with resolved entities) |
| PATCH | `/api/pedigrees/{id}` | Update a pedigree |
| DELETE | `/api/pedigrees/{id}` | Delete a pedigree (keeps entities) |
| POST | `/api/pedigrees/{id}/individuals/{individual_id}` | Add individual to pedigree |
| DELETE | `/api/pedigrees/{id}/individuals/{individual_id}` | Remove individual from pedigree |
| POST | `/api/pedigrees/{id}/relationships/{relationship_id}` | Add relationship to pedigree |
| DELETE | `/api/pedigrees/{id}/relationships/{relationship_id}` | Remove relationship |
| POST | `/api/pedigrees/{id}/eggs/{egg_id}` | Add egg to pedigree |
| DELETE | `/api/pedigrees/{id}/eggs/{egg_id}` | Remove egg |
| POST | `/api/pedigrees/{id}/events` | Add an event |

### Events (`/api/events`)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/events/{id}` | Get an event |
| PATCH | `/api/events/{id}` | Update an event |
| DELETE | `/api/events/{id}` | Delete an event |
| POST | `/api/events/{id}/references` | Add entity reference |
| DELETE | `/api/events/{id}/references/{index}` | Remove entity reference |

## Testing

```bash
cd api
python -m pytest tests/ -v
```

The test suite covers all endpoints, models, and store operations (228 tests).
