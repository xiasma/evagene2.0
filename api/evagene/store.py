from __future__ import annotations

import uuid
from datetime import datetime, timezone

from .models import (
    Egg, Event, Individual, Pedigree, PedigreeDetail, PersonName, Relationship,
    SmokerType, VCardContact,
)


class Store:
    def __init__(self) -> None:
        self.individuals: dict[uuid.UUID, Individual] = {}
        self.relationships: dict[uuid.UUID, Relationship] = {}
        self.eggs: dict[uuid.UUID, Egg] = {}
        self.pedigrees: dict[uuid.UUID, Pedigree] = {}
        # event_id -> (owner_id, event_index) for fast lookup
        self._event_index: dict[uuid.UUID, tuple[uuid.UUID, int]] = {}

    # --- Individuals ---

    def create_individual(
        self,
        display_name: str = "",
        name: PersonName | None = None,
        biological_sex=None,
        x: float | None = None,
        y: float | None = None,
        notes: str = "",
        proband: float = 0.0,
        proband_text: str = "",
        generation: int | None = None,
        contacts: dict[str, VCardContact] | None = None,
        consent_to_share: bool | None = None,
        height_mm: int | None = None,
        weight_g: int | None = None,
        alcohol_units_per_week: float | None = None,
        smoker: SmokerType | None = None,
        smoking_per_day: int | None = None,
        properties: dict | None = None,
    ) -> Individual:
        ind = Individual(
            display_name=display_name,
            name=name or PersonName(),
            biological_sex=biological_sex,
            x=x,
            y=y,
            notes=notes,
            proband=proband,
            proband_text=proband_text,
            generation=generation,
            contacts=contacts or {},
            consent_to_share=consent_to_share,
            height_mm=height_mm,
            weight_g=weight_g,
            alcohol_units_per_week=alcohol_units_per_week,
            smoker=smoker,
            smoking_per_day=smoking_per_day,
            properties=properties or {},
        )
        self.individuals[ind.id] = ind
        return ind

    def get_individual(self, id: uuid.UUID) -> Individual | None:
        return self.individuals.get(id)

    def list_individuals(self) -> list[Individual]:
        return list(self.individuals.values())

    def update_individual(self, id: uuid.UUID, **fields) -> Individual | None:
        ind = self.individuals.get(id)
        if ind is None:
            return None
        for k, v in fields.items():
            if v is not None:
                setattr(ind, k, v)
        return ind

    def delete_individual(self, id: uuid.UUID) -> bool:
        ind = self.individuals.pop(id, None)
        if ind is None:
            return False
        for ev in ind.events:
            self._event_index.pop(ev.id, None)
        # Remove from any pedigrees
        for ped in self.pedigrees.values():
            if id in ped.individual_ids:
                ped.individual_ids.remove(id)
        return True

    # --- Relationships ---

    def create_relationship(
        self,
        members: list[uuid.UUID] | None = None,
        display_name: str = "",
        notes: str = "",
        properties: dict | None = None,
    ) -> Relationship:
        rel = Relationship(
            members=members or [],
            display_name=display_name,
            notes=notes,
            properties=properties or {},
        )
        self.relationships[rel.id] = rel
        return rel

    def get_relationship(self, id: uuid.UUID) -> Relationship | None:
        return self.relationships.get(id)

    def list_relationships(self) -> list[Relationship]:
        return list(self.relationships.values())

    def delete_relationship(self, id: uuid.UUID) -> bool:
        rel = self.relationships.pop(id, None)
        if rel is None:
            return False
        for ev in rel.events:
            self._event_index.pop(ev.id, None)
        # Remove from any pedigrees
        for ped in self.pedigrees.values():
            if id in ped.relationship_ids:
                ped.relationship_ids.remove(id)
        return True

    def add_member(self, rel_id: uuid.UUID, ind_id: uuid.UUID) -> bool:
        rel = self.relationships.get(rel_id)
        if rel is None:
            return False
        if ind_id not in rel.members:
            rel.members.append(ind_id)
        return True

    def remove_member(self, rel_id: uuid.UUID, ind_id: uuid.UUID) -> bool:
        rel = self.relationships.get(rel_id)
        if rel is None or ind_id not in rel.members:
            return False
        rel.members.remove(ind_id)
        return True

    # --- Eggs ---

    def create_egg(
        self,
        display_name: str = "",
        notes: str = "",
        properties: dict | None = None,
        individual_id: uuid.UUID | None = None,
        relationship_id: uuid.UUID | None = None,
    ) -> Egg:
        egg = Egg(
            display_name=display_name,
            notes=notes,
            properties=properties or {},
            individual_id=individual_id,
            relationship_id=relationship_id,
        )
        self.eggs[egg.id] = egg
        return egg

    def get_egg(self, id: uuid.UUID) -> Egg | None:
        return self.eggs.get(id)

    def list_eggs(self) -> list[Egg]:
        return list(self.eggs.values())

    def update_egg(self, id: uuid.UUID, **fields) -> Egg | None:
        egg = self.eggs.get(id)
        if egg is None:
            return None
        for k, v in fields.items():
            if v is not None:
                setattr(egg, k, v)
        return egg

    def delete_egg(self, id: uuid.UUID) -> bool:
        egg = self.eggs.pop(id, None)
        if egg is None:
            return False
        for ev in egg.events:
            self._event_index.pop(ev.id, None)
        # Remove from any pedigrees
        for ped in self.pedigrees.values():
            if id in ped.egg_ids:
                ped.egg_ids.remove(id)
        return True

    # --- Pedigrees ---

    def create_pedigree(
        self,
        display_name: str = "",
        date_represented: str | None = None,
        owner: str = "",
        notes: str = "",
        properties: dict | None = None,
    ) -> Pedigree:
        now = datetime.now(timezone.utc).isoformat()
        ped = Pedigree(
            display_name=display_name,
            date_represented=date_represented,
            owner=owner,
            notes=notes,
            properties=properties or {},
            created_at=now,
            updated_at=now,
        )
        self.pedigrees[ped.id] = ped
        return ped

    def get_pedigree(self, id: uuid.UUID) -> Pedigree | None:
        return self.pedigrees.get(id)

    def list_pedigrees(self) -> list[Pedigree]:
        return list(self.pedigrees.values())

    def update_pedigree(self, id: uuid.UUID, **fields) -> Pedigree | None:
        ped = self.pedigrees.get(id)
        if ped is None:
            return None
        for k, v in fields.items():
            if v is not None:
                setattr(ped, k, v)
        ped.updated_at = datetime.now(timezone.utc).isoformat()
        return ped

    def delete_pedigree(self, id: uuid.UUID) -> bool:
        ped = self.pedigrees.pop(id, None)
        if ped is None:
            return False
        for ev in ped.events:
            self._event_index.pop(ev.id, None)
        return True

    def add_individual_to_pedigree(self, ped_id: uuid.UUID, ind_id: uuid.UUID) -> bool:
        ped = self.pedigrees.get(ped_id)
        if ped is None:
            return False
        if ind_id not in ped.individual_ids:
            ped.individual_ids.append(ind_id)
        return True

    def remove_individual_from_pedigree(self, ped_id: uuid.UUID, ind_id: uuid.UUID) -> bool:
        ped = self.pedigrees.get(ped_id)
        if ped is None or ind_id not in ped.individual_ids:
            return False
        ped.individual_ids.remove(ind_id)
        return True

    def add_relationship_to_pedigree(self, ped_id: uuid.UUID, rel_id: uuid.UUID) -> bool:
        ped = self.pedigrees.get(ped_id)
        if ped is None:
            return False
        if rel_id not in ped.relationship_ids:
            ped.relationship_ids.append(rel_id)
        return True

    def remove_relationship_from_pedigree(self, ped_id: uuid.UUID, rel_id: uuid.UUID) -> bool:
        ped = self.pedigrees.get(ped_id)
        if ped is None or rel_id not in ped.relationship_ids:
            return False
        ped.relationship_ids.remove(rel_id)
        return True

    def add_egg_to_pedigree(self, ped_id: uuid.UUID, egg_id: uuid.UUID) -> bool:
        ped = self.pedigrees.get(ped_id)
        if ped is None:
            return False
        if egg_id not in ped.egg_ids:
            ped.egg_ids.append(egg_id)
        return True

    def remove_egg_from_pedigree(self, ped_id: uuid.UUID, egg_id: uuid.UUID) -> bool:
        ped = self.pedigrees.get(ped_id)
        if ped is None or egg_id not in ped.egg_ids:
            return False
        ped.egg_ids.remove(egg_id)
        return True

    def restore_pedigree_snapshot(
        self,
        ped_id: uuid.UUID,
        snapshot_individuals: list[Individual],
        snapshot_relationships: list[Relationship],
        snapshot_eggs: list[Egg],
    ) -> bool:
        ped = self.pedigrees.get(ped_id)
        if ped is None:
            return False

        # Remove all existing entities belonging to this pedigree
        for iid in list(ped.individual_ids):
            ind = self.individuals.pop(iid, None)
            if ind:
                for ev in ind.events:
                    self._event_index.pop(ev.id, None)
        for rid in list(ped.relationship_ids):
            rel = self.relationships.pop(rid, None)
            if rel:
                for ev in rel.events:
                    self._event_index.pop(ev.id, None)
        for eid in list(ped.egg_ids):
            egg = self.eggs.pop(eid, None)
            if egg:
                for ev in egg.events:
                    self._event_index.pop(ev.id, None)

        # Insert all entities from snapshot
        ped.individual_ids = []
        for ind in snapshot_individuals:
            self.individuals[ind.id] = ind
            ped.individual_ids.append(ind.id)
            for i, ev in enumerate(ind.events):
                self._event_index[ev.id] = (ind.id, i)

        ped.relationship_ids = []
        for rel in snapshot_relationships:
            self.relationships[rel.id] = rel
            ped.relationship_ids.append(rel.id)
            for i, ev in enumerate(rel.events):
                self._event_index[ev.id] = (rel.id, i)

        ped.egg_ids = []
        for egg in snapshot_eggs:
            self.eggs[egg.id] = egg
            ped.egg_ids.append(egg.id)
            for i, ev in enumerate(egg.events):
                self._event_index[ev.id] = (egg.id, i)

        return True

    def get_pedigree_detail(self, id: uuid.UUID) -> PedigreeDetail | None:
        ped = self.pedigrees.get(id)
        if ped is None:
            return None
        individuals = [
            self.individuals[iid]
            for iid in ped.individual_ids
            if iid in self.individuals
        ]
        relationships = [
            self.relationships[rid]
            for rid in ped.relationship_ids
            if rid in self.relationships
        ]
        eggs = [
            self.eggs[eid]
            for eid in ped.egg_ids
            if eid in self.eggs
        ]
        return PedigreeDetail(
            **ped.model_dump(),
            individuals=individuals,
            relationships=relationships,
            eggs=eggs,
        )

    # --- Events ---

    def _get_entity(self, entity_id: uuid.UUID):
        return (
            self.individuals.get(entity_id)
            or self.relationships.get(entity_id)
            or self.eggs.get(entity_id)
            or self.pedigrees.get(entity_id)
        )

    def add_event(self, entity_id: uuid.UUID, event: Event) -> Event | None:
        entity = self._get_entity(entity_id)
        if entity is None:
            return None
        entity.events.append(event)
        self._event_index[event.id] = (entity_id, len(entity.events) - 1)
        return event

    def get_event(self, event_id: uuid.UUID) -> Event | None:
        loc = self._event_index.get(event_id)
        if loc is None:
            return None
        entity_id, idx = loc
        entity = self._get_entity(entity_id)
        if entity is None or idx >= len(entity.events):
            return None
        ev = entity.events[idx]
        if ev.id == event_id:
            return ev
        # index drifted — linear scan
        for e in entity.events:
            if e.id == event_id:
                return e
        return None

    def update_event(self, event_id: uuid.UUID, **fields) -> Event | None:
        ev = self.get_event(event_id)
        if ev is None:
            return None
        for k, v in fields.items():
            if v is not None:
                setattr(ev, k, v)
        return ev

    def delete_event(self, event_id: uuid.UUID) -> bool:
        loc = self._event_index.pop(event_id, None)
        if loc is None:
            return False
        entity_id, _ = loc
        entity = self._get_entity(entity_id)
        if entity is None:
            return False
        entity.events = [e for e in entity.events if e.id != event_id]
        # rebuild indices for remaining events on this entity
        for i, e in enumerate(entity.events):
            self._event_index[e.id] = (entity_id, i)
        return True


store = Store()
