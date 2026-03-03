from __future__ import annotations

import uuid

from starlette.testclient import TestClient


def test_create_egg(client: TestClient):
    resp = client.post("/api/eggs", json={})
    assert resp.status_code == 201
    data = resp.json()
    assert "id" in data
    assert data["display_name"] == ""
    assert data["properties"] == {}
    assert data["individual_id"] is None
    assert data["events"] == []


def test_create_egg_with_fields(client: TestClient):
    ind = client.post("/api/individuals").json()
    resp = client.post(
        "/api/eggs",
        json={
            "display_name": "Egg 1",
            "properties": {"frozen": True},
            "individual_id": ind["id"],
        },
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["display_name"] == "Egg 1"
    assert data["properties"] == {"frozen": True}
    assert data["individual_id"] == ind["id"]


def test_list_eggs(client: TestClient):
    client.post("/api/eggs", json={})
    client.post("/api/eggs", json={})
    resp = client.get("/api/eggs")
    assert resp.status_code == 200
    assert len(resp.json()) == 2


def test_get_egg(client: TestClient):
    created = client.post("/api/eggs", json={}).json()
    resp = client.get(f"/api/eggs/{created['id']}")
    assert resp.status_code == 200
    assert resp.json()["id"] == created["id"]


def test_get_egg_not_found(client: TestClient):
    resp = client.get(f"/api/eggs/{uuid.uuid4()}")
    assert resp.status_code == 404


def test_delete_egg(client: TestClient):
    created = client.post("/api/eggs", json={}).json()
    resp = client.delete(f"/api/eggs/{created['id']}")
    assert resp.status_code == 204
    # Verify it's gone
    resp = client.get(f"/api/eggs/{created['id']}")
    assert resp.status_code == 404


def test_delete_egg_not_found(client: TestClient):
    resp = client.delete(f"/api/eggs/{uuid.uuid4()}")
    assert resp.status_code == 404


def test_add_event_to_egg(client: TestClient):
    egg = client.post("/api/eggs", json={}).json()
    resp = client.post(
        f"/api/eggs/{egg['id']}/events",
        json={"type": "retrieval", "display_name": "Egg retrieval"},
    )
    assert resp.status_code == 201
    ev = resp.json()
    assert ev["type"] == "retrieval"
    assert ev["display_name"] == "Egg retrieval"
    # Verify on the egg
    updated = client.get(f"/api/eggs/{egg['id']}").json()
    assert len(updated["events"]) == 1


def test_add_event_to_egg_not_found(client: TestClient):
    resp = client.post(
        f"/api/eggs/{uuid.uuid4()}/events",
        json={"type": "retrieval"},
    )
    assert resp.status_code == 404


def test_create_egg_with_notes(client: TestClient):
    resp = client.post(
        "/api/eggs",
        json={"notes": "Frozen 2023"},
    )
    assert resp.status_code == 201
    assert resp.json()["notes"] == "Frozen 2023"


def test_create_egg_with_relationship_id(client: TestClient):
    rel = client.post("/api/relationships", json={"members": []}).json()
    resp = client.post(
        "/api/eggs",
        json={"relationship_id": rel["id"]},
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["relationship_id"] == rel["id"]
