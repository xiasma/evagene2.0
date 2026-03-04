"""GEDCOM 5.5.1 parser and serializer for Evagene."""

from __future__ import annotations

import re
import uuid
from typing import Optional

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

# --- Date helpers ---

_GEDCOM_MONTHS = {
    "JAN": "01", "FEB": "02", "MAR": "03", "APR": "04",
    "MAY": "05", "JUN": "06", "JUL": "07", "AUG": "08",
    "SEP": "09", "OCT": "10", "NOV": "11", "DEC": "12",
}
_ISO_TO_GEDCOM_MONTH = {v: k for k, v in _GEDCOM_MONTHS.items()}


def _gedcom_date_to_iso(text: str) -> str:
    """Convert GEDCOM date (DD MMM YYYY / MMM YYYY / YYYY) to ISO."""
    parts = text.strip().split()
    if len(parts) == 3:
        day, mon, year = parts
        m = _GEDCOM_MONTHS.get(mon.upper())
        if m:
            return f"{year}-{m}-{day.zfill(2)}"
    elif len(parts) == 2:
        mon, year = parts
        m = _GEDCOM_MONTHS.get(mon.upper())
        if m:
            return f"{year}-{m}"
    elif len(parts) == 1 and parts[0].isdigit():
        return parts[0]
    return text  # pass through unrecognized


def _iso_to_gedcom_date(text: str) -> str:
    """Convert ISO date (YYYY-MM-DD / YYYY-MM / YYYY) to GEDCOM."""
    parts = text.split("-")
    if len(parts) == 3:
        year, month, day = parts
        mon = _ISO_TO_GEDCOM_MONTH.get(month, "")
        if mon:
            return f"{int(day)} {mon} {year}"
    elif len(parts) == 2:
        year, month = parts
        mon = _ISO_TO_GEDCOM_MONTH.get(month, "")
        if mon:
            return f"{mon} {year}"
    elif len(parts) == 1:
        return parts[0]
    return text


# --- Line parser ---

_LINE_RE = re.compile(r"^(\d+)\s+(@\S+@)?\s*(\S+)\s?(.*)?$")


def _parse_lines(text: str) -> list[tuple[int, str, str, str]]:
    """Parse GEDCOM text into (level, xref, tag, value) tuples."""
    result: list[tuple[int, str, str, str]] = []
    for raw in text.splitlines():
        line = raw.strip()
        if not line:
            continue
        m = _LINE_RE.match(line)
        if not m:
            continue
        level = int(m.group(1))
        xref = m.group(2) or ""
        tag = m.group(3)
        value = (m.group(4) or "").strip()
        result.append((level, xref, tag, value))
    return result


def _group_level0(lines: list[tuple[int, str, str, str]]) -> list[list[tuple[int, str, str, str]]]:
    """Group parsed lines into level-0 records."""
    groups: list[list[tuple[int, str, str, str]]] = []
    current: list[tuple[int, str, str, str]] = []
    for item in lines:
        if item[0] == 0:
            if current:
                groups.append(current)
            current = [item]
        else:
            current.append(item)
    if current:
        groups.append(current)
    return groups


def _get_sub(record: list[tuple[int, str, str, str]], tag: str, level: int = 1) -> Optional[str]:
    """Get value of first sub-tag at given level."""
    for lvl, _, t, v in record:
        if lvl == level and t == tag:
            return v
    return None


def _get_sub_of(record: list[tuple[int, str, str, str]], parent_tag: str, child_tag: str) -> Optional[str]:
    """Get nested sub-tag value, e.g. BIRT > DATE."""
    in_parent = False
    for lvl, _, t, v in record:
        if lvl == 1 and t == parent_tag:
            in_parent = True
            continue
        if lvl == 1 and t != parent_tag:
            in_parent = False
            continue
        if in_parent and lvl == 2 and t == child_tag:
            return v
    return None


def _collect_notes(record: list[tuple[int, str, str, str]]) -> str:
    """Collect NOTE with CONT/CONC continuation lines."""
    parts: list[str] = []
    in_note = False
    for lvl, _, t, v in record:
        if lvl == 1 and t == "NOTE":
            in_note = True
            parts.append(v)
        elif in_note and lvl == 2 and t == "CONT":
            parts.append("\n" + v)
        elif in_note and lvl == 2 and t == "CONC":
            parts.append(v)
        elif lvl == 1:
            in_note = False
    return "".join(parts)


# --- Public API ---


def parse_gedcom(
    text: str,
) -> tuple[list[Individual], list[Relationship], list[Egg]]:
    """Parse GEDCOM text and return (individuals, relationships, eggs)."""
    lines = _parse_lines(text)
    groups = _group_level0(lines)

    xref_to_uuid: dict[str, uuid.UUID] = {}
    individuals: list[Individual] = []
    relationships: list[Relationship] = []
    eggs_list: list[Egg] = []

    indi_records: list[list[tuple[int, str, str, str]]] = []
    fam_records: list[list[tuple[int, str, str, str]]] = []

    for group in groups:
        level0 = group[0]
        xref = level0[1]
        # Detect record type from the tag value at level 0
        tag_or_val = level0[2]
        value = level0[3]
        if tag_or_val == "INDI" or value == "INDI":
            if xref:
                xref_to_uuid[xref] = uuid.uuid4()
            indi_records.append(group)
        elif tag_or_val == "FAM" or value == "FAM":
            if xref:
                xref_to_uuid[xref] = uuid.uuid4()
            fam_records.append(group)

    # Pass 1: INDI records
    for group in indi_records:
        xref = group[0][1]
        ind_id = xref_to_uuid.get(xref, uuid.uuid4())

        # Parse NAME
        name_val = _get_sub(group, "NAME") or ""
        given_names: list[str] = []
        family_name = ""
        prefix = ""
        suffix = ""

        # Try structured sub-tags first
        givn = _get_sub_of(group, "NAME", "GIVN") if _get_sub(group, "NAME") is not None else None
        surn = _get_sub_of(group, "NAME", "SURN")
        npfx = _get_sub_of(group, "NAME", "NPFX")
        nsfx = _get_sub_of(group, "NAME", "NSFX")

        if givn:
            given_names = givn.split()
        if surn:
            family_name = surn
        if npfx:
            prefix = npfx
        if nsfx:
            suffix = nsfx

        # Fall back to parsing the NAME value itself
        if not given_names and not family_name and name_val:
            slash_match = re.match(r"^(.*?)/(.*?)/(.*)$", name_val)
            if slash_match:
                gn = slash_match.group(1).strip()
                if gn:
                    given_names = gn.split()
                family_name = slash_match.group(2).strip()
            else:
                parts = name_val.strip().split()
                if parts:
                    given_names = parts

        # SEX
        sex_val = _get_sub(group, "SEX") or ""
        sex_map = {"M": BiologicalSex.male, "F": BiologicalSex.female, "U": BiologicalSex.unknown}
        bio_sex = sex_map.get(sex_val.upper())

        # BIRT/DATE, DEAT/DATE
        birth_date_raw = _get_sub_of(group, "BIRT", "DATE")
        death_date_raw = _get_sub_of(group, "DEAT", "DATE")
        dob = _gedcom_date_to_iso(birth_date_raw) if birth_date_raw else None
        dod = _gedcom_date_to_iso(death_date_raw) if death_date_raw else None

        # Check if DEAT tag exists (even without a date)
        has_deat = any(t == "DEAT" and lvl == 1 for lvl, _, t, _ in group)

        # Notes
        notes = _collect_notes(group)

        # Custom tags
        x_val = _get_sub(group, "_X")
        y_val = _get_sub(group, "_Y")
        proband_val = _get_sub(group, "_PROBAND")
        affection_val = _get_sub(group, "_AFFECTION")
        fertility_val = _get_sub(group, "_FERTILITY")
        death_status_val = _get_sub(group, "_DEATH_STATUS")

        props: dict = {}
        if dob:
            props["date_of_birth"] = dob
        if dod:
            props["date_of_death"] = dod
            props["death_status"] = "dead"

        if death_status_val:
            try:
                props["death_status"] = DeathStatus(death_status_val).value
            except ValueError:
                props["death_status"] = death_status_val
        elif has_deat and "death_status" not in props:
            props["death_status"] = "dead"

        if affection_val:
            try:
                props["affection_status"] = AffectionStatus(affection_val).value
            except ValueError:
                props["affection_status"] = affection_val

        if fertility_val:
            try:
                props["fertility_status"] = FertilityStatus(fertility_val).value
            except ValueError:
                props["fertility_status"] = fertility_val

        x: float | None = None
        y: float | None = None
        if x_val:
            try:
                x = float(x_val)
            except ValueError:
                pass
        if y_val:
            try:
                y = float(y_val)
            except ValueError:
                pass

        proband = 0.0
        if proband_val:
            try:
                proband = float(proband_val)
            except ValueError:
                pass

        ind = Individual(
            id=ind_id,
            name=PersonName(given=given_names, family=family_name, prefix=prefix, suffix=suffix),
            biological_sex=bio_sex,
            x=x,
            y=y,
            notes=notes,
            proband=proband,
            properties=props,
        )
        individuals.append(ind)

    # Pass 2: FAM records
    for group in fam_records:
        xref = group[0][1]
        rel_id = xref_to_uuid.get(xref, uuid.uuid4())

        husb_xref = _get_sub(group, "HUSB")
        wife_xref = _get_sub(group, "WIFE")

        members: list[uuid.UUID] = []
        if husb_xref and husb_xref in xref_to_uuid:
            members.append(xref_to_uuid[husb_xref])
        if wife_xref and wife_xref in xref_to_uuid:
            members.append(xref_to_uuid[wife_xref])

        rel = Relationship(id=rel_id, members=members)
        relationships.append(rel)

        # Children
        in_chil = False
        current_chil_xref: str | None = None
        twin_val: str | None = None
        mono_val: str | None = None

        for lvl, _, tag, val in group:
            if lvl == 1 and tag == "CHIL":
                # Flush previous child
                if in_chil and current_chil_xref:
                    _add_egg(current_chil_xref, rel_id, xref_to_uuid, eggs_list, twin_val, mono_val)
                current_chil_xref = val
                twin_val = None
                mono_val = None
                in_chil = True
            elif in_chil and lvl == 2 and tag == "_TWIN":
                twin_val = val
            elif in_chil and lvl == 2 and tag == "_MONOZYGOTIC":
                mono_val = val
            elif lvl == 1:
                if in_chil and current_chil_xref:
                    _add_egg(current_chil_xref, rel_id, xref_to_uuid, eggs_list, twin_val, mono_val)
                    current_chil_xref = None
                    twin_val = None
                    mono_val = None
                in_chil = False

        # Flush last child
        if in_chil and current_chil_xref:
            _add_egg(current_chil_xref, rel_id, xref_to_uuid, eggs_list, twin_val, mono_val)

    return individuals, relationships, eggs_list


def _add_egg(
    chil_xref: str,
    rel_id: uuid.UUID,
    xref_map: dict[str, uuid.UUID],
    eggs_list: list[Egg],
    twin_val: str | None,
    mono_val: str | None,
) -> None:
    ind_id = xref_map.get(chil_xref)
    if ind_id is None:
        return
    props: dict = {}
    if twin_val:
        props["twin"] = twin_val
    if mono_val and mono_val.upper() in ("Y", "YES", "TRUE", "1"):
        props["monozygotic"] = True
    eggs_list.append(Egg(individual_id=ind_id, relationship_id=rel_id, properties=props))


# --- Serializer ---


def serialize_gedcom(
    individuals: list[Individual],
    relationships: list[Relationship],
    eggs: list[Egg],
    pedigree_name: str = "",
) -> str:
    """Serialize Evagene entities to GEDCOM 5.5.1 text."""
    lines: list[str] = []

    # Header
    lines.append("0 HEAD")
    lines.append("1 SOUR EVAGENE")
    lines.append("1 GEDC")
    lines.append("2 VERS 5.5.1")
    lines.append("2 FORM LINEAGE-LINKED")
    lines.append("1 CHAR UTF-8")
    if pedigree_name:
        lines.append(f"1 NOTE {pedigree_name}")

    # Build UUID → xref maps
    indi_xref: dict[uuid.UUID, str] = {}
    for i, ind in enumerate(individuals, 1):
        indi_xref[ind.id] = f"@I{i}@"

    fam_xref: dict[uuid.UUID, str] = {}
    for i, rel in enumerate(relationships, 1):
        fam_xref[rel.id] = f"@F{i}@"

    # INDI records
    for ind in individuals:
        xr = indi_xref[ind.id]
        lines.append(f"0 {xr} INDI")

        # NAME
        given_str = " ".join(ind.name.given) if ind.name.given else ""
        family_str = ind.name.family or ""
        if given_str or family_str:
            lines.append(f"1 NAME {given_str} /{family_str}/")
            if given_str:
                lines.append(f"2 GIVN {given_str}")
            if family_str:
                lines.append(f"2 SURN {family_str}")
            if ind.name.prefix:
                lines.append(f"2 NPFX {ind.name.prefix}")
            if ind.name.suffix:
                lines.append(f"2 NSFX {ind.name.suffix}")

        # SEX
        sex_map = {
            BiologicalSex.male: "M",
            BiologicalSex.female: "F",
        }
        sex_char = sex_map.get(ind.biological_sex, "U") if ind.biological_sex else None  # type: ignore[arg-type]
        if sex_char:
            lines.append(f"1 SEX {sex_char}")

        # BIRT
        dob = ind.properties.get("date_of_birth")
        if dob:
            lines.append("1 BIRT")
            lines.append(f"2 DATE {_iso_to_gedcom_date(str(dob))}")

        # DEAT
        dod = ind.properties.get("date_of_death")
        death_status = ind.properties.get("death_status", "")
        if dod:
            lines.append("1 DEAT")
            lines.append(f"2 DATE {_iso_to_gedcom_date(str(dod))}")
        elif death_status and death_status not in ("alive", "unknown"):
            lines.append("1 DEAT Y")

        # NOTE
        if ind.notes:
            note_lines = ind.notes.split("\n")
            lines.append(f"1 NOTE {note_lines[0]}")
            for nl in note_lines[1:]:
                lines.append(f"2 CONT {nl}")

        # Custom tags
        if ind.x is not None:
            lines.append(f"1 _X {ind.x}")
        if ind.y is not None:
            lines.append(f"1 _Y {ind.y}")
        if ind.proband:
            lines.append(f"1 _PROBAND {ind.proband}")
        if ind.properties.get("affection_status"):
            lines.append(f"1 _AFFECTION {ind.properties['affection_status']}")
        if ind.properties.get("fertility_status"):
            lines.append(f"1 _FERTILITY {ind.properties['fertility_status']}")
        if death_status and death_status not in ("alive", "unknown"):
            lines.append(f"1 _DEATH_STATUS {death_status}")

    # Build egg lookup: relationship_id → list of eggs
    rel_eggs: dict[uuid.UUID, list[Egg]] = {}
    for egg in eggs:
        if egg.relationship_id:
            rel_eggs.setdefault(egg.relationship_id, []).append(egg)

    # FAM records
    for rel in relationships:
        xr = fam_xref[rel.id]
        lines.append(f"0 {xr} FAM")

        # Determine HUSB/WIFE by biological sex
        for mid in rel.members:
            ind = next((i for i in individuals if i.id == mid), None)
            if ind is None:
                continue
            if ind.biological_sex == BiologicalSex.male:
                lines.append(f"1 HUSB {indi_xref.get(mid, '')}")
            elif ind.biological_sex == BiologicalSex.female:
                lines.append(f"1 WIFE {indi_xref.get(mid, '')}")
            else:
                # Default first member as HUSB, second as WIFE
                idx = rel.members.index(mid)
                tag = "HUSB" if idx == 0 else "WIFE"
                lines.append(f"1 {tag} {indi_xref.get(mid, '')}")

        # Children
        for egg in rel_eggs.get(rel.id, []):
            if egg.individual_id and egg.individual_id in indi_xref:
                lines.append(f"1 CHIL {indi_xref[egg.individual_id]}")
                twin = egg.properties.get("twin")
                if twin:
                    lines.append(f"2 _TWIN {twin}")
                mono = egg.properties.get("monozygotic")
                if mono:
                    lines.append("2 _MONOZYGOTIC Y")

    # Trailer
    lines.append("0 TRLR")
    return "\n".join(lines) + "\n"
