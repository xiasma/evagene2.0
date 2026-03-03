from __future__ import annotations

import uuid

from starlette.testclient import TestClient


def test_create_individual(client: TestClient):
    resp = client.post("/api/individuals")
    assert resp.status_code == 201
    data = resp.json()
    assert "id" in data
    assert data["events"] == []
    assert data["display_name"] == ""
    assert data["properties"] == {}
    assert data["biological_sex"] is None


def test_create_individual_with_fields(client: TestClient):
    resp = client.post(
        "/api/individuals",
        json={
            "display_name": "Jane",
            "name": {"full": "Jane Doe", "given": ["Jane"], "family": "Doe"},
            "biological_sex": "female",
            "properties": {"note": "test"},
        },
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["display_name"] == "Jane"
    assert data["name"]["full"] == "Jane Doe"
    assert data["biological_sex"] == "female"
    assert data["properties"] == {"note": "test"}


def test_create_individual_with_new_fields(client: TestClient):
    resp = client.post(
        "/api/individuals",
        json={
            "notes": "Patient note",
            "proband": 90.0,
            "proband_text": "arrow",
            "generation": 2,
            "contacts": {
                "doctor": {
                    "fn": "Dr. Smith",
                    "properties": {"practice_name": "Test Clinic"},
                },
            },
            "consent_to_share": True,
            "height_mm": 1750,
            "weight_g": 70000,
            "alcohol_units_per_week": 5.5,
            "smoker": "cigarette",
            "smoking_per_day": 10,
        },
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["notes"] == "Patient note"
    assert data["proband"] == 90.0
    assert data["proband_text"] == "arrow"
    assert data["generation"] == 2
    assert data["contacts"]["doctor"]["fn"] == "Dr. Smith"
    assert data["consent_to_share"] is True
    assert data["height_mm"] == 1750
    assert data["weight_g"] == 70000
    assert data["alcohol_units_per_week"] == 5.5
    assert data["smoker"] == "cigarette"
    assert data["smoking_per_day"] == 10


def test_list_individuals(client: TestClient):
    client.post("/api/individuals")
    client.post("/api/individuals")
    resp = client.get("/api/individuals")
    assert resp.status_code == 200
    assert len(resp.json()) == 2


def test_get_individual(client: TestClient):
    created = client.post("/api/individuals").json()
    resp = client.get(f"/api/individuals/{created['id']}")
    assert resp.status_code == 200
    assert resp.json()["id"] == created["id"]


def test_get_individual_not_found(client: TestClient):
    resp = client.get(f"/api/individuals/{uuid.uuid4()}")
    assert resp.status_code == 404


def test_delete_individual(client: TestClient):
    created = client.post("/api/individuals").json()
    resp = client.delete(f"/api/individuals/{created['id']}")
    assert resp.status_code == 204


def test_delete_individual_not_found(client: TestClient):
    resp = client.delete(f"/api/individuals/{uuid.uuid4()}")
    assert resp.status_code == 404


def test_add_event_to_individual(client: TestClient):
    ind = client.post("/api/individuals").json()
    resp = client.post(
        f"/api/individuals/{ind['id']}/events",
        json={"type": "birth", "date": "2024-01-01"},
    )
    assert resp.status_code == 201
    ev = resp.json()
    assert ev["type"] == "birth"
    assert ev["date"] == "2024-01-01"
    # Verify the event is on the individual
    ind_resp = client.get(f"/api/individuals/{ind['id']}").json()
    assert len(ind_resp["events"]) == 1


def test_add_event_with_display_name(client: TestClient):
    ind = client.post("/api/individuals").json()
    resp = client.post(
        f"/api/individuals/{ind['id']}/events",
        json={"type": "birth", "display_name": "Birth of Jane"},
    )
    assert resp.status_code == 201
    assert resp.json()["display_name"] == "Birth of Jane"


def test_create_individual_with_coordinates(client: TestClient):
    resp = client.post(
        "/api/individuals",
        json={"biological_sex": "female", "x": 150.5, "y": 200.0},
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["biological_sex"] == "female"
    assert data["x"] == 150.5
    assert data["y"] == 200.0


def test_create_individual_without_coordinates(client: TestClient):
    resp = client.post("/api/individuals", json={"biological_sex": "male"})
    assert resp.status_code == 201
    data = resp.json()
    assert data["x"] is None
    assert data["y"] is None


def test_patch_individual_coordinates(client: TestClient):
    created = client.post(
        "/api/individuals",
        json={"biological_sex": "female", "x": 10.0, "y": 20.0},
    ).json()
    resp = client.patch(
        f"/api/individuals/{created['id']}",
        json={"x": 100.0, "y": 200.0},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["x"] == 100.0
    assert data["y"] == 200.0
    assert data["biological_sex"] == "female"  # unchanged


def test_patch_individual_new_fields(client: TestClient):
    created = client.post("/api/individuals").json()
    resp = client.patch(
        f"/api/individuals/{created['id']}",
        json={
            "notes": "Updated note",
            "proband": 180.0,
            "height_mm": 1800,
            "smoker": "vape",
        },
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["notes"] == "Updated note"
    assert data["proband"] == 180.0
    assert data["height_mm"] == 1800
    assert data["smoker"] == "vape"


def test_patch_individual_not_found(client: TestClient):
    resp = client.patch(
        f"/api/individuals/{uuid.uuid4()}",
        json={"x": 1.0},
    )
    assert resp.status_code == 404


def test_add_event_rejects_invalid_type(client: TestClient):
    ind = client.post("/api/individuals").json()
    resp = client.post(
        f"/api/individuals/{ind['id']}/events",
        json={"type": "marriage"},  # not a valid IndividualEventType
    )
    assert resp.status_code == 422


def test_proband_out_of_range_rejected(client: TestClient):
    resp = client.post(
        "/api/individuals",
        json={"proband": -1.0},
    )
    assert resp.status_code == 422

    resp2 = client.post(
        "/api/individuals",
        json={"proband": 361.0},
    )
    assert resp2.status_code == 422


def test_affection_event(client: TestClient):
    ind = client.post("/api/individuals").json()
    resp = client.post(
        f"/api/individuals/{ind['id']}/events",
        json={
            "type": "affection",
            "properties": {"status": "affected"},
        },
    )
    assert resp.status_code == 201
    assert resp.json()["type"] == "affection"
    assert resp.json()["properties"]["status"] == "affected"


def test_fertility_event(client: TestClient):
    ind = client.post("/api/individuals").json()
    resp = client.post(
        f"/api/individuals/{ind['id']}/events",
        json={
            "type": "fertility",
            "properties": {"status": "infertile"},
        },
    )
    assert resp.status_code == 201
    assert resp.json()["type"] == "fertility"


def test_death_event_with_status(client: TestClient):
    ind = client.post("/api/individuals").json()
    resp = client.post(
        f"/api/individuals/{ind['id']}/events",
        json={
            "type": "death",
            "date": "2024-06-01",
            "properties": {"status": "dead"},
        },
    )
    assert resp.status_code == 201
    ev = resp.json()
    assert ev["type"] == "death"
    assert ev["properties"]["status"] == "dead"
