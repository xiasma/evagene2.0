"""Evagene v1 .xeg (XML) parser for importing legacy pedigrees."""

from __future__ import annotations

import uuid
import xml.etree.ElementTree as ET

from .models import (
    AffectionStatus,
    BiologicalSex,
    DeathStatus,
    Egg,
    FertilityStatus,
    Individual,
    PersonName,
    Relationship,
)

# --- XEG field name → value extraction ---

_SEX_MAP = {
    "Male": BiologicalSex.male,
    "Female": BiologicalSex.female,
    "Unknown": BiologicalSex.unknown,
}

_AFFECTION_MAP = {
    "Unknown": AffectionStatus.unknown,
    "Clear": AffectionStatus.clear,
    "Affected": AffectionStatus.affected,
    "PossibleAffection": AffectionStatus.possible_affection,
    "Heterozygous": AffectionStatus.heterozygous,
    "AffectedByHearsay": AffectionStatus.affected_by_hearsay,
    "Carrier": AffectionStatus.carrier,
    "Examined": AffectionStatus.examined,
    "Untested": AffectionStatus.untested,
    "Immune": AffectionStatus.immune,
    "Presymptomatic": AffectionStatus.presymptomatic,
}

_FERTILITY_MAP = {
    "Unknown": FertilityStatus.unknown,
    "Fertile": FertilityStatus.fertile,
    "Infertile": FertilityStatus.infertile,
    "InfertileByChoice": FertilityStatus.infertile_by_choice,
}

_LIVING_MAP = {
    "Alive": DeathStatus.alive,
    "Dead": DeathStatus.dead,
    "Unknown": DeathStatus.unknown,
    "Stillborn": DeathStatus.stillborn,
    "SuicideConfirmed": DeathStatus.suicide_confirmed,
    "SuicideUnconfirmed": DeathStatus.suicide_unconfirmed,
    "SpontaneousAbortion": DeathStatus.spontaneous_abortion,
    "TherapeuticAbortion": DeathStatus.therapeutic_abortion,
    "NeonatalDeath": DeathStatus.neonatal_death,
    "LivedOneDay": DeathStatus.lived_one_day,
    "Pregnancy": DeathStatus.pregnancy,
}


def _text(el: ET.Element, tag: str) -> str:
    """Get text of a child element, or empty string."""
    child = el.find(tag)
    if child is not None and child.text:
        return child.text.strip()
    return ""


def _get_defined_field(el: ET.Element, name: str) -> str:
    """Get Value from a DefinedField by Name."""
    for df in el.findall(".//DefinedFields/DefinedField"):
        n = _text(df, "Name")
        if n == name:
            val_el = df.find("Value")
            if val_el is not None and val_el.text:
                return val_el.text.strip()
    return ""


def parse_xeg(text: str) -> tuple[list[Individual], list[Relationship], list[Egg]]:
    """Parse an Evagene v1 .xeg XML file and return (individuals, relationships, eggs)."""
    # Strip UTF-8 BOM if present
    if text.startswith("\ufeff"):
        text = text[1:]
    root = ET.fromstring(text)

    # --- Pass 1: Parse Individuals ---
    # Build xeg_guid → new UUID map, and xeg_guid → Individual
    guid_to_uuid: dict[str, uuid.UUID] = {}
    individuals: list[Individual] = []

    for ind_el in root.findall(".//Individuals/Individual"):
        xeg_guid = _text(ind_el, "Guid")
        if not xeg_guid:
            continue

        new_id = uuid.uuid4()
        guid_to_uuid[xeg_guid] = new_id

        # Name
        name_str = _text(ind_el, "Name")
        surname = _get_defined_field(ind_el, "Surname")
        given_names_str = _get_defined_field(ind_el, "Given names")
        title = _get_defined_field(ind_el, "Title")

        given = given_names_str.split() if given_names_str else []
        # If no structured name, parse from Name element
        if not given and not surname and name_str:
            given = name_str.split()

        # Sex — use <Sex> element (rendering sex), fall back to <Gender>
        sex_str = _text(ind_el, "Sex") or _text(ind_el, "Gender")
        bio_sex = _SEX_MAP.get(sex_str)

        # Position
        x_str = _text(ind_el, "X")
        y_str = _text(ind_el, "Y")
        x = float(x_str) if x_str else None
        y = float(y_str) if y_str else None

        # Notes
        notes = _text(ind_el, "Notes")

        # Clinical properties
        props: dict = {}

        affection_str = _text(ind_el, "Affection")
        if affection_str and affection_str in _AFFECTION_MAP:
            aff = _AFFECTION_MAP[affection_str]
            if aff != AffectionStatus.unknown:
                props["affection_status"] = aff.value

        fertility_str = _text(ind_el, "Fertility")
        if fertility_str and fertility_str in _FERTILITY_MAP:
            fert = _FERTILITY_MAP[fertility_str]
            if fert != FertilityStatus.unknown:
                props["fertility_status"] = fert.value

        living_str = _text(ind_el, "Living")
        if living_str and living_str in _LIVING_MAP:
            death = _LIVING_MAP[living_str]
            if death != DeathStatus.alive:
                props["death_status"] = death.value

        # Proband
        proband_str = _text(ind_el, "Proband")
        proband = 0.0
        if proband_str:
            try:
                p = float(proband_str)
                if p >= 0:
                    proband = p
            except ValueError:
                pass

        proband_text = _text(ind_el, "ProbandText")

        # Contact fields
        home_tel = _get_defined_field(ind_el, "Home telephone")
        day_tel = _get_defined_field(ind_el, "Daytime telephone")
        mobile_tel = _get_defined_field(ind_el, "Mobile telephone")
        email = _get_defined_field(ind_el, "Email")

        # Height/Weight
        height_str = _get_defined_field(ind_el, "Height")
        weight_str = _get_defined_field(ind_el, "Weight")

        height_mm = None
        if height_str:
            try:
                h = float(height_str)
                if h > 0:
                    height_mm = int(h)
            except ValueError:
                pass

        weight_g = None
        if weight_str:
            try:
                w = float(weight_str)
                if w > 0:
                    weight_g = int(w)
            except ValueError:
                pass

        # Consent
        consent_str = _get_defined_field(ind_el, "Consent To Contact")
        consent = True if consent_str.lower() == "true" else None

        ind = Individual(
            id=new_id,
            display_name=name_str,
            name=PersonName(given=given, family=surname, prefix=title),
            biological_sex=bio_sex,
            x=x,
            y=y,
            notes=notes,
            proband=proband,
            proband_text=proband_text,
            height_mm=height_mm,
            weight_g=weight_g,
            consent_to_share=consent,
            properties=props,
        )
        individuals.append(ind)

    # --- Pass 2: Parse Marriages → Relationships ---
    relationships: list[Relationship] = []
    marriage_guid_to_rel_id: dict[str, uuid.UUID] = {}

    for mar_el in root.findall(".//Marriages/Marriage"):
        # Skip marriages nested inside Individuals (those are references)
        # Only process top-level Marriages
        parent = None
        for p in root.iter():
            if mar_el in list(p):
                parent = p
                break
        # Top-level marriages are direct children of <Marriages> which is child of <Pedigree>
        mar_guid = _text(mar_el, "Guid")
        if not mar_guid:
            continue
        # Avoid duplicates
        if mar_guid in marriage_guid_to_rel_id:
            continue

        spouse1 = _text(mar_el, "Spouse1Ref")
        spouse2 = _text(mar_el, "Spouse2Ref")

        members: list[uuid.UUID] = []
        if spouse1 and spouse1 in guid_to_uuid:
            members.append(guid_to_uuid[spouse1])
        if spouse2 and spouse2 in guid_to_uuid:
            members.append(guid_to_uuid[spouse2])

        rel_id = uuid.uuid4()
        marriage_guid_to_rel_id[mar_guid] = rel_id

        rel = Relationship(
            id=rel_id,
            display_name=_text(mar_el, "Name"),
            members=members,
        )
        relationships.append(rel)

    # --- Pass 3: Parse EggLists → Eggs ---
    # EggList → Egg → Siblings/Individual[@IndividualRef] gives the child
    # EggList → PregnancyRef → Pregnancy → MarriageRef gives the relationship
    eggs: list[Egg] = []

    # Build pregnancy_guid → marriage_guid map
    preg_to_marriage: dict[str, str] = {}

    # Pregnancies in PregnancyLists
    for pl_el in root.findall(".//PregnancyLists/PregnancyList"):
        mar_ref = pl_el.get("MarriageRef", "")
        for preg_el in pl_el.findall("Pregnancy"):
            preg_guid = _text(preg_el, "Guid")
            preg_mar = _text(preg_el, "MarriageRef") or mar_ref
            if preg_guid and preg_mar:
                preg_to_marriage[preg_guid] = preg_mar

    # Also standalone Pregnancies
    for preg_el in root.findall(".//Pregnancies/Pregnancy"):
        preg_guid = _text(preg_el, "Guid")
        preg_mar = _text(preg_el, "MarriageRef")
        if preg_guid:
            if preg_mar:
                preg_to_marriage[preg_guid] = preg_mar

    # Parse EggLists
    for el_el in root.findall(".//EggLists/EggList"):
        preg_ref = _text(el_el, "PregnancyRef")
        mar_guid = preg_to_marriage.get(preg_ref, "")
        rel_id = marriage_guid_to_rel_id.get(mar_guid)

        for egg_el in el_el.findall("Egg"):
            # Find child individual ref
            child_ref = None
            for sib_ind in egg_el.findall(".//Siblings/Individual"):
                ref = sib_ind.get("IndividualRef", "")
                if ref:
                    child_ref = ref
                    break

            child_uuid = guid_to_uuid.get(child_ref or "")
            if child_uuid and rel_id:
                eggs.append(Egg(
                    individual_id=child_uuid,
                    relationship_id=rel_id,
                ))

    return individuals, relationships, eggs
