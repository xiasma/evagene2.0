from __future__ import annotations

import uuid

from evagene.models import Event, PersonName, BiologicalSex
from evagene.store import Store


# --- Individual CRUD ---


def test_create_individual(fresh_store: Store):
    ind = fresh_store.create_individual()
    assert ind is not None
    assert isinstance(ind.id, uuid.UUID)


def test_create_individual_with_fields(fresh_store: Store):
    name = PersonName(full="Jane Doe", given=["Jane"], family="Doe")
    ind = fresh_store.create_individual(
        display_name="Jane",
        name=name,
        biological_sex=BiologicalSex.female,
        properties={"note": "test"},
    )
    assert ind.display_name == "Jane"
    assert ind.name.full == "Jane Doe"
    assert ind.biological_sex == BiologicalSex.female
    assert ind.properties == {"note": "test"}


def test_get_individual(fresh_store: Store):
    ind = fresh_store.create_individual()
    found = fresh_store.get_individual(ind.id)
    assert found is ind


def test_get_individual_not_found(fresh_store: Store):
    assert fresh_store.get_individual(uuid.uuid4()) is None


def test_list_individuals_empty(fresh_store: Store):
    assert fresh_store.list_individuals() == []


def test_list_individuals_multiple(fresh_store: Store):
    a = fresh_store.create_individual()
    b = fresh_store.create_individual()
    result = fresh_store.list_individuals()
    assert len(result) == 2
    ids = {i.id for i in result}
    assert a.id in ids
    assert b.id in ids


def test_delete_individual(fresh_store: Store):
    ind = fresh_store.create_individual()
    assert fresh_store.delete_individual(ind.id) is True
    assert fresh_store.get_individual(ind.id) is None


def test_delete_individual_not_found(fresh_store: Store):
    assert fresh_store.delete_individual(uuid.uuid4()) is False


def test_delete_individual_clears_event_index(fresh_store: Store):
    ind = fresh_store.create_individual()
    ev = Event(type="birth")
    fresh_store.add_event(ind.id, ev)
    assert fresh_store.get_event(ev.id) is not None
    fresh_store.delete_individual(ind.id)
    assert fresh_store.get_event(ev.id) is None


def test_delete_individual_removes_from_pedigree(fresh_store: Store):
    ind = fresh_store.create_individual()
    ped = fresh_store.create_pedigree()
    fresh_store.add_individual_to_pedigree(ped.id, ind.id)
    assert ind.id in ped.individual_ids
    fresh_store.delete_individual(ind.id)
    assert ind.id not in ped.individual_ids


# --- Relationship CRUD ---


def test_create_relationship(fresh_store: Store):
    rel = fresh_store.create_relationship(members=[])
    assert rel is not None
    assert isinstance(rel.id, uuid.UUID)


def test_create_relationship_with_fields(fresh_store: Store):
    id1, id2 = uuid.uuid4(), uuid.uuid4()
    rel = fresh_store.create_relationship(
        members=[id1, id2],
        display_name="Couple",
        properties={"type": "married"},
    )
    assert rel.members == [id1, id2]
    assert rel.display_name == "Couple"
    assert rel.properties == {"type": "married"}


def test_get_relationship(fresh_store: Store):
    rel = fresh_store.create_relationship(members=[])
    found = fresh_store.get_relationship(rel.id)
    assert found is rel


def test_get_relationship_not_found(fresh_store: Store):
    assert fresh_store.get_relationship(uuid.uuid4()) is None


def test_delete_relationship(fresh_store: Store):
    rel = fresh_store.create_relationship(members=[])
    assert fresh_store.delete_relationship(rel.id) is True
    assert fresh_store.get_relationship(rel.id) is None


def test_delete_relationship_not_found(fresh_store: Store):
    assert fresh_store.delete_relationship(uuid.uuid4()) is False


def test_delete_relationship_clears_event_index(fresh_store: Store):
    rel = fresh_store.create_relationship(members=[])
    ev = Event(type="marriage")
    fresh_store.add_event(rel.id, ev)
    assert fresh_store.get_event(ev.id) is not None
    fresh_store.delete_relationship(rel.id)
    assert fresh_store.get_event(ev.id) is None


def test_delete_relationship_removes_from_pedigree(fresh_store: Store):
    rel = fresh_store.create_relationship(members=[])
    ped = fresh_store.create_pedigree()
    fresh_store.add_relationship_to_pedigree(ped.id, rel.id)
    assert rel.id in ped.relationship_ids
    fresh_store.delete_relationship(rel.id)
    assert rel.id not in ped.relationship_ids


# --- Membership ---


def test_add_member(fresh_store: Store):
    rel = fresh_store.create_relationship(members=[])
    ind_id = uuid.uuid4()
    assert fresh_store.add_member(rel.id, ind_id) is True
    assert ind_id in rel.members


def test_add_member_idempotent(fresh_store: Store):
    rel = fresh_store.create_relationship(members=[])
    ind_id = uuid.uuid4()
    fresh_store.add_member(rel.id, ind_id)
    fresh_store.add_member(rel.id, ind_id)
    assert rel.members.count(ind_id) == 1


def test_add_member_bad_relationship(fresh_store: Store):
    assert fresh_store.add_member(uuid.uuid4(), uuid.uuid4()) is False


def test_remove_member(fresh_store: Store):
    ind_id = uuid.uuid4()
    rel = fresh_store.create_relationship(members=[ind_id])
    assert fresh_store.remove_member(rel.id, ind_id) is True
    assert ind_id not in rel.members


def test_remove_member_not_found(fresh_store: Store):
    rel = fresh_store.create_relationship(members=[])
    assert fresh_store.remove_member(rel.id, uuid.uuid4()) is False


def test_remove_member_bad_relationship(fresh_store: Store):
    assert fresh_store.remove_member(uuid.uuid4(), uuid.uuid4()) is False


# --- Eggs ---


def test_create_egg(fresh_store: Store):
    egg = fresh_store.create_egg()
    assert egg is not None
    assert isinstance(egg.id, uuid.UUID)
    assert egg.display_name == ""


def test_create_egg_with_fields(fresh_store: Store):
    child_id = uuid.uuid4()
    egg = fresh_store.create_egg(
        display_name="Egg 1",
        properties={"frozen": True},
        individual_id=child_id,
    )
    assert egg.display_name == "Egg 1"
    assert egg.properties == {"frozen": True}
    assert egg.individual_id == child_id


def test_get_egg(fresh_store: Store):
    egg = fresh_store.create_egg()
    found = fresh_store.get_egg(egg.id)
    assert found is egg


def test_get_egg_not_found(fresh_store: Store):
    assert fresh_store.get_egg(uuid.uuid4()) is None


def test_list_eggs_empty(fresh_store: Store):
    assert fresh_store.list_eggs() == []


def test_list_eggs_multiple(fresh_store: Store):
    a = fresh_store.create_egg()
    b = fresh_store.create_egg()
    result = fresh_store.list_eggs()
    assert len(result) == 2
    ids = {e.id for e in result}
    assert a.id in ids
    assert b.id in ids


def test_delete_egg(fresh_store: Store):
    egg = fresh_store.create_egg()
    assert fresh_store.delete_egg(egg.id) is True
    assert fresh_store.get_egg(egg.id) is None


def test_delete_egg_not_found(fresh_store: Store):
    assert fresh_store.delete_egg(uuid.uuid4()) is False


def test_delete_egg_clears_event_index(fresh_store: Store):
    egg = fresh_store.create_egg()
    ev = Event(type="retrieval")
    fresh_store.add_event(egg.id, ev)
    assert fresh_store.get_event(ev.id) is not None
    fresh_store.delete_egg(egg.id)
    assert fresh_store.get_event(ev.id) is None


def test_delete_egg_removes_from_pedigree(fresh_store: Store):
    egg = fresh_store.create_egg()
    ped = fresh_store.create_pedigree()
    fresh_store.add_egg_to_pedigree(ped.id, egg.id)
    assert egg.id in ped.egg_ids
    fresh_store.delete_egg(egg.id)
    assert egg.id not in ped.egg_ids


# --- Pedigrees ---


def test_create_pedigree(fresh_store: Store):
    ped = fresh_store.create_pedigree()
    assert ped is not None
    assert isinstance(ped.id, uuid.UUID)
    assert ped.created_at is not None
    assert ped.updated_at is not None


def test_create_pedigree_with_fields(fresh_store: Store):
    ped = fresh_store.create_pedigree(
        display_name="Family A",
        date_represented="2024-01-01",
        owner="clinic",
        properties={"note": "test"},
    )
    assert ped.display_name == "Family A"
    assert ped.date_represented == "2024-01-01"
    assert ped.owner == "clinic"
    assert ped.properties == {"note": "test"}


def test_get_pedigree(fresh_store: Store):
    ped = fresh_store.create_pedigree()
    found = fresh_store.get_pedigree(ped.id)
    assert found is ped


def test_get_pedigree_not_found(fresh_store: Store):
    assert fresh_store.get_pedigree(uuid.uuid4()) is None


def test_list_pedigrees_empty(fresh_store: Store):
    assert fresh_store.list_pedigrees() == []


def test_list_pedigrees_multiple(fresh_store: Store):
    a = fresh_store.create_pedigree()
    b = fresh_store.create_pedigree()
    result = fresh_store.list_pedigrees()
    assert len(result) == 2


def test_update_pedigree(fresh_store: Store):
    ped = fresh_store.create_pedigree(display_name="Old")
    updated = fresh_store.update_pedigree(ped.id, display_name="New")
    assert updated is ped
    assert ped.display_name == "New"
    assert ped.updated_at is not None


def test_update_pedigree_not_found(fresh_store: Store):
    assert fresh_store.update_pedigree(uuid.uuid4(), display_name="X") is None


def test_delete_pedigree(fresh_store: Store):
    ped = fresh_store.create_pedigree()
    assert fresh_store.delete_pedigree(ped.id) is True
    assert fresh_store.get_pedigree(ped.id) is None


def test_delete_pedigree_not_found(fresh_store: Store):
    assert fresh_store.delete_pedigree(uuid.uuid4()) is False


def test_delete_pedigree_clears_event_index(fresh_store: Store):
    ped = fresh_store.create_pedigree()
    ev = Event(type="note")
    fresh_store.add_event(ped.id, ev)
    assert fresh_store.get_event(ev.id) is not None
    fresh_store.delete_pedigree(ped.id)
    assert fresh_store.get_event(ev.id) is None


# --- Pedigree entity membership ---


def test_add_individual_to_pedigree(fresh_store: Store):
    ped = fresh_store.create_pedigree()
    ind = fresh_store.create_individual()
    assert fresh_store.add_individual_to_pedigree(ped.id, ind.id) is True
    assert ind.id in ped.individual_ids


def test_add_individual_to_pedigree_idempotent(fresh_store: Store):
    ped = fresh_store.create_pedigree()
    ind = fresh_store.create_individual()
    fresh_store.add_individual_to_pedigree(ped.id, ind.id)
    fresh_store.add_individual_to_pedigree(ped.id, ind.id)
    assert ped.individual_ids.count(ind.id) == 1


def test_add_individual_to_pedigree_bad_pedigree(fresh_store: Store):
    assert fresh_store.add_individual_to_pedigree(uuid.uuid4(), uuid.uuid4()) is False


def test_remove_individual_from_pedigree(fresh_store: Store):
    ped = fresh_store.create_pedigree()
    ind = fresh_store.create_individual()
    fresh_store.add_individual_to_pedigree(ped.id, ind.id)
    assert fresh_store.remove_individual_from_pedigree(ped.id, ind.id) is True
    assert ind.id not in ped.individual_ids


def test_remove_individual_from_pedigree_not_found(fresh_store: Store):
    ped = fresh_store.create_pedigree()
    assert fresh_store.remove_individual_from_pedigree(ped.id, uuid.uuid4()) is False


def test_add_relationship_to_pedigree(fresh_store: Store):
    ped = fresh_store.create_pedigree()
    rel = fresh_store.create_relationship(members=[])
    assert fresh_store.add_relationship_to_pedigree(ped.id, rel.id) is True
    assert rel.id in ped.relationship_ids


def test_remove_relationship_from_pedigree(fresh_store: Store):
    ped = fresh_store.create_pedigree()
    rel = fresh_store.create_relationship(members=[])
    fresh_store.add_relationship_to_pedigree(ped.id, rel.id)
    assert fresh_store.remove_relationship_from_pedigree(ped.id, rel.id) is True
    assert rel.id not in ped.relationship_ids


def test_add_egg_to_pedigree(fresh_store: Store):
    ped = fresh_store.create_pedigree()
    egg = fresh_store.create_egg()
    assert fresh_store.add_egg_to_pedigree(ped.id, egg.id) is True
    assert egg.id in ped.egg_ids


def test_remove_egg_from_pedigree(fresh_store: Store):
    ped = fresh_store.create_pedigree()
    egg = fresh_store.create_egg()
    fresh_store.add_egg_to_pedigree(ped.id, egg.id)
    assert fresh_store.remove_egg_from_pedigree(ped.id, egg.id) is True
    assert egg.id not in ped.egg_ids


# --- Pedigree detail ---


def test_get_pedigree_detail(fresh_store: Store):
    ped = fresh_store.create_pedigree(display_name="Test")
    ind = fresh_store.create_individual()
    rel = fresh_store.create_relationship(members=[])
    egg = fresh_store.create_egg()
    fresh_store.add_individual_to_pedigree(ped.id, ind.id)
    fresh_store.add_relationship_to_pedigree(ped.id, rel.id)
    fresh_store.add_egg_to_pedigree(ped.id, egg.id)

    detail = fresh_store.get_pedigree_detail(ped.id)
    assert detail is not None
    assert detail.display_name == "Test"
    assert len(detail.individuals) == 1
    assert detail.individuals[0].id == ind.id
    assert len(detail.relationships) == 1
    assert detail.relationships[0].id == rel.id
    assert len(detail.eggs) == 1
    assert detail.eggs[0].id == egg.id


def test_get_pedigree_detail_not_found(fresh_store: Store):
    assert fresh_store.get_pedigree_detail(uuid.uuid4()) is None


def test_get_pedigree_detail_skips_deleted_entities(fresh_store: Store):
    ped = fresh_store.create_pedigree()
    ind = fresh_store.create_individual()
    fresh_store.add_individual_to_pedigree(ped.id, ind.id)
    fresh_store.delete_individual(ind.id)
    detail = fresh_store.get_pedigree_detail(ped.id)
    assert len(detail.individuals) == 0


# --- Events ---


def test_add_event_to_individual(fresh_store: Store):
    ind = fresh_store.create_individual()
    ev = Event(type="birth")
    result = fresh_store.add_event(ind.id, ev)
    assert result is ev
    assert ev in ind.events


def test_add_event_to_relationship(fresh_store: Store):
    rel = fresh_store.create_relationship(members=[])
    ev = Event(type="marriage")
    result = fresh_store.add_event(rel.id, ev)
    assert result is ev
    assert ev in rel.events


def test_add_event_to_egg(fresh_store: Store):
    egg = fresh_store.create_egg()
    ev = Event(type="retrieval")
    result = fresh_store.add_event(egg.id, ev)
    assert result is ev
    assert ev in egg.events


def test_add_event_to_pedigree(fresh_store: Store):
    ped = fresh_store.create_pedigree()
    ev = Event(type="note")
    result = fresh_store.add_event(ped.id, ev)
    assert result is ev
    assert ev in ped.events


def test_add_event_bad_entity(fresh_store: Store):
    ev = Event(type="birth")
    assert fresh_store.add_event(uuid.uuid4(), ev) is None


def test_get_event(fresh_store: Store):
    ind = fresh_store.create_individual()
    ev = Event(type="birth")
    fresh_store.add_event(ind.id, ev)
    found = fresh_store.get_event(ev.id)
    assert found is ev


def test_get_event_not_found(fresh_store: Store):
    assert fresh_store.get_event(uuid.uuid4()) is None


def test_update_event(fresh_store: Store):
    ind = fresh_store.create_individual()
    ev = Event(type="birth")
    fresh_store.add_event(ind.id, ev)
    updated = fresh_store.update_event(ev.id, type="death", date="2024-12-31")
    assert updated is ev
    assert ev.type == "death"
    assert ev.date == "2024-12-31"


def test_update_event_display_name(fresh_store: Store):
    ind = fresh_store.create_individual()
    ev = Event(type="birth")
    fresh_store.add_event(ind.id, ev)
    fresh_store.update_event(ev.id, display_name="Birth of child")
    assert ev.display_name == "Birth of child"


def test_update_event_partial(fresh_store: Store):
    ind = fresh_store.create_individual()
    ev = Event(type="birth", date="2024-01-01")
    fresh_store.add_event(ind.id, ev)
    fresh_store.update_event(ev.id, date="2024-06-15")
    assert ev.type == "birth"  # unchanged
    assert ev.date == "2024-06-15"


def test_update_event_not_found(fresh_store: Store):
    assert fresh_store.update_event(uuid.uuid4(), type="birth") is None


def test_delete_event(fresh_store: Store):
    ind = fresh_store.create_individual()
    ev = Event(type="birth")
    fresh_store.add_event(ind.id, ev)
    assert fresh_store.delete_event(ev.id) is True
    assert fresh_store.get_event(ev.id) is None
    assert len(ind.events) == 0


def test_delete_event_not_found(fresh_store: Store):
    assert fresh_store.delete_event(uuid.uuid4()) is False


def test_delete_event_rebuilds_index(fresh_store: Store):
    ind = fresh_store.create_individual()
    ev1 = Event(type="birth")
    ev2 = Event(type="death")
    ev3 = Event(type="diagnosis")
    fresh_store.add_event(ind.id, ev1)
    fresh_store.add_event(ind.id, ev2)
    fresh_store.add_event(ind.id, ev3)
    # Delete the middle event
    fresh_store.delete_event(ev2.id)
    # ev1 and ev3 should still be accessible
    assert fresh_store.get_event(ev1.id) is ev1
    assert fresh_store.get_event(ev3.id) is ev3
    assert fresh_store.get_event(ev2.id) is None


def test_event_index_consistency_after_multiple_cycles(fresh_store: Store):
    ind = fresh_store.create_individual()
    events = []
    for i in range(5):
        ev = Event(type=f"type_{i}")
        fresh_store.add_event(ind.id, ev)
        events.append(ev)
    # Delete events 0, 2, 4
    for i in [0, 2, 4]:
        fresh_store.delete_event(events[i].id)
    # Remaining: events 1 and 3
    assert fresh_store.get_event(events[1].id) is events[1]
    assert fresh_store.get_event(events[3].id) is events[3]
    assert len(ind.events) == 2
    # Add a new event and verify the index works
    new_ev = Event(type="new")
    fresh_store.add_event(ind.id, new_ev)
    assert fresh_store.get_event(new_ev.id) is new_ev
    assert len(ind.events) == 3
