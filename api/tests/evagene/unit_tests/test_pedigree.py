from __future__ import annotations

import uuid

from starlette.testclient import TestClient


def test_create_pedigree(client: TestClient):
    resp = client.post("/api/pedigrees", json={})
    assert resp.status_code == 201
    data = resp.json()
    assert "id" in data
    assert data["display_name"] == ""
    assert data["created_at"] is not None
    assert data["updated_at"] is not None
    assert data["individual_ids"] == []
    assert data["relationship_ids"] == []
    assert data["egg_ids"] == []


def test_create_pedigree_with_fields(client: TestClient):
    resp = client.post(
        "/api/pedigrees",
        json={
            "display_name": "Family A",
            "date_represented": "2024-01-01",
            "owner": "clinic",
            "properties": {"note": "test"},
        },
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["display_name"] == "Family A"
    assert data["date_represented"] == "2024-01-01"
    assert data["owner"] == "clinic"
    assert data["properties"] == {"note": "test"}


def test_list_pedigrees(client: TestClient):
    client.post("/api/pedigrees", json={})
    client.post("/api/pedigrees", json={})
    resp = client.get("/api/pedigrees")
    assert resp.status_code == 200
    assert len(resp.json()) == 2


def test_get_pedigree_detail(client: TestClient):
    ped = client.post("/api/pedigrees", json={"display_name": "Test"}).json()
    ind = client.post("/api/individuals").json()
    rel = client.post("/api/relationships", json={"members": []}).json()
    egg = client.post("/api/eggs", json={}).json()

    client.post(f"/api/pedigrees/{ped['id']}/individuals/{ind['id']}")
    client.post(f"/api/pedigrees/{ped['id']}/relationships/{rel['id']}")
    client.post(f"/api/pedigrees/{ped['id']}/eggs/{egg['id']}")

    resp = client.get(f"/api/pedigrees/{ped['id']}")
    assert resp.status_code == 200
    data = resp.json()
    assert data["display_name"] == "Test"
    assert len(data["individuals"]) == 1
    assert data["individuals"][0]["id"] == ind["id"]
    assert len(data["relationships"]) == 1
    assert data["relationships"][0]["id"] == rel["id"]
    assert len(data["eggs"]) == 1
    assert data["eggs"][0]["id"] == egg["id"]


def test_get_pedigree_not_found(client: TestClient):
    resp = client.get(f"/api/pedigrees/{uuid.uuid4()}")
    assert resp.status_code == 404


def test_update_pedigree(client: TestClient):
    ped = client.post("/api/pedigrees", json={"display_name": "Old"}).json()
    resp = client.patch(
        f"/api/pedigrees/{ped['id']}",
        json={"display_name": "New", "owner": "updated"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["display_name"] == "New"
    assert data["owner"] == "updated"


def test_update_pedigree_not_found(client: TestClient):
    resp = client.patch(
        f"/api/pedigrees/{uuid.uuid4()}",
        json={"display_name": "X"},
    )
    assert resp.status_code == 404


def test_delete_pedigree(client: TestClient):
    ped = client.post("/api/pedigrees", json={}).json()
    resp = client.delete(f"/api/pedigrees/{ped['id']}")
    assert resp.status_code == 204
    # Verify it's gone
    resp = client.get(f"/api/pedigrees/{ped['id']}")
    assert resp.status_code == 404


def test_delete_pedigree_does_not_delete_entities(client: TestClient):
    ped = client.post("/api/pedigrees", json={}).json()
    ind = client.post("/api/individuals").json()
    client.post(f"/api/pedigrees/{ped['id']}/individuals/{ind['id']}")
    client.delete(f"/api/pedigrees/{ped['id']}")
    # Individual still exists
    resp = client.get(f"/api/individuals/{ind['id']}")
    assert resp.status_code == 200


def test_delete_pedigree_not_found(client: TestClient):
    resp = client.delete(f"/api/pedigrees/{uuid.uuid4()}")
    assert resp.status_code == 404


# --- Entity membership ---


def test_add_individual_to_pedigree(client: TestClient):
    ped = client.post("/api/pedigrees", json={}).json()
    ind = client.post("/api/individuals").json()
    resp = client.post(f"/api/pedigrees/{ped['id']}/individuals/{ind['id']}")
    assert resp.status_code == 204
    # Verify via detail
    detail = client.get(f"/api/pedigrees/{ped['id']}").json()
    assert ind["id"] in detail["individual_ids"]
    assert len(detail["individuals"]) == 1


def test_add_individual_to_pedigree_not_found(client: TestClient):
    resp = client.post(f"/api/pedigrees/{uuid.uuid4()}/individuals/{uuid.uuid4()}")
    assert resp.status_code == 404


def test_remove_individual_from_pedigree(client: TestClient):
    ped = client.post("/api/pedigrees", json={}).json()
    ind = client.post("/api/individuals").json()
    client.post(f"/api/pedigrees/{ped['id']}/individuals/{ind['id']}")
    resp = client.delete(f"/api/pedigrees/{ped['id']}/individuals/{ind['id']}")
    assert resp.status_code == 204
    detail = client.get(f"/api/pedigrees/{ped['id']}").json()
    assert len(detail["individuals"]) == 0


def test_add_relationship_to_pedigree(client: TestClient):
    ped = client.post("/api/pedigrees", json={}).json()
    rel = client.post("/api/relationships", json={"members": []}).json()
    resp = client.post(f"/api/pedigrees/{ped['id']}/relationships/{rel['id']}")
    assert resp.status_code == 204


def test_remove_relationship_from_pedigree(client: TestClient):
    ped = client.post("/api/pedigrees", json={}).json()
    rel = client.post("/api/relationships", json={"members": []}).json()
    client.post(f"/api/pedigrees/{ped['id']}/relationships/{rel['id']}")
    resp = client.delete(f"/api/pedigrees/{ped['id']}/relationships/{rel['id']}")
    assert resp.status_code == 204


def test_add_egg_to_pedigree(client: TestClient):
    ped = client.post("/api/pedigrees", json={}).json()
    egg = client.post("/api/eggs", json={}).json()
    resp = client.post(f"/api/pedigrees/{ped['id']}/eggs/{egg['id']}")
    assert resp.status_code == 204


def test_remove_egg_from_pedigree(client: TestClient):
    ped = client.post("/api/pedigrees", json={}).json()
    egg = client.post("/api/eggs", json={}).json()
    client.post(f"/api/pedigrees/{ped['id']}/eggs/{egg['id']}")
    resp = client.delete(f"/api/pedigrees/{ped['id']}/eggs/{egg['id']}")
    assert resp.status_code == 204


# --- Entity belongs to multiple pedigrees ---


def test_entity_in_multiple_pedigrees(client: TestClient):
    ped1 = client.post("/api/pedigrees", json={}).json()
    ped2 = client.post("/api/pedigrees", json={}).json()
    ind = client.post("/api/individuals").json()
    client.post(f"/api/pedigrees/{ped1['id']}/individuals/{ind['id']}")
    client.post(f"/api/pedigrees/{ped2['id']}/individuals/{ind['id']}")
    detail1 = client.get(f"/api/pedigrees/{ped1['id']}").json()
    detail2 = client.get(f"/api/pedigrees/{ped2['id']}").json()
    assert len(detail1["individuals"]) == 1
    assert len(detail2["individuals"]) == 1


# --- Pedigree events ---


def test_add_event_to_pedigree(client: TestClient):
    ped = client.post("/api/pedigrees", json={}).json()
    resp = client.post(
        f"/api/pedigrees/{ped['id']}/events",
        json={"type": "note", "display_name": "Family note"},
    )
    assert resp.status_code == 201
    ev = resp.json()
    assert ev["type"] == "note"
    assert ev["display_name"] == "Family note"
    # Verify on the pedigree detail
    detail = client.get(f"/api/pedigrees/{ped['id']}").json()
    assert len(detail["events"]) == 1


def test_create_pedigree_with_notes(client: TestClient):
    resp = client.post(
        "/api/pedigrees",
        json={"notes": "Family history note"},
    )
    assert resp.status_code == 201
    assert resp.json()["notes"] == "Family history note"
