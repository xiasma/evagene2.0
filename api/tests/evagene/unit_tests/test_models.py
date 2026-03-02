from __future__ import annotations

import uuid

from evagene.models import (
    BiologicalSex,
    Egg,
    EggCreate,
    EntityReference,
    Event,
    EventCreate,
    EventUpdate,
    Individual,
    IndividualCreate,
    IndividualEventCreate,
    IndividualEventType,
    Pedigree,
    PedigreeCreate,
    PedigreeDetail,
    PedigreeUpdate,
    PersonName,
    Relationship,
    RelationshipCreate,
    RelationshipEventCreate,
    RelationshipEventType,
)


# --- Enums ---


def test_biological_sex_values():
    assert BiologicalSex.male == "male"
    assert BiologicalSex.female == "female"
    assert BiologicalSex.intersex == "intersex"
    assert BiologicalSex.unknown == "unknown"


def test_individual_event_type_values():
    assert IndividualEventType.birth == "birth"
    assert IndividualEventType.death == "death"
    assert IndividualEventType.diagnosis == "diagnosis"
    assert IndividualEventType.symptom == "symptom"


def test_relationship_event_type_values():
    assert RelationshipEventType.marriage == "marriage"
    assert RelationshipEventType.divorce == "divorce"
    assert RelationshipEventType.separation == "separation"
    assert RelationshipEventType.partnership == "partnership"
    assert RelationshipEventType.engagement == "engagement"
    assert RelationshipEventType.pregnancy == "pregnancy"


# --- PersonName ---


def test_person_name_defaults():
    pn = PersonName()
    assert pn.full == ""
    assert pn.given == []
    assert pn.family == ""
    assert pn.prefix == ""
    assert pn.suffix == ""


def test_person_name_with_values():
    pn = PersonName(full="Dr. Jane Doe Jr.", given=["Jane"], family="Doe", prefix="Dr.", suffix="Jr.")
    assert pn.full == "Dr. Jane Doe Jr."
    assert pn.given == ["Jane"]
    assert pn.family == "Doe"


# --- Default UUID generation ---


def test_individual_has_default_uuid():
    ind = Individual()
    assert isinstance(ind.id, uuid.UUID)


def test_relationship_has_default_uuid():
    rel = Relationship()
    assert isinstance(rel.id, uuid.UUID)


def test_event_has_default_uuid():
    ev = Event(type="birth")
    assert isinstance(ev.id, uuid.UUID)


def test_egg_has_default_uuid():
    egg = Egg()
    assert isinstance(egg.id, uuid.UUID)


def test_pedigree_has_default_uuid():
    ped = Pedigree()
    assert isinstance(ped.id, uuid.UUID)


def test_each_individual_gets_unique_id():
    a, b = Individual(), Individual()
    assert a.id != b.id


# --- Default empty collections ---


def test_individual_default_events_empty():
    ind = Individual()
    assert ind.events == []


def test_individual_default_properties_empty():
    ind = Individual()
    assert ind.properties == {}


def test_individual_default_display_name():
    ind = Individual()
    assert ind.display_name == ""


def test_individual_default_name():
    ind = Individual()
    assert ind.name == PersonName()


def test_individual_default_biological_sex():
    ind = Individual()
    assert ind.biological_sex is None


def test_relationship_default_members_empty():
    rel = Relationship()
    assert rel.members == []


def test_relationship_default_events_empty():
    rel = Relationship()
    assert rel.events == []


def test_relationship_default_display_name():
    rel = Relationship()
    assert rel.display_name == ""


def test_relationship_default_properties():
    rel = Relationship()
    assert rel.properties == {}


def test_event_default_entity_references_empty():
    ev = Event(type="birth")
    assert ev.entity_references == []


def test_event_default_properties_empty():
    ev = Event(type="birth")
    assert ev.properties == {}


def test_event_default_display_name():
    ev = Event(type="birth")
    assert ev.display_name == ""


def test_egg_defaults():
    egg = Egg()
    assert egg.display_name == ""
    assert egg.properties == {}
    assert egg.individual_id is None
    assert egg.events == []


def test_pedigree_defaults():
    ped = Pedigree()
    assert ped.display_name == ""
    assert ped.date_represented is None
    assert ped.owner == ""
    assert ped.properties == {}
    assert ped.events == []
    assert ped.created_at is None
    assert ped.updated_at is None
    assert ped.individual_ids == []
    assert ped.relationship_ids == []
    assert ped.egg_ids == []


def test_pedigree_detail_extends_pedigree():
    detail = PedigreeDetail()
    assert detail.individuals == []
    assert detail.relationships == []
    assert detail.eggs == []
    assert detail.individual_ids == []


# --- EntityReference required fields ---


def test_entity_reference_construction():
    ref_id = uuid.uuid4()
    ref = EntityReference(entity_id=ref_id, entity_type="individual", role="child")
    assert ref.entity_id == ref_id
    assert ref.entity_type == "individual"
    assert ref.role == "child"
    assert ref.properties == {}


# --- Request schemas ---


def test_individual_create_defaults():
    ic = IndividualCreate()
    assert ic.display_name == ""
    assert ic.name == PersonName()
    assert ic.biological_sex is None
    assert ic.properties == {}


def test_relationship_create_default_members():
    rc = RelationshipCreate()
    assert rc.members == []
    assert rc.display_name == ""
    assert rc.properties == {}


def test_egg_create_defaults():
    ec = EggCreate()
    assert ec.display_name == ""
    assert ec.properties == {}
    assert ec.individual_id is None


def test_pedigree_create_defaults():
    pc = PedigreeCreate()
    assert pc.display_name == ""
    assert pc.date_represented is None
    assert pc.owner == ""
    assert pc.properties == {}


def test_pedigree_update_all_optional():
    pu = PedigreeUpdate()
    assert pu.display_name is None
    assert pu.date_represented is None
    assert pu.owner is None
    assert pu.properties is None


def test_event_create_required_type():
    ec = EventCreate(type="diagnosis")
    assert ec.type == "diagnosis"
    assert ec.display_name == ""
    assert ec.date is None
    assert ec.properties == {}
    assert ec.entity_references == []


def test_individual_event_create_validates_type():
    iec = IndividualEventCreate(type="birth")
    assert iec.type == IndividualEventType.birth
    assert iec.display_name == ""


def test_relationship_event_create_validates_type():
    rec = RelationshipEventCreate(type="marriage")
    assert rec.type == RelationshipEventType.marriage
    assert rec.display_name == ""


def test_event_update_all_optional():
    eu = EventUpdate()
    assert eu.type is None
    assert eu.display_name is None
    assert eu.date is None
    assert eu.properties is None


# --- Round-trip serialization ---


def test_individual_round_trip():
    ind = Individual(
        display_name="Test",
        name=PersonName(full="Test Person", given=["Test"], family="Person"),
        biological_sex=BiologicalSex.female,
        properties={"key": "val"},
    )
    data = ind.model_dump()
    restored = Individual.model_validate(data)
    assert restored.id == ind.id
    assert restored.display_name == "Test"
    assert restored.name.full == "Test Person"
    assert restored.biological_sex == BiologicalSex.female
    assert restored.properties == {"key": "val"}
    assert restored.events == ind.events


def test_event_round_trip():
    ref = EntityReference(entity_id=uuid.uuid4(), entity_type="individual", role="parent")
    ev = Event(
        type="birth",
        display_name="Birth event",
        date="2024-01-01",
        properties={"key": "val"},
        entity_references=[ref],
    )
    data = ev.model_dump()
    restored = Event.model_validate(data)
    assert restored.id == ev.id
    assert restored.type == ev.type
    assert restored.display_name == "Birth event"
    assert restored.date == ev.date
    assert restored.properties == ev.properties
    assert len(restored.entity_references) == 1
    assert restored.entity_references[0].entity_id == ref.entity_id


def test_egg_round_trip():
    child_id = uuid.uuid4()
    egg = Egg(display_name="Egg 1", properties={"frozen": True}, individual_id=child_id)
    data = egg.model_dump()
    restored = Egg.model_validate(data)
    assert restored.id == egg.id
    assert restored.display_name == "Egg 1"
    assert restored.individual_id == child_id


def test_pedigree_round_trip():
    ped = Pedigree(
        display_name="Family A",
        date_represented="2024-01-01",
        owner="clinic",
        properties={"note": "test"},
        individual_ids=[uuid.uuid4()],
        relationship_ids=[uuid.uuid4()],
        egg_ids=[uuid.uuid4()],
    )
    data = ped.model_dump()
    restored = Pedigree.model_validate(data)
    assert restored.id == ped.id
    assert restored.display_name == "Family A"
    assert restored.owner == "clinic"
    assert len(restored.individual_ids) == 1
    assert len(restored.relationship_ids) == 1
    assert len(restored.egg_ids) == 1
