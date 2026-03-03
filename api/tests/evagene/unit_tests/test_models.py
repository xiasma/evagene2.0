from __future__ import annotations

import uuid

import pytest
from pydantic import ValidationError

from evagene.models import (
    AffectionStatus,
    BiologicalSex,
    DeathStatus,
    Egg,
    EggCreate,
    EntityReference,
    Event,
    EventCreate,
    EventUpdate,
    FertilityStatus,
    Individual,
    IndividualCreate,
    IndividualEventCreate,
    IndividualEventType,
    IndividualUpdate,
    OffspringCreate,
    OffspringResult,
    Pedigree,
    PedigreeCreate,
    PedigreeDetail,
    PedigreeUpdate,
    PersonName,
    Relationship,
    RelationshipCreate,
    RelationshipEventCreate,
    RelationshipEventType,
    SmokerType,
    VCardAddress,
    VCardContact,
    VCardEmail,
    VCardPhone,
)


# --- Enums ---


def test_biological_sex_values():
    assert BiologicalSex.male == "male"
    assert BiologicalSex.female == "female"
    assert BiologicalSex.intersex == "intersex"
    assert BiologicalSex.unknown == "unknown"


def test_biological_sex_expanded_values():
    assert BiologicalSex.ambiguous_male == "ambiguous_male"
    assert BiologicalSex.ambiguous_female == "ambiguous_female"
    assert BiologicalSex.none == "none"
    assert BiologicalSex.other == "other"


def test_individual_event_type_values():
    assert IndividualEventType.birth == "birth"
    assert IndividualEventType.death == "death"
    assert IndividualEventType.diagnosis == "diagnosis"
    assert IndividualEventType.symptom == "symptom"


def test_individual_event_type_expanded_values():
    assert IndividualEventType.affection == "affection"
    assert IndividualEventType.fertility == "fertility"


def test_relationship_event_type_values():
    assert RelationshipEventType.marriage == "marriage"
    assert RelationshipEventType.divorce == "divorce"
    assert RelationshipEventType.separation == "separation"
    assert RelationshipEventType.partnership == "partnership"
    assert RelationshipEventType.engagement == "engagement"
    assert RelationshipEventType.pregnancy == "pregnancy"


def test_death_status_values():
    expected = [
        "unknown", "alive", "dead", "suicide_confirmed", "suicide_unconfirmed",
        "spontaneous_abortion", "therapeutic_abortion", "neonatal_death",
        "stillborn", "lived_one_day", "pregnancy", "other",
    ]
    actual = [e.value for e in DeathStatus]
    assert actual == expected


def test_affection_status_values():
    expected = [
        "unknown", "clear", "affected", "possible_affection", "heterozygous",
        "affected_by_hearsay", "carrier", "examined", "untested", "immune",
        "presymptomatic", "other",
    ]
    actual = [e.value for e in AffectionStatus]
    assert actual == expected


def test_fertility_status_values():
    expected = ["unknown", "fertile", "infertile", "infertile_by_choice", "other"]
    actual = [e.value for e in FertilityStatus]
    assert actual == expected


def test_smoker_type_values():
    expected = ["vape", "cigarette", "cigar", "pipe", "mixed", "other"]
    actual = [e.value for e in SmokerType]
    assert actual == expected


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


# --- VCard models ---


def test_vcard_contact_defaults():
    vc = VCardContact()
    assert vc.fn == ""
    assert vc.n == PersonName()
    assert vc.tel == []
    assert vc.email == []
    assert vc.adr == []
    assert vc.org == ""
    assert vc.title == ""
    assert vc.note == ""
    assert vc.properties == {}


def test_vcard_contact_with_phones_emails_addresses():
    vc = VCardContact(
        fn="Dr. Smith",
        tel=[VCardPhone(value="+1234567890", types=["work", "voice"])],
        email=[VCardEmail(value="dr@example.com", types=["work"])],
        adr=[VCardAddress(
            street="123 Main St",
            city="Springfield",
            region="IL",
            postal_code="62704",
            country="US",
            types=["work"],
        )],
    )
    assert vc.fn == "Dr. Smith"
    assert len(vc.tel) == 1
    assert vc.tel[0].value == "+1234567890"
    assert vc.tel[0].types == ["work", "voice"]
    assert len(vc.email) == 1
    assert vc.email[0].value == "dr@example.com"
    assert len(vc.adr) == 1
    assert vc.adr[0].city == "Springfield"
    assert vc.adr[0].types == ["work"]


def test_vcard_doctor_with_practice_name():
    vc = VCardContact(
        fn="Dr. Smith",
        properties={"practice_name": "Springfield Clinic", "referred_by": "Dr. Jones"},
    )
    assert vc.properties["practice_name"] == "Springfield Clinic"
    assert vc.properties["referred_by"] == "Dr. Jones"


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


def test_individual_new_field_defaults():
    ind = Individual()
    assert ind.notes == ""
    assert ind.proband == 0.0
    assert ind.proband_text == ""
    assert ind.generation is None
    assert ind.contacts == {}
    assert ind.consent_to_share is None
    assert ind.height_mm is None
    assert ind.weight_g is None
    assert ind.alcohol_units_per_week is None
    assert ind.smoker is None
    assert ind.smoking_per_day is None


def test_individual_proband_validation_accepts_valid_range():
    ind = Individual(proband=0.0)
    assert ind.proband == 0.0
    ind2 = Individual(proband=180.0)
    assert ind2.proband == 180.0
    ind3 = Individual(proband=360.0)
    assert ind3.proband == 360.0


def test_individual_proband_validation_rejects_negative():
    with pytest.raises(ValidationError):
        Individual(proband=-1.0)


def test_individual_proband_validation_rejects_over_360():
    with pytest.raises(ValidationError):
        Individual(proband=361.0)


def test_individual_contacts_dict():
    doctor = VCardContact(
        fn="Dr. Smith",
        properties={"practice_name": "Test Clinic"},
    )
    ind = Individual(contacts={"doctor": doctor})
    assert "doctor" in ind.contacts
    assert ind.contacts["doctor"].fn == "Dr. Smith"


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
    assert egg.relationship_id is None
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


# --- Notes defaults on all entities ---


def test_individual_notes_default():
    assert Individual().notes == ""


def test_relationship_notes_default():
    assert Relationship().notes == ""


def test_egg_notes_default():
    assert Egg().notes == ""


def test_pedigree_notes_default():
    assert Pedigree().notes == ""


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


def test_individual_create_new_field_defaults():
    ic = IndividualCreate()
    assert ic.notes == ""
    assert ic.proband == 0.0
    assert ic.proband_text == ""
    assert ic.generation is None
    assert ic.contacts == {}
    assert ic.consent_to_share is None
    assert ic.height_mm is None
    assert ic.weight_g is None
    assert ic.alcohol_units_per_week is None
    assert ic.smoker is None
    assert ic.smoking_per_day is None


def test_individual_update_new_fields_optional():
    iu = IndividualUpdate()
    assert iu.name is None
    assert iu.notes is None
    assert iu.proband is None
    assert iu.proband_text is None
    assert iu.generation is None
    assert iu.contacts is None
    assert iu.consent_to_share is None
    assert iu.height_mm is None
    assert iu.weight_g is None
    assert iu.alcohol_units_per_week is None
    assert iu.smoker is None
    assert iu.smoking_per_day is None


def test_relationship_create_default_members():
    rc = RelationshipCreate()
    assert rc.members == []
    assert rc.display_name == ""
    assert rc.properties == {}


def test_relationship_create_notes_default():
    assert RelationshipCreate().notes == ""


def test_egg_create_defaults():
    ec = EggCreate()
    assert ec.display_name == ""
    assert ec.properties == {}
    assert ec.individual_id is None


def test_egg_create_notes_default():
    assert EggCreate().notes == ""


def test_egg_create_relationship_id_default():
    ec = EggCreate()
    assert ec.relationship_id is None


def test_offspring_create_required_fields():
    ind_id = uuid.uuid4()
    ped_id = uuid.uuid4()
    oc = OffspringCreate(individual_id=ind_id, pedigree_id=ped_id)
    assert oc.individual_id == ind_id
    assert oc.pedigree_id == ped_id


def test_offspring_result_fields():
    ev = Event(type="pregnancy")
    egg = Egg()
    result = OffspringResult(pregnancy_event=ev, egg=egg)
    assert result.pregnancy_event is ev
    assert result.egg is egg


def test_pedigree_create_defaults():
    pc = PedigreeCreate()
    assert pc.display_name == ""
    assert pc.date_represented is None
    assert pc.owner == ""
    assert pc.properties == {}


def test_pedigree_create_notes_default():
    assert PedigreeCreate().notes == ""


def test_pedigree_update_all_optional():
    pu = PedigreeUpdate()
    assert pu.display_name is None
    assert pu.date_represented is None
    assert pu.owner is None
    assert pu.properties is None


def test_pedigree_update_notes_optional():
    assert PedigreeUpdate().notes is None


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


def test_individual_round_trip_with_new_fields():
    doctor = VCardContact(
        fn="Dr. Smith",
        properties={"practice_name": "Test Clinic"},
    )
    ind = Individual(
        notes="Patient note",
        proband=90.0,
        proband_text="arrow text",
        generation=2,
        contacts={"doctor": doctor},
        consent_to_share=True,
        height_mm=1750,
        weight_g=70000,
        alcohol_units_per_week=5.5,
        smoker=SmokerType.cigarette,
        smoking_per_day=10,
    )
    data = ind.model_dump()
    restored = Individual.model_validate(data)
    assert restored.notes == "Patient note"
    assert restored.proband == 90.0
    assert restored.proband_text == "arrow text"
    assert restored.generation == 2
    assert restored.contacts["doctor"].fn == "Dr. Smith"
    assert restored.consent_to_share is True
    assert restored.height_mm == 1750
    assert restored.weight_g == 70000
    assert restored.alcohol_units_per_week == 5.5
    assert restored.smoker == SmokerType.cigarette
    assert restored.smoking_per_day == 10


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
    rel_id = uuid.uuid4()
    egg = Egg(
        display_name="Egg 1",
        properties={"frozen": True},
        individual_id=child_id,
        relationship_id=rel_id,
    )
    data = egg.model_dump()
    restored = Egg.model_validate(data)
    assert restored.id == egg.id
    assert restored.display_name == "Egg 1"
    assert restored.individual_id == child_id
    assert restored.relationship_id == rel_id


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
