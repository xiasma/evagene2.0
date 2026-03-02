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
