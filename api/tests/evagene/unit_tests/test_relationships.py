from __future__ import annotations

import uuid

from starlette.testclient import TestClient


def test_create_relationship(client: TestClient):
    resp = client.post("/api/relationships", json={"members": []})
    assert resp.status_code == 201
    data = resp.json()
    assert "id" in data
    assert data["members"] == []
    assert data["events"] == []
    assert data["display_name"] == ""
    assert data["properties"] == {}


def test_create_relationship_with_fields(client: TestClient):
    ind1 = client.post("/api/individuals").json()
    ind2 = client.post("/api/individuals").json()
    resp = client.post(
        "/api/relationships",
        json={
            "members": [ind1["id"], ind2["id"]],
            "display_name": "Couple A",
            "properties": {"type": "married"},
        },
    )
    assert resp.status_code == 201
    data = resp.json()
    assert len(data["members"]) == 2
    assert data["display_name"] == "Couple A"
    assert data["properties"] == {"type": "married"}


def test_list_relationships(client: TestClient):
    client.post("/api/relationships", json={"members": []})
    client.post("/api/relationships", json={"members": []})
    resp = client.get("/api/relationships")
    assert resp.status_code == 200
    assert len(resp.json()) == 2


def test_get_relationship(client: TestClient):
    created = client.post("/api/relationships", json={"members": []}).json()
    resp = client.get(f"/api/relationships/{created['id']}")
    assert resp.status_code == 200
    assert resp.json()["id"] == created["id"]


def test_get_relationship_not_found(client: TestClient):
    resp = client.get(f"/api/relationships/{uuid.uuid4()}")
    assert resp.status_code == 404


def test_delete_relationship(client: TestClient):
    created = client.post("/api/relationships", json={"members": []}).json()
    resp = client.delete(f"/api/relationships/{created['id']}")
    assert resp.status_code == 204


def test_delete_relationship_not_found(client: TestClient):
    resp = client.delete(f"/api/relationships/{uuid.uuid4()}")
    assert resp.status_code == 404


def test_add_member(client: TestClient):
    rel = client.post("/api/relationships", json={"members": []}).json()
    ind = client.post("/api/individuals").json()
    resp = client.post(f"/api/relationships/{rel['id']}/members/{ind['id']}")
    assert resp.status_code == 204
    # Verify member was added
    updated = client.get(f"/api/relationships/{rel['id']}").json()
    assert ind["id"] in updated["members"]


def test_remove_member(client: TestClient):
    ind = client.post("/api/individuals").json()
    rel = client.post(
        "/api/relationships", json={"members": [ind["id"]]}
    ).json()
    resp = client.delete(f"/api/relationships/{rel['id']}/members/{ind['id']}")
    assert resp.status_code == 204
    updated = client.get(f"/api/relationships/{rel['id']}").json()
    assert ind["id"] not in updated["members"]


def test_remove_member_not_found(client: TestClient):
    rel = client.post("/api/relationships", json={"members": []}).json()
    resp = client.delete(f"/api/relationships/{rel['id']}/members/{uuid.uuid4()}")
    assert resp.status_code == 404


def test_add_event_to_relationship(client: TestClient):
    rel = client.post("/api/relationships", json={"members": []}).json()
    resp = client.post(
        f"/api/relationships/{rel['id']}/events",
        json={"type": "marriage", "date": "2024-06-15"},
    )
    assert resp.status_code == 201
    ev = resp.json()
    assert ev["type"] == "marriage"
    # Verify it's on the relationship
    updated = client.get(f"/api/relationships/{rel['id']}").json()
    assert len(updated["events"]) == 1


def test_add_event_with_display_name(client: TestClient):
    rel = client.post("/api/relationships", json={"members": []}).json()
    resp = client.post(
        f"/api/relationships/{rel['id']}/events",
        json={"type": "marriage", "display_name": "Wedding ceremony"},
    )
    assert resp.status_code == 201
    assert resp.json()["display_name"] == "Wedding ceremony"


def test_add_event_rejects_invalid_type(client: TestClient):
    rel = client.post("/api/relationships", json={"members": []}).json()
    resp = client.post(
        f"/api/relationships/{rel['id']}/events",
        json={"type": "birth"},  # not a valid RelationshipEventType
    )
    assert resp.status_code == 422


def test_create_relationship_with_notes(client: TestClient):
    resp = client.post(
        "/api/relationships",
        json={"members": [], "notes": "Separated in 2020"},
    )
    assert resp.status_code == 201
    assert resp.json()["notes"] == "Separated in 2020"


# --- Offspring endpoint ---


def test_add_offspring(client: TestClient):
    # Create two parents and a child
    parent1 = client.post("/api/individuals").json()
    parent2 = client.post("/api/individuals").json()
    child = client.post("/api/individuals").json()
    rel = client.post(
        "/api/relationships",
        json={"members": [parent1["id"], parent2["id"]]},
    ).json()
    ped = client.post("/api/pedigrees", json={"display_name": "Test"}).json()
    # Add entities to pedigree
    client.post(f"/api/pedigrees/{ped['id']}/individuals/{child['id']}")
    client.post(f"/api/pedigrees/{ped['id']}/relationships/{rel['id']}")

    resp = client.post(
        f"/api/relationships/{rel['id']}/offspring",
        json={"individual_id": child["id"], "pedigree_id": ped["id"]},
    )
    assert resp.status_code == 201
    data = resp.json()

    # Verify pregnancy event
    assert data["pregnancy_event"]["type"] == "pregnancy"
    assert len(data["pregnancy_event"]["entity_references"]) == 1
    ref = data["pregnancy_event"]["entity_references"][0]
    assert ref["entity_type"] == "egg"
    assert ref["role"] == "offspring"

    # Verify egg
    assert data["egg"]["individual_id"] == child["id"]
    assert data["egg"]["relationship_id"] == rel["id"]

    # Verify pregnancy event is on the relationship
    updated_rel = client.get(f"/api/relationships/{rel['id']}").json()
    pregnancy_events = [e for e in updated_rel["events"] if e["type"] == "pregnancy"]
    assert len(pregnancy_events) == 1

    # Verify egg is in pedigree detail
    detail = client.get(f"/api/pedigrees/{ped['id']}").json()
    egg_ids = [e["id"] for e in detail["eggs"]]
    assert data["egg"]["id"] in egg_ids


def test_add_offspring_relationship_not_found(client: TestClient):
    child = client.post("/api/individuals").json()
    ped = client.post("/api/pedigrees", json={}).json()
    resp = client.post(
        f"/api/relationships/{uuid.uuid4()}/offspring",
        json={"individual_id": child["id"], "pedigree_id": ped["id"]},
    )
    assert resp.status_code == 404
    assert "Relationship" in resp.json()["detail"]


def test_add_offspring_individual_not_found(client: TestClient):
    rel = client.post("/api/relationships", json={"members": []}).json()
    ped = client.post("/api/pedigrees", json={}).json()
    resp = client.post(
        f"/api/relationships/{rel['id']}/offspring",
        json={"individual_id": str(uuid.uuid4()), "pedigree_id": ped["id"]},
    )
    assert resp.status_code == 404
    assert "Individual" in resp.json()["detail"]


def test_add_offspring_pedigree_not_found(client: TestClient):
    ind = client.post("/api/individuals").json()
    rel = client.post("/api/relationships", json={"members": []}).json()
    resp = client.post(
        f"/api/relationships/{rel['id']}/offspring",
        json={"individual_id": ind["id"], "pedigree_id": str(uuid.uuid4())},
    )
    assert resp.status_code == 404
    assert "Pedigree" in resp.json()["detail"]


def test_add_offspring_single_parent(client: TestClient):
    # Single-member relationship (1 parent)
    parent = client.post("/api/individuals").json()
    child = client.post("/api/individuals").json()
    rel = client.post(
        "/api/relationships",
        json={"members": [parent["id"]]},
    ).json()
    ped = client.post("/api/pedigrees", json={}).json()
    client.post(f"/api/pedigrees/{ped['id']}/individuals/{parent['id']}")
    client.post(f"/api/pedigrees/{ped['id']}/individuals/{child['id']}")
    client.post(f"/api/pedigrees/{ped['id']}/relationships/{rel['id']}")

    resp = client.post(
        f"/api/relationships/{rel['id']}/offspring",
        json={"individual_id": child["id"], "pedigree_id": ped["id"]},
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["egg"]["individual_id"] == child["id"]
    assert data["egg"]["relationship_id"] == rel["id"]
    assert len(rel["members"]) == 1  # confirm single parent
