from __future__ import annotations

import uuid
from enum import Enum
from typing import Optional

from pydantic import BaseModel, Field


# --- Enums ---


class BiologicalSex(str, Enum):
    male = "male"
    female = "female"
    intersex = "intersex"
    unknown = "unknown"
    ambiguous_male = "ambiguous_male"
    ambiguous_female = "ambiguous_female"
    none = "none"
    other = "other"


class IndividualEventType(str, Enum):
    birth = "birth"
    death = "death"
    diagnosis = "diagnosis"
    symptom = "symptom"
    affection = "affection"
    fertility = "fertility"


class RelationshipEventType(str, Enum):
    marriage = "marriage"
    divorce = "divorce"
    separation = "separation"
    partnership = "partnership"
    engagement = "engagement"
    pregnancy = "pregnancy"


class DeathStatus(str, Enum):
    unknown = "unknown"
    alive = "alive"
    dead = "dead"
    suicide_confirmed = "suicide_confirmed"
    suicide_unconfirmed = "suicide_unconfirmed"
    spontaneous_abortion = "spontaneous_abortion"
    therapeutic_abortion = "therapeutic_abortion"
    neonatal_death = "neonatal_death"
    stillborn = "stillborn"
    lived_one_day = "lived_one_day"
    pregnancy = "pregnancy"
    other = "other"


class AffectionStatus(str, Enum):
    unknown = "unknown"
    clear = "clear"
    affected = "affected"
    possible_affection = "possible_affection"
    heterozygous = "heterozygous"
    affected_by_hearsay = "affected_by_hearsay"
    carrier = "carrier"
    examined = "examined"
    untested = "untested"
    immune = "immune"
    presymptomatic = "presymptomatic"
    other = "other"


class FertilityStatus(str, Enum):
    unknown = "unknown"
    fertile = "fertile"
    infertile = "infertile"
    infertile_by_choice = "infertile_by_choice"
    other = "other"


class SmokerType(str, Enum):
    vape = "vape"
    cigarette = "cigarette"
    cigar = "cigar"
    pipe = "pipe"
    mixed = "mixed"
    other = "other"


# --- Domain models ---


class PersonName(BaseModel):
    full: str = ""
    given: list[str] = Field(default_factory=list)
    family: str = ""
    prefix: str = ""
    suffix: str = ""


class VCardPhone(BaseModel):
    value: str = ""
    types: list[str] = Field(default_factory=list)


class VCardEmail(BaseModel):
    value: str = ""
    types: list[str] = Field(default_factory=list)


class VCardAddress(BaseModel):
    po_box: str = ""
    extended: str = ""
    street: str = ""
    city: str = ""
    region: str = ""
    postal_code: str = ""
    country: str = ""
    types: list[str] = Field(default_factory=list)


class VCardContact(BaseModel):
    fn: str = ""
    n: PersonName = Field(default_factory=PersonName)
    tel: list[VCardPhone] = Field(default_factory=list)
    email: list[VCardEmail] = Field(default_factory=list)
    adr: list[VCardAddress] = Field(default_factory=list)
    org: str = ""
    title: str = ""
    note: str = ""
    properties: dict = Field(default_factory=dict)


class EntityReference(BaseModel):
    entity_id: uuid.UUID
    entity_type: str  # "individual" or "relationship"
    role: str  # e.g. "child", "offspring"
    properties: dict = Field(default_factory=dict)


class Event(BaseModel):
    id: uuid.UUID = Field(default_factory=uuid.uuid4)
    type: str  # validated at router boundary via enums
    display_name: str = ""
    date: Optional[str] = None  # ISO date string
    properties: dict = Field(default_factory=dict)
    entity_references: list[EntityReference] = Field(default_factory=list)


class Individual(BaseModel):
    id: uuid.UUID = Field(default_factory=uuid.uuid4)
    display_name: str = ""
    name: PersonName = Field(default_factory=PersonName)
    biological_sex: Optional[BiologicalSex] = None
    x: Optional[float] = None
    y: Optional[float] = None
    notes: str = ""
    proband: float = Field(default=0.0, ge=0.0, le=360.0)
    proband_text: str = ""
    generation: Optional[int] = None
    contacts: dict[str, VCardContact] = Field(default_factory=dict)
    consent_to_share: Optional[bool] = None
    height_mm: Optional[int] = None
    weight_g: Optional[int] = None
    alcohol_units_per_week: Optional[float] = None
    smoker: Optional[SmokerType] = None
    smoking_per_day: Optional[int] = None
    properties: dict = Field(default_factory=dict)
    events: list[Event] = Field(default_factory=list)


class Relationship(BaseModel):
    id: uuid.UUID = Field(default_factory=uuid.uuid4)
    display_name: str = ""
    members: list[uuid.UUID] = Field(default_factory=list)
    notes: str = ""
    properties: dict = Field(default_factory=dict)
    events: list[Event] = Field(default_factory=list)


class Egg(BaseModel):
    id: uuid.UUID = Field(default_factory=uuid.uuid4)
    display_name: str = ""
    notes: str = ""
    properties: dict = Field(default_factory=dict)
    individual_id: Optional[uuid.UUID] = None  # resulting child
    relationship_id: Optional[uuid.UUID] = None  # parent relationship
    events: list[Event] = Field(default_factory=list)


class Pedigree(BaseModel):
    id: uuid.UUID = Field(default_factory=uuid.uuid4)
    display_name: str = ""
    date_represented: Optional[str] = None  # ISO date
    owner: str = ""
    notes: str = ""
    properties: dict = Field(default_factory=dict)
    events: list[Event] = Field(default_factory=list)
    created_at: Optional[str] = None  # ISO datetime, set on creation
    updated_at: Optional[str] = None  # ISO datetime, set on modification
    individual_ids: list[uuid.UUID] = Field(default_factory=list)
    relationship_ids: list[uuid.UUID] = Field(default_factory=list)
    egg_ids: list[uuid.UUID] = Field(default_factory=list)


class PedigreeDetail(Pedigree):
    """Response model for GET pedigree — metadata + resolved entities."""
    individuals: list[Individual] = Field(default_factory=list)
    relationships: list[Relationship] = Field(default_factory=list)
    eggs: list[Egg] = Field(default_factory=list)


# --- Request / response schemas ---


class PedigreeCreate(BaseModel):
    display_name: str = ""
    date_represented: Optional[str] = None
    owner: str = ""
    notes: str = ""
    properties: dict = Field(default_factory=dict)


class PedigreeUpdate(BaseModel):
    display_name: Optional[str] = None
    date_represented: Optional[str] = None
    owner: Optional[str] = None
    notes: Optional[str] = None
    properties: Optional[dict] = None


class IndividualCreate(BaseModel):
    display_name: str = ""
    name: PersonName = Field(default_factory=PersonName)
    biological_sex: Optional[BiologicalSex] = None
    x: Optional[float] = None
    y: Optional[float] = None
    notes: str = ""
    proband: float = Field(default=0.0, ge=0.0, le=360.0)
    proband_text: str = ""
    generation: Optional[int] = None
    contacts: dict[str, VCardContact] = Field(default_factory=dict)
    consent_to_share: Optional[bool] = None
    height_mm: Optional[int] = None
    weight_g: Optional[int] = None
    alcohol_units_per_week: Optional[float] = None
    smoker: Optional[SmokerType] = None
    smoking_per_day: Optional[int] = None
    properties: dict = Field(default_factory=dict)


class IndividualUpdate(BaseModel):
    display_name: Optional[str] = None
    name: Optional[PersonName] = None
    biological_sex: Optional[BiologicalSex] = None
    x: Optional[float] = None
    y: Optional[float] = None
    notes: Optional[str] = None
    proband: Optional[float] = Field(default=None, ge=0.0, le=360.0)
    proband_text: Optional[str] = None
    generation: Optional[int] = None
    contacts: Optional[dict[str, VCardContact]] = None
    consent_to_share: Optional[bool] = None
    height_mm: Optional[int] = None
    weight_g: Optional[int] = None
    alcohol_units_per_week: Optional[float] = None
    smoker: Optional[SmokerType] = None
    smoking_per_day: Optional[int] = None
    properties: Optional[dict] = None


class RelationshipCreate(BaseModel):
    members: list[uuid.UUID] = Field(default_factory=list)
    display_name: str = ""
    notes: str = ""
    properties: dict = Field(default_factory=dict)


class EggCreate(BaseModel):
    display_name: str = ""
    notes: str = ""
    properties: dict = Field(default_factory=dict)
    individual_id: Optional[uuid.UUID] = None
    relationship_id: Optional[uuid.UUID] = None


class EggUpdate(BaseModel):
    display_name: Optional[str] = None
    notes: Optional[str] = None
    properties: Optional[dict] = None
    individual_id: Optional[uuid.UUID] = None
    relationship_id: Optional[uuid.UUID] = None


class IndividualEventCreate(BaseModel):
    """Validates type is a known individual event type."""
    type: IndividualEventType
    display_name: str = ""
    date: Optional[str] = None
    properties: dict = Field(default_factory=dict)
    entity_references: list[EntityReference] = Field(default_factory=list)


class RelationshipEventCreate(BaseModel):
    """Validates type is a known relationship event type."""
    type: RelationshipEventType
    display_name: str = ""
    date: Optional[str] = None
    properties: dict = Field(default_factory=dict)
    entity_references: list[EntityReference] = Field(default_factory=list)


class EventCreate(BaseModel):
    """Generic event create — for pedigree and egg events (any type string)."""
    type: str
    display_name: str = ""
    date: Optional[str] = None
    properties: dict = Field(default_factory=dict)
    entity_references: list[EntityReference] = Field(default_factory=list)


class EventUpdate(BaseModel):
    type: Optional[str] = None
    display_name: Optional[str] = None
    date: Optional[str] = None
    properties: Optional[dict] = None


class EntityReferenceCreate(BaseModel):
    entity_id: uuid.UUID
    entity_type: str
    role: str
    properties: dict = Field(default_factory=dict)


class OffspringCreate(BaseModel):
    individual_id: uuid.UUID
    pedigree_id: uuid.UUID


class OffspringResult(BaseModel):
    pregnancy_event: Event
    egg: Egg


class PedigreeRestoreBody(BaseModel):
    individuals: list[Individual] = Field(default_factory=list)
    relationships: list[Relationship] = Field(default_factory=list)
    eggs: list[Egg] = Field(default_factory=list)


class GedcomImportBody(BaseModel):
    content: str


class XegImportBody(BaseModel):
    content: str
