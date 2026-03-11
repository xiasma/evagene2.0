from __future__ import annotations

import uuid
from datetime import datetime, timezone

from .models import (
    Chromosome, ChromosomeSource, Disease, Egg, Event, Individual,
    IndividualDisease, IndividualMarker, Manifestation, Marker, Pedigree,
    PedigreeDetail, PersonName, Relationship, Species, SmokerType, VCardContact,
)


class Store:
    def __init__(self) -> None:
        self.individuals: dict[uuid.UUID, Individual] = {}
        self.relationships: dict[uuid.UUID, Relationship] = {}
        self.eggs: dict[uuid.UUID, Egg] = {}
        self.pedigrees: dict[uuid.UUID, Pedigree] = {}
        self.species: dict[uuid.UUID, Species] = {}
        self.chromosomes: dict[uuid.UUID, Chromosome] = {}
        self.markers: dict[uuid.UUID, Marker] = {}
        self.diseases: dict[uuid.UUID, Disease] = {}
        # event_id -> (owner_id, event_index) for fast lookup
        self._event_index: dict[uuid.UUID, tuple[uuid.UUID, int]] = {}
        self._seed_default_species()
        self._seed_default_diseases()

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
        species_id: uuid.UUID | None = None,
        diseases: list[IndividualDisease] | None = None,
        markers: list[IndividualMarker] | None = None,
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
            species_id=species_id,
            diseases=diseases or [],
            markers=markers or [],
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

    def update_relationship(self, id: uuid.UUID, **fields) -> Relationship | None:
        rel = self.relationships.get(id)
        if rel is None:
            return None
        for k, v in fields.items():
            setattr(rel, k, v)
        return rel

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
        individual_ids: list[uuid.UUID] | None = None,
        relationship_id: uuid.UUID | None = None,
    ) -> Egg:
        egg = Egg(
            display_name=display_name,
            notes=notes,
            properties=properties or {},
            individual_id=individual_id,
            individual_ids=individual_ids or [],
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

    # --- Species ---

    def _seed_default_species(self) -> None:
        sp = Species(display_name="Homo sapiens", ploidy=2)
        self.species[sp.id] = sp
        chr_names = [str(i) for i in range(1, 23)] + ["X", "Y", "Unknown"]
        for name in chr_names:
            autosome = name not in ("X", "Y", "Unknown")
            source = ChromosomeSource.parents if name != "Unknown" else ChromosomeSource.unknown
            ch = Chromosome(display_name=name, autosome=autosome, source=source)
            self.chromosomes[ch.id] = ch
            sp.chromosome_ids.append(ch.id)

    def _seed_default_diseases(self) -> None:
        defaults = [
            ("Breast Cancer", "#FF69B4"),
            ("Ovarian Cancer", "#7B68EE"),
            ("Colon Cancer", "#8B4513"),
            ("Endometrial Cancer", "#DC143C"),
            ("Pancreatic Cancer", "#4B0082"),
        ]
        for name, color in defaults:
            d = Disease(display_name=name, color=color)
            self.diseases[d.id] = d

    def create_species(
        self,
        display_name: str = "",
        ploidy: int = 2,
        notes: str = "",
        properties: dict | None = None,
    ) -> Species:
        sp = Species(
            display_name=display_name,
            ploidy=ploidy,
            notes=notes,
            properties=properties or {},
        )
        self.species[sp.id] = sp
        return sp

    def get_species(self, id: uuid.UUID) -> Species | None:
        return self.species.get(id)

    def list_species(self) -> list[Species]:
        return list(self.species.values())

    def update_species(self, id: uuid.UUID, **fields) -> Species | None:
        sp = self.species.get(id)
        if sp is None:
            return None
        for k, v in fields.items():
            if v is not None:
                setattr(sp, k, v)
        return sp

    def delete_species(self, id: uuid.UUID) -> bool:
        return self.species.pop(id, None) is not None

    def add_chromosome_to_species(self, species_id: uuid.UUID, chr_id: uuid.UUID) -> bool:
        sp = self.species.get(species_id)
        if sp is None:
            return False
        if chr_id not in sp.chromosome_ids:
            sp.chromosome_ids.append(chr_id)
        return True

    def remove_chromosome_from_species(self, species_id: uuid.UUID, chr_id: uuid.UUID) -> bool:
        sp = self.species.get(species_id)
        if sp is None or chr_id not in sp.chromosome_ids:
            return False
        sp.chromosome_ids.remove(chr_id)
        return True

    # --- Chromosomes ---

    def create_chromosome(
        self,
        display_name: str = "",
        base_pairs: int | None = None,
        source=None,
        autosome: bool = True,
        notes: str = "",
        properties: dict | None = None,
    ) -> Chromosome:
        ch = Chromosome(
            display_name=display_name,
            base_pairs=base_pairs,
            source=source,
            autosome=autosome,
            notes=notes,
            properties=properties or {},
        )
        self.chromosomes[ch.id] = ch
        return ch

    def get_chromosome(self, id: uuid.UUID) -> Chromosome | None:
        return self.chromosomes.get(id)

    def list_chromosomes(self) -> list[Chromosome]:
        return list(self.chromosomes.values())

    def update_chromosome(self, id: uuid.UUID, **fields) -> Chromosome | None:
        ch = self.chromosomes.get(id)
        if ch is None:
            return None
        for k, v in fields.items():
            if v is not None:
                setattr(ch, k, v)
        return ch

    def delete_chromosome(self, id: uuid.UUID) -> bool:
        return self.chromosomes.pop(id, None) is not None

    def add_marker_to_chromosome(self, chr_id: uuid.UUID, marker_id: uuid.UUID) -> bool:
        ch = self.chromosomes.get(chr_id)
        if ch is None:
            return False
        if marker_id not in ch.marker_ids:
            ch.marker_ids.append(marker_id)
        return True

    def remove_marker_from_chromosome(self, chr_id: uuid.UUID, marker_id: uuid.UUID) -> bool:
        ch = self.chromosomes.get(chr_id)
        if ch is None or marker_id not in ch.marker_ids:
            return False
        ch.marker_ids.remove(marker_id)
        return True

    # --- Markers ---

    def create_marker(self, **fields) -> Marker:
        m = Marker(**{k: v for k, v in fields.items() if v is not None})
        self.markers[m.id] = m
        return m

    def get_marker(self, id: uuid.UUID) -> Marker | None:
        return self.markers.get(id)

    def list_markers(self) -> list[Marker]:
        return list(self.markers.values())

    def update_marker(self, id: uuid.UUID, **fields) -> Marker | None:
        m = self.markers.get(id)
        if m is None:
            return None
        for k, v in fields.items():
            if v is not None:
                setattr(m, k, v)
        return m

    def delete_marker(self, id: uuid.UUID) -> bool:
        return self.markers.pop(id, None) is not None

    # --- Diseases ---

    def create_disease(
        self,
        display_name: str = "",
        color: str = "",
        notes: str = "",
        properties: dict | None = None,
    ) -> Disease:
        d = Disease(
            display_name=display_name,
            color=color,
            notes=notes,
            properties=properties or {},
        )
        self.diseases[d.id] = d
        return d

    def get_disease(self, id: uuid.UUID) -> Disease | None:
        return self.diseases.get(id)

    def list_diseases(self) -> list[Disease]:
        return list(self.diseases.values())

    def update_disease(self, id: uuid.UUID, **fields) -> Disease | None:
        d = self.diseases.get(id)
        if d is None:
            return None
        for k, v in fields.items():
            if v is not None:
                setattr(d, k, v)
        return d

    def delete_disease(self, id: uuid.UUID) -> bool:
        return self.diseases.pop(id, None) is not None

    def add_marker_to_disease(self, disease_id: uuid.UUID, marker_id: uuid.UUID) -> bool:
        d = self.diseases.get(disease_id)
        if d is None:
            return False
        if marker_id not in d.marker_ids:
            d.marker_ids.append(marker_id)
        return True

    def remove_marker_from_disease(self, disease_id: uuid.UUID, marker_id: uuid.UUID) -> bool:
        d = self.diseases.get(disease_id)
        if d is None or marker_id not in d.marker_ids:
            return False
        d.marker_ids.remove(marker_id)
        return True

    # --- Individual diseases / markers / manifestations ---

    def add_disease_to_individual(self, ind_id: uuid.UUID, disease_id: uuid.UUID) -> IndividualDisease | None:
        ind = self.individuals.get(ind_id)
        if ind is None:
            return None
        for d in ind.diseases:
            if d.disease_id == disease_id:
                return d
        entry = IndividualDisease(disease_id=disease_id)
        ind.diseases.append(entry)
        return entry

    def remove_disease_from_individual(self, ind_id: uuid.UUID, disease_id: uuid.UUID) -> bool:
        ind = self.individuals.get(ind_id)
        if ind is None:
            return False
        before = len(ind.diseases)
        ind.diseases = [d for d in ind.diseases if d.disease_id != disease_id]
        return len(ind.diseases) < before

    def add_manifestation(self, ind_id: uuid.UUID, disease_id: uuid.UUID, manifestation: Manifestation) -> Manifestation | None:
        ind = self.individuals.get(ind_id)
        if ind is None:
            return None
        for d in ind.diseases:
            if d.disease_id == disease_id:
                d.manifestations.append(manifestation)
                return manifestation
        return None

    def list_manifestations(self, ind_id: uuid.UUID, disease_id: uuid.UUID) -> list[Manifestation] | None:
        ind = self.individuals.get(ind_id)
        if ind is None:
            return None
        for d in ind.diseases:
            if d.disease_id == disease_id:
                return d.manifestations
        return None

    def update_manifestation(self, ind_id: uuid.UUID, disease_id: uuid.UUID, manif_id: uuid.UUID, **fields) -> Manifestation | None:
        ind = self.individuals.get(ind_id)
        if ind is None:
            return None
        for d in ind.diseases:
            if d.disease_id == disease_id:
                for m in d.manifestations:
                    if m.id == manif_id:
                        for k, v in fields.items():
                            if v is not None:
                                setattr(m, k, v)
                        return m
        return None

    def delete_manifestation(self, ind_id: uuid.UUID, disease_id: uuid.UUID, manif_id: uuid.UUID) -> bool:
        ind = self.individuals.get(ind_id)
        if ind is None:
            return False
        for d in ind.diseases:
            if d.disease_id == disease_id:
                before = len(d.manifestations)
                d.manifestations = [m for m in d.manifestations if m.id != manif_id]
                return len(d.manifestations) < before
        return False

    def add_marker_to_individual(self, ind_id: uuid.UUID, marker: IndividualMarker) -> IndividualMarker | None:
        ind = self.individuals.get(ind_id)
        if ind is None:
            return None
        for m in ind.markers:
            if m.marker_id == marker.marker_id:
                return m
        ind.markers.append(marker)
        return marker

    def update_individual_marker(self, ind_id: uuid.UUID, marker_id: uuid.UUID, **fields) -> IndividualMarker | None:
        ind = self.individuals.get(ind_id)
        if ind is None:
            return None
        for m in ind.markers:
            if m.marker_id == marker_id:
                for k, v in fields.items():
                    if v is not None:
                        setattr(m, k, v)
                return m
        return None

    def remove_marker_from_individual(self, ind_id: uuid.UUID, marker_id: uuid.UUID) -> bool:
        ind = self.individuals.get(ind_id)
        if ind is None:
            return False
        before = len(ind.markers)
        ind.markers = [m for m in ind.markers if m.marker_id != marker_id]
        return len(ind.markers) < before

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
