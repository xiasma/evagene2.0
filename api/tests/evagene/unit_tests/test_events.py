from __future__ import annotations

import uuid

from starlette.testclient import TestClient


def _create_individual_with_event(client: TestClient, event_type: str = "birth") -> dict:
    """Helper: create an individual, add an event, return the event JSON."""
    ind = client.post("/api/individuals").json()
    ev = client.post(
        f"/api/individuals/{ind['id']}/events",
        json={"type": event_type},
    ).json()
    return ev


def test_get_event(client: TestClient):
    ev = _create_individual_with_event(client)
    resp = client.get(f"/api/events/{ev['id']}")
    assert resp.status_code == 200
    assert resp.json()["id"] == ev["id"]


def test_get_event_not_found(client: TestClient):
    resp = client.get(f"/api/events/{uuid.uuid4()}")
    assert resp.status_code == 404


def test_patch_event(client: TestClient):
    ev = _create_individual_with_event(client)
    resp = client.patch(
        f"/api/events/{ev['id']}",
        json={"type": "death", "date": "2024-12-31"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["type"] == "death"
    assert data["date"] == "2024-12-31"


def test_patch_event_display_name(client: TestClient):
    ev = _create_individual_with_event(client)
    resp = client.patch(
        f"/api/events/{ev['id']}",
        json={"display_name": "Updated name"},
    )
    assert resp.status_code == 200
    assert resp.json()["display_name"] == "Updated name"


def test_patch_event_partial(client: TestClient):
    ev = _create_individual_with_event(client)
    resp = client.patch(
        f"/api/events/{ev['id']}",
        json={"date": "2024-06-01"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["type"] == "birth"  # unchanged
    assert data["date"] == "2024-06-01"


def test_patch_event_not_found(client: TestClient):
    resp = client.patch(
        f"/api/events/{uuid.uuid4()}",
        json={"type": "death"},
    )
    assert resp.status_code == 404


def test_delete_event(client: TestClient):
    ev = _create_individual_with_event(client)
    resp = client.delete(f"/api/events/{ev['id']}")
    assert resp.status_code == 204


def test_delete_event_not_found(client: TestClient):
    resp = client.delete(f"/api/events/{uuid.uuid4()}")
    assert resp.status_code == 404


def test_add_reference(client: TestClient):
    ev = _create_individual_with_event(client)
    ref_id = str(uuid.uuid4())
    resp = client.post(
        f"/api/events/{ev['id']}/references",
        json={"entity_id": ref_id, "entity_type": "individual", "role": "child"},
    )
    assert resp.status_code == 201
    data = resp.json()
    assert len(data["entity_references"]) == 1
    assert data["entity_references"][0]["role"] == "child"


def test_add_multiple_references(client: TestClient):
    ev = _create_individual_with_event(client)
    for role in ["child", "parent"]:
        client.post(
            f"/api/events/{ev['id']}/references",
            json={"entity_id": str(uuid.uuid4()), "entity_type": "individual", "role": role},
        )
    resp = client.get(f"/api/events/{ev['id']}")
    assert len(resp.json()["entity_references"]) == 2


def test_remove_reference(client: TestClient):
    ev = _create_individual_with_event(client)
    client.post(
        f"/api/events/{ev['id']}/references",
        json={"entity_id": str(uuid.uuid4()), "entity_type": "individual", "role": "child"},
    )
    resp = client.delete(f"/api/events/{ev['id']}/references/0")
    assert resp.status_code == 200
    assert len(resp.json()["entity_references"]) == 0


def test_remove_reference_bad_index(client: TestClient):
    ev = _create_individual_with_event(client)
    resp = client.delete(f"/api/events/{ev['id']}/references/99")
    assert resp.status_code == 404
