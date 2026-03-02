from __future__ import annotations

from unittest.mock import patch

import pytest
from starlette.testclient import TestClient

from evagene.main import app
from evagene.store import Store


@pytest.fixture(autouse=True)
def fresh_store():
    """Replace the global store singleton with a fresh instance for every test."""
    s = Store()
    with (
        patch("evagene.store.store", s),
        patch("evagene.routers.individuals.store", s),
        patch("evagene.routers.relationships.store", s),
        patch("evagene.routers.events.store", s),
        patch("evagene.routers.pedigrees.store", s),
        patch("evagene.routers.eggs.store", s),
    ):
        yield s


@pytest.fixture()
def client():
    return TestClient(app)
