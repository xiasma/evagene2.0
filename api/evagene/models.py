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


class ChromosomeSource(str, Enum):
    unknown = "unknown"
    parents = "parents"
    mitochondria = "mitochondria"
    chloroplasts = "chloroplasts"
    other = "other"


class MarkerType(str, Enum):
    unknown = "unknown"
    gene = "gene"
    regulator = "regulator"
    marker = "marker"
    other = "other"


class ManifestationStatus(str, Enum):
    unknown = "unknown"
    presymptomatic = "presymptomatic"
    symptomatic = "symptomatic"
    uninvasive_test = "uninvasive_test"
    invasive_test = "invasive_test"
    positive_confirmation = "positive_confirmation"
    negative_confirmation = "negative_confirmation"
    ambiguous_test_outcome = "ambiguous_test_outcome"
    other = "other"


class Laterality(str, Enum):
    unknown = "unknown"
    left = "left"
    right = "right"
    bilateral = "bilateral"
    not_applicable = "not_applicable"


class GeneticTestResult(str, Enum):
    unknown = "unknown"
    positive = "positive"
    negative = "negative"
    variant_of_uncertain_significance = "variant_of_uncertain_significance"
    not_tested = "not_tested"


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


class Species(BaseModel):
    id: uuid.UUID = Field(default_factory=uuid.uuid4)
    display_name: str = ""
    ploidy: int = 2
    notes: str = ""
    properties: dict = Field(default_factory=dict)
    chromosome_ids: list[uuid.UUID] = Field(default_factory=list)


class Chromosome(BaseModel):
    id: uuid.UUID = Field(default_factory=uuid.uuid4)
    display_name: str = ""
    base_pairs: Optional[int] = None
    source: Optional[ChromosomeSource] = None
    autosome: bool = True
    notes: str = ""
    properties: dict = Field(default_factory=dict)
    marker_ids: list[uuid.UUID] = Field(default_factory=list)


class Marker(BaseModel):
    id: uuid.UUID = Field(default_factory=uuid.uuid4)
    display_name: str = ""
    type: Optional[MarkerType] = None
    chromosome_band: str = ""
    base_pairs: Optional[int] = None
    centimorgans: Optional[int] = None
    mckusick_number: str = ""
    enzyme_used: str = ""
    probe_used: str = ""
    notes: str = ""
    properties: dict = Field(default_factory=dict)


class Ethnicity(BaseModel):
    id: uuid.UUID = Field(default_factory=uuid.uuid4)
    display_name: str = ""
    parent_id: Optional[uuid.UUID] = None
    notes: str = ""
    properties: dict = Field(default_factory=dict)


class TreatmentType(BaseModel):
    id: uuid.UUID = Field(default_factory=uuid.uuid4)
    display_name: str = ""
    parent_id: Optional[uuid.UUID] = None
    notes: str = ""
    properties: dict = Field(default_factory=dict)


class Disease(BaseModel):
    id: uuid.UUID = Field(default_factory=uuid.uuid4)
    display_name: str = ""
    parent_id: Optional[uuid.UUID] = None
    icd10_code: str = ""
    omim_id: str = ""
    color: str = ""
    notes: str = ""
    properties: dict = Field(default_factory=dict)
    marker_ids: list[uuid.UUID] = Field(default_factory=list)


class Manifestation(BaseModel):
    id: uuid.UUID = Field(default_factory=uuid.uuid4)
    date: Optional[str] = None
    numeric_value: Optional[int] = None
    certainty: Optional[str] = None
    certainty_notes: str = ""
    status: Optional[ManifestationStatus] = None
    properties: dict = Field(default_factory=dict)


class IndividualDisease(BaseModel):
    disease_id: uuid.UUID
    laterality: Optional[Laterality] = None
    site: str = ""  # body site, e.g. "breast", "ovary", "colon"
    tumor_properties: dict = Field(default_factory=dict)  # ER/PR/HER2/grade/stage
    manifestations: list[Manifestation] = Field(default_factory=list)
    properties: dict = Field(default_factory=dict)


class GeneticTest(BaseModel):
    id: uuid.UUID = Field(default_factory=uuid.uuid4)
    gene: str = ""  # e.g. "BRCA1", "BRCA2", "MLH1"
    result: Optional[GeneticTestResult] = None
    method: str = ""  # e.g. "sequencing", "MLPA", "panel"
    date: Optional[str] = None  # ISO date
    properties: dict = Field(default_factory=dict)


class IndividualTreatment(BaseModel):
    id: uuid.UUID = Field(default_factory=uuid.uuid4)
    treatment_type_id: uuid.UUID
    disease_id: Optional[uuid.UUID] = None  # which disease, if applicable
    laterality: Optional[Laterality] = None  # for surgeries
    date: Optional[str] = None  # start date
    end_date: Optional[str] = None
    prophylactic: bool = False
    properties: dict = Field(default_factory=dict)


class IndividualEthnicity(BaseModel):
    ethnicity_id: uuid.UUID
    proportion: float = Field(default=1.0, ge=0.0, le=1.0)


class IndividualMarker(BaseModel):
    marker_id: uuid.UUID
    allele_1: str = ""
    allele_2: str = ""
    zygosity: str = ""
    properties: dict = Field(default_factory=dict)


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
    species_id: Optional[uuid.UUID] = None
    ethnicities: list[IndividualEthnicity] = Field(default_factory=list)
    diseases: list[IndividualDisease] = Field(default_factory=list)
    markers: list[IndividualMarker] = Field(default_factory=list)
    genetic_tests: list[GeneticTest] = Field(default_factory=list)
    treatments: list[IndividualTreatment] = Field(default_factory=list)
    properties: dict = Field(default_factory=dict)
    events: list[Event] = Field(default_factory=list)


class Relationship(BaseModel):
    id: uuid.UUID = Field(default_factory=uuid.uuid4)
    display_name: str = ""
    members: list[uuid.UUID] = Field(default_factory=list)
    consanguinity: Optional[float] = None  # kinship coefficient (0.0–1.0)
    consanguinity_override: bool = False  # if True, auto-calc won't overwrite
    notes: str = ""
    properties: dict = Field(default_factory=dict)
    events: list[Event] = Field(default_factory=list)


class Egg(BaseModel):
    id: uuid.UUID = Field(default_factory=uuid.uuid4)
    display_name: str = ""
    notes: str = ""
    properties: dict = Field(default_factory=dict)
    individual_id: Optional[uuid.UUID] = None  # resulting child (single)
    individual_ids: list[uuid.UUID] = Field(default_factory=list)  # multiple children (monozygotic twins)
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
    disease_ids: list[uuid.UUID] = Field(default_factory=list)
    ethnicity_ids: list[uuid.UUID] = Field(default_factory=list)
    treatment_type_ids: list[uuid.UUID] = Field(default_factory=list)
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
    disease_ids: list[uuid.UUID] = Field(default_factory=list)
    ethnicity_ids: list[uuid.UUID] = Field(default_factory=list)
    treatment_type_ids: list[uuid.UUID] = Field(default_factory=list)
    properties: dict = Field(default_factory=dict)


class PedigreeUpdate(BaseModel):
    display_name: Optional[str] = None
    date_represented: Optional[str] = None
    owner: Optional[str] = None
    notes: Optional[str] = None
    disease_ids: Optional[list[uuid.UUID]] = None
    ethnicity_ids: Optional[list[uuid.UUID]] = None
    treatment_type_ids: Optional[list[uuid.UUID]] = None
    properties: Optional[dict] = None


class SpeciesCreate(BaseModel):
    display_name: str = ""
    ploidy: int = 2
    notes: str = ""
    properties: dict = Field(default_factory=dict)


class SpeciesUpdate(BaseModel):
    display_name: Optional[str] = None
    ploidy: Optional[int] = None
    notes: Optional[str] = None
    properties: Optional[dict] = None


class ChromosomeCreate(BaseModel):
    display_name: str = ""
    base_pairs: Optional[int] = None
    source: Optional[ChromosomeSource] = None
    autosome: bool = True
    notes: str = ""
    properties: dict = Field(default_factory=dict)


class ChromosomeUpdate(BaseModel):
    display_name: Optional[str] = None
    base_pairs: Optional[int] = None
    source: Optional[ChromosomeSource] = None
    autosome: Optional[bool] = None
    notes: Optional[str] = None
    properties: Optional[dict] = None


class MarkerCreate(BaseModel):
    display_name: str = ""
    type: Optional[MarkerType] = None
    chromosome_band: str = ""
    base_pairs: Optional[int] = None
    centimorgans: Optional[int] = None
    mckusick_number: str = ""
    enzyme_used: str = ""
    probe_used: str = ""
    notes: str = ""
    properties: dict = Field(default_factory=dict)


class MarkerUpdate(BaseModel):
    display_name: Optional[str] = None
    type: Optional[MarkerType] = None
    chromosome_band: Optional[str] = None
    base_pairs: Optional[int] = None
    centimorgans: Optional[int] = None
    mckusick_number: Optional[str] = None
    enzyme_used: Optional[str] = None
    probe_used: Optional[str] = None
    notes: Optional[str] = None
    properties: Optional[dict] = None


class EthnicityCreate(BaseModel):
    display_name: str = ""
    parent_id: Optional[uuid.UUID] = None
    notes: str = ""
    properties: dict = Field(default_factory=dict)


class EthnicityUpdate(BaseModel):
    display_name: Optional[str] = None
    parent_id: Optional[uuid.UUID] = None
    notes: Optional[str] = None
    properties: Optional[dict] = None


class TreatmentTypeCreate(BaseModel):
    display_name: str = ""
    parent_id: Optional[uuid.UUID] = None
    notes: str = ""
    properties: dict = Field(default_factory=dict)


class TreatmentTypeUpdate(BaseModel):
    display_name: Optional[str] = None
    parent_id: Optional[uuid.UUID] = None
    notes: Optional[str] = None
    properties: Optional[dict] = None


class DiseaseCreate(BaseModel):
    display_name: str = ""
    parent_id: Optional[uuid.UUID] = None
    icd10_code: str = ""
    omim_id: str = ""
    color: str = ""
    notes: str = ""
    properties: dict = Field(default_factory=dict)


class DiseaseUpdate(BaseModel):
    display_name: Optional[str] = None
    parent_id: Optional[uuid.UUID] = None
    icd10_code: Optional[str] = None
    omim_id: Optional[str] = None
    color: Optional[str] = None
    notes: Optional[str] = None
    properties: Optional[dict] = None


class ManifestationCreate(BaseModel):
    date: Optional[str] = None
    numeric_value: Optional[int] = None
    certainty: Optional[str] = None
    certainty_notes: str = ""
    status: Optional[ManifestationStatus] = None
    properties: dict = Field(default_factory=dict)


class ManifestationUpdate(BaseModel):
    date: Optional[str] = None
    numeric_value: Optional[int] = None
    certainty: Optional[str] = None
    certainty_notes: Optional[str] = None
    status: Optional[ManifestationStatus] = None
    properties: Optional[dict] = None


class IndividualDiseaseCreate(BaseModel):
    disease_id: uuid.UUID
    laterality: Optional[Laterality] = None
    site: str = ""
    tumor_properties: dict = Field(default_factory=dict)


class IndividualDiseaseUpdate(BaseModel):
    laterality: Optional[Laterality] = None
    site: Optional[str] = None
    tumor_properties: Optional[dict] = None
    properties: Optional[dict] = None


class GeneticTestCreate(BaseModel):
    gene: str = ""
    result: Optional[GeneticTestResult] = None
    method: str = ""
    date: Optional[str] = None
    properties: dict = Field(default_factory=dict)


class GeneticTestUpdate(BaseModel):
    gene: Optional[str] = None
    result: Optional[GeneticTestResult] = None
    method: Optional[str] = None
    date: Optional[str] = None
    properties: Optional[dict] = None


class IndividualTreatmentCreate(BaseModel):
    treatment_type_id: uuid.UUID
    disease_id: Optional[uuid.UUID] = None
    laterality: Optional[Laterality] = None
    date: Optional[str] = None
    end_date: Optional[str] = None
    prophylactic: bool = False
    properties: dict = Field(default_factory=dict)


class IndividualTreatmentUpdate(BaseModel):
    treatment_type_id: Optional[uuid.UUID] = None
    disease_id: Optional[uuid.UUID] = None
    laterality: Optional[Laterality] = None
    date: Optional[str] = None
    end_date: Optional[str] = None
    prophylactic: Optional[bool] = None
    properties: Optional[dict] = None


class IndividualEthnicityCreate(BaseModel):
    ethnicity_id: uuid.UUID
    proportion: float = Field(default=1.0, ge=0.0, le=1.0)


class IndividualMarkerCreate(BaseModel):
    marker_id: uuid.UUID
    allele_1: str = ""
    allele_2: str = ""
    zygosity: str = ""
    properties: dict = Field(default_factory=dict)


class IndividualMarkerUpdate(BaseModel):
    allele_1: Optional[str] = None
    allele_2: Optional[str] = None
    zygosity: Optional[str] = None
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
    species_id: Optional[uuid.UUID] = None
    ethnicities: list[IndividualEthnicityCreate] = Field(default_factory=list)
    diseases: list[IndividualDiseaseCreate] = Field(default_factory=list)
    markers: list[IndividualMarkerCreate] = Field(default_factory=list)
    genetic_tests: list[GeneticTestCreate] = Field(default_factory=list)
    treatments: list[IndividualTreatmentCreate] = Field(default_factory=list)
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
    species_id: Optional[uuid.UUID] = None
    ethnicities: Optional[list[IndividualEthnicityCreate]] = None
    properties: Optional[dict] = None


class RelationshipCreate(BaseModel):
    members: list[uuid.UUID] = Field(default_factory=list)
    display_name: str = ""
    notes: str = ""
    properties: dict = Field(default_factory=dict)


class RelationshipUpdate(BaseModel):
    display_name: Optional[str] = None
    consanguinity: Optional[float] = None
    consanguinity_override: Optional[bool] = None
    notes: Optional[str] = None
    properties: Optional[dict] = None


class EggCreate(BaseModel):
    display_name: str = ""
    notes: str = ""
    properties: dict = Field(default_factory=dict)
    individual_id: Optional[uuid.UUID] = None
    individual_ids: list[uuid.UUID] = Field(default_factory=list)
    relationship_id: Optional[uuid.UUID] = None


class EggUpdate(BaseModel):
    display_name: Optional[str] = None
    notes: Optional[str] = None
    properties: Optional[dict] = None
    individual_id: Optional[uuid.UUID] = None
    individual_ids: Optional[list[uuid.UUID]] = None
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
