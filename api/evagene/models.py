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


class IndividualEventType(str, Enum):
    birth = "birth"
    death = "death"
    diagnosis = "diagnosis"
    symptom = "symptom"


class RelationshipEventType(str, Enum):
    marriage = "marriage"
    divorce = "divorce"
    separation = "separation"
    partnership = "partnership"
    engagement = "engagement"
    pregnancy = "pregnancy"


# --- Domain models ---


class PersonName(BaseModel):
    full: str = ""
    given: list[str] = Field(default_factory=list)
    family: str = ""
    prefix: str = ""
    suffix: str = ""


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
    properties: dict = Field(default_factory=dict)
    events: list[Event] = Field(default_factory=list)


class Relationship(BaseModel):
    id: uuid.UUID = Field(default_factory=uuid.uuid4)
    display_name: str = ""
    members: list[uuid.UUID] = Field(default_factory=list)
    properties: dict = Field(default_factory=dict)
    events: list[Event] = Field(default_factory=list)


class Egg(BaseModel):
    id: uuid.UUID = Field(default_factory=uuid.uuid4)
    display_name: str = ""
    properties: dict = Field(default_factory=dict)
    individual_id: Optional[uuid.UUID] = None  # resulting child
    events: list[Event] = Field(default_factory=list)


class Pedigree(BaseModel):
    id: uuid.UUID = Field(default_factory=uuid.uuid4)
    display_name: str = ""
    date_represented: Optional[str] = None  # ISO date
    owner: str = ""
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
    properties: dict = Field(default_factory=dict)


class PedigreeUpdate(BaseModel):
    display_name: Optional[str] = None
    date_represented: Optional[str] = None
    owner: Optional[str] = None
    properties: Optional[dict] = None


class IndividualCreate(BaseModel):
    display_name: str = ""
    name: PersonName = Field(default_factory=PersonName)
    biological_sex: Optional[BiologicalSex] = None
    x: Optional[float] = None
    y: Optional[float] = None
    properties: dict = Field(default_factory=dict)


class IndividualUpdate(BaseModel):
    display_name: Optional[str] = None
    biological_sex: Optional[BiologicalSex] = None
    x: Optional[float] = None
    y: Optional[float] = None
    properties: Optional[dict] = None


class RelationshipCreate(BaseModel):
    members: list[uuid.UUID] = Field(default_factory=list)
    display_name: str = ""
    properties: dict = Field(default_factory=dict)


class EggCreate(BaseModel):
    display_name: str = ""
    properties: dict = Field(default_factory=dict)
    individual_id: Optional[uuid.UUID] = None


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
