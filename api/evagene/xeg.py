"""Evagene v1 .xeg (XML) parser for importing legacy pedigrees."""

from __future__ import annotations

import uuid
import xml.etree.ElementTree as ET
from datetime import datetime

from .models import (
    AffectionStatus,
    BiologicalSex,
    DeathStatus,
    Disease,
    Egg,
    Event,
    FertilityStatus,
    Individual,
    IndividualDisease,
    PersonName,
    Relationship,
)

# --- XEG field name → value extraction ---

_SEX_MAP = {
    "Male": BiologicalSex.male,
    "Female": BiologicalSex.female,
    "Unknown": BiologicalSex.unknown,
    "AmbiguousFemale": BiologicalSex.ambiguous_female,
    "AmbiguousMale": BiologicalSex.ambiguous_male,
    "Ambiguous": BiologicalSex.unknown,
    "Hermaphrodite": BiologicalSex.intersex,
    "TransgenderFemaleToMale": BiologicalSex.other,
    "TransgenderMaleToFemale": BiologicalSex.other,
    "Other": BiologicalSex.other,
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
    "Suicide": DeathStatus.suicide_confirmed,
    "SuicideConfirmed": DeathStatus.suicide_confirmed,
    "SuicideUnconfirmed": DeathStatus.suicide_unconfirmed,
    "SpontaneousAbortion": DeathStatus.spontaneous_abortion,
    "TherapeuticAbortion": DeathStatus.therapeutic_abortion,
    "NeonatalDeath": DeathStatus.neonatal_death,
    "LivedOneDay": DeathStatus.lived_one_day,
    "Pregnancy": DeathStatus.pregnancy,
    "Other": DeathStatus.other,
}

_EVENT_STATUS_MAP = {
    "NaturalDelivery": "birth",
    "AssistedDelivery": "birth",
    "OtherDelivery": "birth",
    "NaturalConception": "birth",
    "AssistedConception": "birth",
    "OtherConception": "birth",
    "Death": "death",
    "Diagnosis": "diagnosis",
    "Symptomatic": "symptom",
    "Presymptomatic": "symptom",
    "PositiveConfirmation": "diagnosis",
    "NegativeConfirmation": "diagnosis",
    "Consultation": "other",
    "InvasiveTest": "diagnosis",
    "UninvasiveTest": "diagnosis",
    "Treatment": "other",
    "Trauma": "other",
    "SpontaneousAbortion": "death",
    "TherapeuticAbortion": "death",
}

_MARRIAGE_EVENT_STATUS_MAP = {
    "Marriage": "marriage",
    "Divorce": "divorce",
    "Separation": "separation",
    "Engagement": "engagement",
    "Unknown": "other",
    "Other": "other",
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


def _parse_xeg_date(date_str: str) -> str | None:
    """Parse XEG date format (DD/MM/YYYY HH:MM:SS) to ISO format."""
    if not date_str:
        return None
    try:
        dt = datetime.strptime(date_str.split(" ")[0], "%d/%m/%Y")
        return dt.strftime("%Y-%m-%d")
    except (ValueError, IndexError):
        return None


def _rgb_to_hex(r: int, g: int, b: int) -> str:
    """Convert RGB to hex colour string."""
    return f"#{r:02x}{g:02x}{b:02x}"


def _parse_colour(el: ET.Element) -> str | None:
    """Parse a <Colour> child element into a hex string."""
    colour_el = el.find("Colour")
    if colour_el is None:
        return None
    r_str = _text(colour_el, "R")
    g_str = _text(colour_el, "G")
    b_str = _text(colour_el, "B")
    if r_str and g_str and b_str:
        try:
            return _rgb_to_hex(int(r_str), int(g_str), int(b_str))
        except ValueError:
            pass
    return None


def _parse_events(events_el: ET.Element, status_map: dict[str, str]) -> list[Event]:
    """Parse Event elements from an Events container."""
    result: list[Event] = []
    for ev_el in events_el.findall("Event"):
        status = _text(ev_el, "Status")
        event_type = status_map.get(status, "other")
        date = _parse_xeg_date(_text(ev_el, "Date"))
        name = _text(ev_el, "Name")
        certainty = _text(ev_el, "Certainty")

        props: dict = {}
        if status:
            props["status"] = status
        if certainty and certainty != "Unknown":
            props["certainty"] = certainty

        result.append(Event(
            type=event_type,
            date=date,
            display_name=name,
            properties=props,
        ))
    return result


def parse_xeg(text: str) -> tuple[list[Individual], list[Relationship], list[Egg], list[Disease]]:
    """Parse an Evagene v1 .xeg XML file and return (individuals, relationships, eggs, diseases)."""
    # Strip UTF-8 BOM if present
    if text.startswith("\ufeff"):
        text = text[1:]
    root = ET.fromstring(text)

    # --- Parse Study Diseases → Disease catalog ---
    # Build xeg disease guid → Disease map for individual disease assignment
    disease_guid_to_id: dict[str, uuid.UUID] = {}
    diseases: list[Disease] = []

    for sd_el in root.findall(".//StudyDisease"):
        d_guid = _text(sd_el, "Guid")
        if not d_guid:
            continue
        d_name = _text(sd_el, "Name")
        d_colour = _parse_colour(sd_el) or ""
        d_id = uuid.uuid4()
        disease_guid_to_id[d_guid] = d_id
        diseases.append(Disease(
            id=d_id,
            display_name=d_name,
            color=d_colour,
        ))

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

        # Sex — prefer <Gender> when it carries more detail than <Sex>
        sex_str = _text(ind_el, "Sex")
        gender_str = _text(ind_el, "Gender")
        # Use Gender if it maps to a more specific type than basic Male/Female/Unknown
        if gender_str and gender_str not in ("Male", "Female", "Unknown", ""):
            bio_sex = _SEX_MAP.get(gender_str)
        else:
            bio_sex = _SEX_MAP.get(sex_str or gender_str)

        # Position
        x_str = _text(ind_el, "X")
        y_str = _text(ind_el, "Y")
        x = float(x_str) if x_str else None
        y = float(y_str) if y_str else None

        # Notes
        notes = _text(ind_el, "Notes")

        # Generation
        gen_str = _text(ind_el, "Generation")
        generation = None
        if gen_str:
            try:
                generation = int(gen_str)
            except ValueError:
                pass

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

        # Individual events
        events: list[Event] = []
        events_el = ind_el.find("Events")
        if events_el is not None:
            events = _parse_events(events_el, _EVENT_STATUS_MAP)

        # Individual disease manifestations
        ind_diseases: list[IndividualDisease] = []
        manifestations_el = ind_el.find("Manifestations")
        if manifestations_el is not None:
            for man_el in manifestations_el.findall("Manifestation"):
                study_ref = man_el.get("StudyDiseaseRef", "")
                if study_ref and study_ref in disease_guid_to_id:
                    ind_diseases.append(IndividualDisease(
                        disease_id=disease_guid_to_id[study_ref],
                    ))

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
            generation=generation,
            height_mm=height_mm,
            weight_g=weight_g,
            consent_to_share=consent,
            properties=props,
            events=events,
            diseases=ind_diseases,
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

        # Kinship / Consanguinity
        kinship_str = _text(mar_el, "Kinship")
        consanguinity = None
        if kinship_str:
            try:
                k = float(kinship_str)
                if k > 0:
                    consanguinity = k
            except ValueError:
                pass

        auto_kinship_str = _text(mar_el, "AutomaticKinship")
        consanguinity_override = auto_kinship_str.lower() == "false" if auto_kinship_str else False

        # Marriage events
        events: list[Event] = []
        events_el = mar_el.find("Events")
        if events_el is not None:
            events = _parse_events(events_el, _MARRIAGE_EVENT_STATUS_MAP)

        rel = Relationship(
            id=rel_id,
            display_name=_text(mar_el, "Name"),
            members=members,
            consanguinity=consanguinity,
            consanguinity_override=consanguinity_override,
            events=events,
        )
        relationships.append(rel)

    # --- Pass 3: Parse EggLists → Eggs ---
    # EggList → Egg → Siblings/Individual[@IndividualRef] gives the child
    # EggList → PregnancyRef → Pregnancy → MarriageRef gives the relationship
    eggs: list[Egg] = []

    # Build pregnancy_guid → (marriage_guid, parental_status1, parental_status2) map
    preg_to_marriage: dict[str, str] = {}
    preg_to_status: dict[str, tuple[str, str]] = {}

    # Pregnancies in PregnancyLists
    for pl_el in root.findall(".//PregnancyLists/PregnancyList"):
        mar_ref = pl_el.get("MarriageRef", "")
        for preg_el in pl_el.findall("Pregnancy"):
            preg_guid = _text(preg_el, "Guid")
            preg_mar = _text(preg_el, "MarriageRef") or mar_ref
            if preg_guid and preg_mar:
                preg_to_marriage[preg_guid] = preg_mar
            ps1 = _text(preg_el, "ParentalStatus1")
            ps2 = _text(preg_el, "ParentalStatus2")
            if preg_guid and (ps1 or ps2):
                preg_to_status[preg_guid] = (ps1, ps2)

    # Also standalone Pregnancies
    for preg_el in root.findall(".//Pregnancies/Pregnancy"):
        preg_guid = _text(preg_el, "Guid")
        preg_mar = _text(preg_el, "MarriageRef")
        if preg_guid:
            if preg_mar:
                preg_to_marriage[preg_guid] = preg_mar
            ps1 = _text(preg_el, "ParentalStatus1")
            ps2 = _text(preg_el, "ParentalStatus2")
            if ps1 or ps2:
                preg_to_status[preg_guid] = (ps1, ps2)

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
                egg_props: dict = {}
                # Parental status from pregnancy
                if preg_ref and preg_ref in preg_to_status:
                    ps1, ps2 = preg_to_status[preg_ref]
                    if ps1 and ps1 != "Natural":
                        egg_props["parental_status_1"] = ps1
                    if ps2 and ps2 != "Natural":
                        egg_props["parental_status_2"] = ps2

                eggs.append(Egg(
                    individual_id=child_uuid,
                    relationship_id=rel_id,
                    properties=egg_props,
                ))

    return individuals, relationships, eggs, diseases
