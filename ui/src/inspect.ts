import "./inspect.css";

// --- Types ---

interface PedigreeDetail {
  id: string;
  display_name: string;
  individual_ids: string[];
  relationship_ids: string[];
  egg_ids: string[];
  individuals: Individual[];
  relationships: Relationship[];
  eggs: Egg[];
  events: Event[];
  properties: Record<string, unknown>;
}

interface Individual {
  id: string;
  display_name: string;
  biological_sex: string | null;
  name: { given?: string[]; family?: string; prefix?: string };
  notes: string;
  properties: Record<string, unknown>;
  diseases: { disease_id: string; manifestations: unknown[] }[];
  markers: { marker_id: string; allele_1: string; allele_2: string; zygosity: string }[];
  events: Event[];
  x: number | null;
  y: number | null;
}

interface Relationship {
  id: string;
  display_name: string;
  members: string[];
  notes: string;
  properties: Record<string, unknown>;
  events: Event[];
}

interface Egg {
  id: string;
  display_name: string;
  individual_id: string | null;
  individual_ids: string[];
  relationship_id: string | null;
  properties: Record<string, unknown>;
  events: Event[];
}

interface Event {
  id: string;
  type: string;
  display_name: string;
  date: string | null;
  properties: Record<string, unknown>;
}

// --- State ---

let pedigreeData: PedigreeDetail | null = null;
const blades: HTMLDivElement[] = [];
const app = document.getElementById("inspect-app")!;

// --- API ---

async function api<T>(path: string): Promise<T> {
  const resp = await fetch(path, { headers: { "Content-Type": "application/json" } });
  if (!resp.ok) throw new Error(`${resp.status} ${resp.statusText}`);
  return resp.json();
}

// --- Helpers ---

function shortId(id: string): string {
  return id.slice(0, 8);
}

function entityLabel(_type: string, entity: { id: string; display_name?: string }): string {
  const name = entity.display_name || "";
  return name ? `${name} (${shortId(entity.id)})` : shortId(entity.id);
}

function findIndividual(id: string): Individual | undefined {
  return pedigreeData?.individuals.find((i) => i.id === id);
}

function findRelationship(id: string): Relationship | undefined {
  return pedigreeData?.relationships.find((r) => r.id === id);
}

function findEgg(id: string): Egg | undefined {
  return pedigreeData?.eggs.find((e) => e.id === id);
}

/** Get all child IDs for an egg (handles both individual_id and individual_ids) */
function getEggChildIds(egg: Egg): string[] {
  if (egg.individual_ids && egg.individual_ids.length > 0) return egg.individual_ids;
  if (egg.individual_id) return [egg.individual_id];
  return [];
}

// --- Blade management ---

function removeBladesAfter(index: number): void {
  while (blades.length > 0 && blades.length > index + 1) {
    const blade = blades.pop();
    if (blade) blade.remove();
  }
}

function addBlade(title: string, content: HTMLElement, afterIndex: number): void {
  removeBladesAfter(afterIndex);

  const blade = document.createElement("div");
  blade.className = "blade";

  const header = document.createElement("div");
  header.className = "blade-header";
  const h2 = document.createElement("h2");
  h2.textContent = title;
  const closeBtn = document.createElement("button");
  closeBtn.className = "blade-close";
  closeBtn.textContent = "\u00d7";
  closeBtn.addEventListener("click", () => {
    const idx = blades.indexOf(blade);
    if (idx >= 0) removeBladesAfter(idx - 1);
  });
  header.append(h2, closeBtn);

  const body = document.createElement("div");
  body.className = "blade-body";
  body.append(content);

  blade.append(header, body);
  app.append(blade);
  blades.push(blade);

  // Scroll to the new blade
  blade.scrollIntoView({ behavior: "smooth", inline: "end" });
}

// --- Build blade content ---

function buildLinkRow(
  type: string,
  entity: { id: string; display_name?: string },
  _bladeIndex: number,
  onClick: () => void,
): HTMLDivElement {
  const row = document.createElement("div");
  row.className = "entity-row";

  const badge = document.createElement("span");
  badge.className = `entity-badge entity-badge--${type}`;
  badge.textContent = type;

  const label = document.createElement("span");
  label.className = "entity-label";
  label.textContent = entityLabel(type, entity);

  const idSpan = document.createElement("span");
  idSpan.className = "entity-id";
  idSpan.textContent = entity.id;

  row.append(badge, label, idSpan);
  row.addEventListener("click", onClick);
  return row;
}

function buildPropertiesTable(props: Record<string, unknown>): HTMLElement {
  const entries = Object.entries(props).filter(([, v]) => v != null && v !== "" && v !== 0);
  if (entries.length === 0) {
    const em = document.createElement("em");
    em.textContent = "No properties";
    return em;
  }
  const table = document.createElement("table");
  table.className = "props-table";
  for (const [key, val] of entries) {
    const tr = document.createElement("tr");
    const td1 = document.createElement("td");
    td1.textContent = key;
    const td2 = document.createElement("td");
    td2.textContent = typeof val === "object" ? JSON.stringify(val) : String(val);
    tr.append(td1, td2);
    table.append(tr);
  }
  return table;
}

function buildEventsSection(events: Event[]): HTMLElement {
  if (events.length === 0) {
    const em = document.createElement("em");
    em.textContent = "No events";
    return em;
  }
  const ul = document.createElement("ul");
  ul.className = "events-list";
  for (const ev of events) {
    const li = document.createElement("li");
    li.textContent = `${ev.type}${ev.display_name ? ` "${ev.display_name}"` : ""}${ev.date ? ` (${ev.date})` : ""}`;
    if (Object.keys(ev.properties).length > 0) {
      li.append(buildPropertiesTable(ev.properties));
    }
    ul.append(li);
  }
  return ul;
}

function sectionHeader(text: string): HTMLHeadingElement {
  const h = document.createElement("h3");
  h.textContent = text;
  return h;
}

// --- Entity detail blades ---

function openIndividualBlade(id: string, afterIndex: number): void {
  const ind = findIndividual(id);
  if (!ind) return;

  const frag = document.createElement("div");

  // Summary
  const summary = document.createElement("div");
  summary.className = "entity-summary";
  summary.innerHTML = `
    <div><strong>Sex:</strong> ${ind.biological_sex ?? "unknown"}</div>
    <div><strong>Name:</strong> ${[ind.name?.prefix, ...(ind.name?.given ?? []), ind.name?.family].filter(Boolean).join(" ") || "(none)"}</div>
    <div><strong>Position:</strong> ${ind.x != null ? `${ind.x}, ${ind.y}` : "unplaced"}</div>
    ${ind.notes ? `<div><strong>Notes:</strong> ${ind.notes}</div>` : ""}
  `;
  frag.append(summary);

  // Properties
  frag.append(sectionHeader("Properties"));
  frag.append(buildPropertiesTable(ind.properties));

  // Events
  frag.append(sectionHeader("Events"));
  frag.append(buildEventsSection(ind.events));

  // Diseases
  if (ind.diseases.length > 0) {
    frag.append(sectionHeader(`Diseases (${ind.diseases.length})`));
    const ul = document.createElement("ul");
    for (const d of ind.diseases) {
      const li = document.createElement("li");
      li.textContent = `${shortId(d.disease_id)} — ${d.manifestations.length} manifestation(s)`;
      ul.append(li);
    }
    frag.append(ul);
  }

  // Markers
  if (ind.markers.length > 0) {
    frag.append(sectionHeader(`Markers (${ind.markers.length})`));
    const ul = document.createElement("ul");
    for (const m of ind.markers) {
      const li = document.createElement("li");
      li.textContent = `${shortId(m.marker_id)} — ${m.allele_1}/${m.allele_2} (${m.zygosity || "unknown"})`;
      ul.append(li);
    }
    frag.append(ul);
  }

  // Related: relationships where this individual is a member
  const memberOf = pedigreeData!.relationships.filter((r) => r.members.includes(id));
  if (memberOf.length > 0) {
    frag.append(sectionHeader(`Relationships as member (${memberOf.length})`));
    for (const rel of memberOf) {
      frag.append(buildLinkRow("relationship", rel, afterIndex + 1, () => {
        openRelationshipBlade(rel.id, afterIndex + 1);
      }));
    }
  }

  // Related: eggs where this individual is the child
  const childEggs = pedigreeData!.eggs.filter((e) => getEggChildIds(e).includes(id));
  if (childEggs.length > 0) {
    frag.append(sectionHeader(`Eggs as child (${childEggs.length})`));
    for (const egg of childEggs) {
      frag.append(buildLinkRow("egg", egg, afterIndex + 1, () => {
        openEggBlade(egg.id, afterIndex + 1);
      }));
    }
  }

  // Related: relationships where this individual is a child (via egg)
  const parentRels = childEggs
    .filter((e) => e.relationship_id)
    .map((e) => findRelationship(e.relationship_id!))
    .filter((r): r is Relationship => r != null);
  if (parentRels.length > 0) {
    frag.append(sectionHeader(`Parent relationships (${parentRels.length})`));
    for (const rel of parentRels) {
      frag.append(buildLinkRow("relationship", rel, afterIndex + 1, () => {
        openRelationshipBlade(rel.id, afterIndex + 1);
      }));
    }
  }

  const sexIcon = ind.biological_sex === "female" ? "\u2640" : ind.biological_sex === "male" ? "\u2642" : "?";
  addBlade(`${sexIcon} Individual: ${entityLabel("individual", ind)}`, frag, afterIndex);
}

function openRelationshipBlade(id: string, afterIndex: number): void {
  const rel = findRelationship(id);
  if (!rel) return;

  const frag = document.createElement("div");

  // Members
  frag.append(sectionHeader(`Members (${rel.members.length})`));
  for (const memId of rel.members) {
    const ind = findIndividual(memId);
    if (ind) {
      frag.append(buildLinkRow("individual", ind, afterIndex + 1, () => {
        openIndividualBlade(ind.id, afterIndex + 1);
      }));
    } else {
      const missing = document.createElement("div");
      missing.className = "entity-row entity-row--missing";
      missing.textContent = `Missing individual: ${memId}`;
      frag.append(missing);
    }
  }

  // Children (via eggs) — grouped as pregnancies
  const relEggs = pedigreeData!.eggs.filter((e) => e.relationship_id === id);
  if (relEggs.length > 0) {
    frag.append(sectionHeader(`Pregnancies / Eggs (${relEggs.length})`));

    // Group by twin_group
    const groups = new Map<string, Egg[]>();
    const ungrouped: Egg[] = [];
    for (const egg of relEggs) {
      const twinGroup = egg.properties?.twin_group as string | undefined;
      if (twinGroup && egg.properties?.twin) {
        if (!groups.has(twinGroup)) groups.set(twinGroup, []);
        groups.get(twinGroup)!.push(egg);
      } else {
        ungrouped.push(egg);
      }
    }

    // Render ungrouped eggs (single pregnancies)
    for (const egg of ungrouped) {
      const childIds = getEggChildIds(egg);
      const childNames = childIds.map((cid) => findIndividual(cid)?.display_name || shortId(cid)).join(", ");
      const label = childNames || "no child";
      frag.append(buildLinkRow("egg", { ...egg, display_name: `Pregnancy: ${label}` }, afterIndex + 1, () => {
        openEggBlade(egg.id, afterIndex + 1);
      }));
      for (const cid of childIds) {
        const child = findIndividual(cid);
        if (child) {
          const indent = document.createElement("div");
          indent.className = "entity-indent";
          indent.append(buildLinkRow("individual", child, afterIndex + 1, () => {
            openIndividualBlade(child.id, afterIndex + 1);
          }));
          frag.append(indent);
        }
      }
    }

    // Render twin groups
    for (const [groupId, groupEggs] of groups) {
      const isMono = groupEggs.some((e) => e.properties?.monozygotic);
      const allChildIds = groupEggs.flatMap((e) => getEggChildIds(e));
      const uniqueChildIds = [...new Set(allChildIds)];
      const childNames = uniqueChildIds.map((cid) => findIndividual(cid)?.display_name || shortId(cid)).join(", ");
      const typeLabel = isMono ? "Monozygotic" : "Dizygotic";

      const groupHeader = document.createElement("div");
      groupHeader.className = "entity-row";
      groupHeader.style.fontWeight = "600";
      groupHeader.style.color = isMono ? "var(--ok)" : "var(--badge-egg)";
      groupHeader.textContent = `${typeLabel} twins (group ${shortId(groupId)}): ${childNames}`;
      frag.append(groupHeader);

      for (const egg of groupEggs) {
        const indent = document.createElement("div");
        indent.className = "entity-indent";
        indent.append(buildLinkRow("egg", {
          ...egg,
          display_name: `Egg: ${getEggChildIds(egg).map((cid) => findIndividual(cid)?.display_name || shortId(cid)).join(", ") || "no child"}`,
        }, afterIndex + 1, () => {
          openEggBlade(egg.id, afterIndex + 1);
        }));
        frag.append(indent);

        for (const cid of getEggChildIds(egg)) {
          const child = findIndividual(cid);
          if (child) {
            const indent2 = document.createElement("div");
            indent2.className = "entity-indent";
            indent2.style.paddingLeft = "48px";
            indent2.append(buildLinkRow("individual", child, afterIndex + 1, () => {
              openIndividualBlade(child.id, afterIndex + 1);
            }));
            frag.append(indent2);
          }
        }
      }
    }
  }

  // Properties
  frag.append(sectionHeader("Properties"));
  frag.append(buildPropertiesTable(rel.properties));

  // Events
  frag.append(sectionHeader("Events"));
  frag.append(buildEventsSection(rel.events));

  if (rel.notes) {
    frag.append(sectionHeader("Notes"));
    const p = document.createElement("p");
    p.textContent = rel.notes;
    frag.append(p);
  }

  addBlade(`Relationship: ${entityLabel("relationship", rel)}`, frag, afterIndex);
}

function openEggBlade(id: string, afterIndex: number): void {
  const egg = findEgg(id);
  if (!egg) return;

  const frag = document.createElement("div");

  // Children
  const childIds = getEggChildIds(egg);
  frag.append(sectionHeader(childIds.length > 1 ? `Children (${childIds.length})` : "Child"));
  if (childIds.length > 0) {
    for (const cid of childIds) {
      const child = findIndividual(cid);
      if (child) {
        frag.append(buildLinkRow("individual", child, afterIndex + 1, () => {
          openIndividualBlade(child.id, afterIndex + 1);
        }));
      } else {
        const missing = document.createElement("div");
        missing.className = "entity-row entity-row--missing";
        missing.textContent = `Missing individual: ${cid}`;
        frag.append(missing);
      }
    }
  } else {
    const em = document.createElement("em");
    em.textContent = "No child linked";
    frag.append(em);
  }

  // Relationship (parent)
  frag.append(sectionHeader("Parent Relationship"));
  if (egg.relationship_id) {
    const rel = findRelationship(egg.relationship_id);
    if (rel) {
      frag.append(buildLinkRow("relationship", rel, afterIndex + 1, () => {
        openRelationshipBlade(rel.id, afterIndex + 1);
      }));
    } else {
      const missing = document.createElement("div");
      missing.className = "entity-row entity-row--missing";
      missing.textContent = `Missing relationship: ${egg.relationship_id}`;
      frag.append(missing);
    }
  } else {
    const em = document.createElement("em");
    em.textContent = "No relationship linked";
    frag.append(em);
  }

  // Properties
  frag.append(sectionHeader("Properties"));
  frag.append(buildPropertiesTable(egg.properties));

  // Events
  frag.append(sectionHeader("Events"));
  frag.append(buildEventsSection(egg.events));

  const childCount = childIds.length;
  const label = childCount > 1 ? `Shared egg (${childCount} children)` : "Egg";
  addBlade(`${label}: ${entityLabel("egg", egg)}`, frag, afterIndex);
}

// --- Root blade: pedigree overview ---

function buildOverviewBlade(): void {
  if (!pedigreeData) return;

  const frag = document.createElement("div");

  // Pedigree meta
  const meta = document.createElement("div");
  meta.className = "entity-summary";
  meta.innerHTML = `
    <div><strong>ID:</strong> ${pedigreeData.id}</div>
    <div><strong>Name:</strong> ${pedigreeData.display_name || "(unnamed)"}</div>
    <div><a href="/pedigrees/${pedigreeData.id}" target="_blank">Open in editor</a></div>
  `;
  frag.append(meta);

  // Individuals
  frag.append(sectionHeader(`Individuals (${pedigreeData.individuals.length})`));
  for (const ind of pedigreeData.individuals) {
    const sexIcon = ind.biological_sex === "female" ? "\u2640" : ind.biological_sex === "male" ? "\u2642" : "?";
    const row = buildLinkRow("individual", { ...ind, display_name: `${sexIcon} ${ind.display_name || ""}`.trim() }, 0, () => {
      openIndividualBlade(ind.id, 0);
    });
    frag.append(row);
  }

  // Relationships
  frag.append(sectionHeader(`Relationships (${pedigreeData.relationships.length})`));
  for (const rel of pedigreeData.relationships) {
    const memberNames = rel.members.map((m) => {
      const ind = findIndividual(m);
      return ind ? (ind.display_name || shortId(m)) : shortId(m);
    }).join(" \u2194 ");
    const row = buildLinkRow("relationship", { ...rel, display_name: memberNames || rel.display_name }, 0, () => {
      openRelationshipBlade(rel.id, 0);
    });
    frag.append(row);
  }

  // Pregnancies — grouped view by relationship
  frag.append(sectionHeader("Pregnancies"));
  const eggsByRel = new Map<string, Egg[]>();
  for (const egg of pedigreeData.eggs) {
    const relId = egg.relationship_id || "__orphan__";
    if (!eggsByRel.has(relId)) eggsByRel.set(relId, []);
    eggsByRel.get(relId)!.push(egg);
  }

  for (const [relId, relEggs] of eggsByRel) {
    const rel = relId !== "__orphan__" ? findRelationship(relId) : null;
    const relLabel = rel
      ? rel.members.map((m) => findIndividual(m)?.display_name || shortId(m)).join(" \u00d7 ")
      : relId === "__orphan__" ? "Orphaned" : shortId(relId);

    // Group by twin_group
    const twinGroups = new Map<string, Egg[]>();
    const singles: Egg[] = [];
    for (const egg of relEggs) {
      const grp = egg.properties?.twin_group as string | undefined;
      if (grp && egg.properties?.twin) {
        if (!twinGroups.has(grp)) twinGroups.set(grp, []);
        twinGroups.get(grp)!.push(egg);
      } else {
        singles.push(egg);
      }
    }

    const totalPregnancies = singles.length + twinGroups.size;

    const relRow = document.createElement("div");
    relRow.className = "entity-row";
    relRow.style.fontWeight = "600";
    relRow.textContent = `${relLabel} — ${totalPregnancies} pregnanc${totalPregnancies === 1 ? "y" : "ies"}`;
    if (rel) {
      relRow.style.cursor = "pointer";
      relRow.addEventListener("click", () => openRelationshipBlade(rel.id, 0));
    }
    frag.append(relRow);

    // Singles
    for (const egg of singles) {
      const childIds = getEggChildIds(egg);
      const childNames = childIds.map((cid) => findIndividual(cid)?.display_name || shortId(cid)).join(", ");
      const indent = document.createElement("div");
      indent.className = "entity-indent";
      indent.append(buildLinkRow("egg", { ...egg, display_name: childNames || "no child" }, 0, () => {
        openEggBlade(egg.id, 0);
      }));
      frag.append(indent);
    }

    // Twin groups
    for (const [groupId, groupEggs] of twinGroups) {
      const isMono = groupEggs.some((e) => e.properties?.monozygotic);
      const allChildIds = [...new Set(groupEggs.flatMap((e) => getEggChildIds(e)))];
      const childNames = allChildIds.map((cid) => findIndividual(cid)?.display_name || shortId(cid)).join(", ");
      const typeLabel = isMono ? "MZ" : "DZ";
      const indent = document.createElement("div");
      indent.className = "entity-indent";
      const label = document.createElement("span");
      label.style.color = isMono ? "var(--ok)" : "var(--badge-egg)";
      label.textContent = `[${typeLabel}] ${childNames} (${groupEggs.length} egg${groupEggs.length === 1 ? "" : "s"}, group ${shortId(groupId)})`;
      indent.append(label);
      frag.append(indent);
    }
  }

  // Eggs (raw)
  frag.append(sectionHeader(`Eggs (${pedigreeData.eggs.length})`));
  for (const egg of pedigreeData.eggs) {
    const childIds = getEggChildIds(egg);
    const childName = childIds.length > 0
      ? childIds.map((cid) => findIndividual(cid)?.display_name || shortId(cid)).join(", ")
      : "no child";
    const relLabel = egg.relationship_id ? shortId(egg.relationship_id) : "no rel";
    const row = buildLinkRow("egg", { ...egg, display_name: `${childName} \u2190 ${relLabel}` }, 0, () => {
      openEggBlade(egg.id, 0);
    });
    frag.append(row);
  }

  // Integrity checks
  frag.append(sectionHeader("Integrity Checks"));
  const issues = runIntegrityChecks();
  if (issues.length === 0) {
    const ok = document.createElement("div");
    ok.className = "integrity-ok";
    ok.textContent = "All checks passed";
    frag.append(ok);
  } else {
    const ul = document.createElement("ul");
    ul.className = "integrity-issues";
    for (const issue of issues) {
      const li = document.createElement("li");
      li.textContent = issue;
      ul.append(li);
    }
    frag.append(ul);
  }

  addBlade(`Pedigree: ${pedigreeData.display_name || shortId(pedigreeData.id)}`, frag, -1);
}

function runIntegrityChecks(): string[] {
  if (!pedigreeData) return [];
  const issues: string[] = [];
  const indIds = new Set(pedigreeData.individuals.map((i) => i.id));
  const relIds = new Set(pedigreeData.relationships.map((r) => r.id));
  const eggIds = new Set(pedigreeData.eggs.map((e) => e.id));

  // Check pedigree ID lists match actual entities
  for (const id of pedigreeData.individual_ids) {
    if (!indIds.has(id)) issues.push(`Pedigree references individual ${id} but it doesn't exist`);
  }
  for (const id of pedigreeData.relationship_ids) {
    if (!relIds.has(id)) issues.push(`Pedigree references relationship ${id} but it doesn't exist`);
  }
  for (const id of pedigreeData.egg_ids) {
    if (!eggIds.has(id)) issues.push(`Pedigree references egg ${id} but it doesn't exist`);
  }

  // Check relationship members exist
  for (const rel of pedigreeData.relationships) {
    for (const memId of rel.members) {
      if (!indIds.has(memId)) {
        issues.push(`Relationship ${shortId(rel.id)} references member ${memId} which doesn't exist`);
      }
    }
  }

  // Check egg references
  for (const egg of pedigreeData.eggs) {
    for (const cid of getEggChildIds(egg)) {
      if (!indIds.has(cid)) {
        issues.push(`Egg ${shortId(egg.id)} references individual ${cid} which doesn't exist`);
      }
    }
    if (egg.relationship_id && !relIds.has(egg.relationship_id)) {
      issues.push(`Egg ${shortId(egg.id)} references relationship ${egg.relationship_id} which doesn't exist`);
    }
  }

  // Orphan check: individuals not in any relationship and not linked by any egg
  const referencedInds = new Set<string>();
  for (const rel of pedigreeData.relationships) {
    for (const m of rel.members) referencedInds.add(m);
  }
  for (const egg of pedigreeData.eggs) {
    for (const cid of getEggChildIds(egg)) referencedInds.add(cid);
  }

  // Duplicate members in relationships
  for (const rel of pedigreeData.relationships) {
    const seen = new Set<string>();
    for (const m of rel.members) {
      if (seen.has(m)) issues.push(`Relationship ${shortId(rel.id)} has duplicate member ${shortId(m)}`);
      seen.add(m);
    }
  }

  // Eggs with neither individual nor relationship
  for (const egg of pedigreeData.eggs) {
    if (getEggChildIds(egg).length === 0 && !egg.relationship_id) {
      issues.push(`Egg ${shortId(egg.id)} has no individual and no relationship — orphan egg`);
    }
  }

  return issues;
}

// --- Init ---

async function initInspector() {
  const match = window.location.pathname.match(/^\/inspect\/([0-9a-f-]+)/i);
  if (!match) {
    app.innerHTML = `<div class="inspect-landing">
      <h1>Evagene Inspector</h1>
      <p>Enter a pedigree URL: <code>/inspect/&lt;pedigree-id&gt;</code></p>
      <p>Or go to the <a href="/">editor</a> and copy the ID from the URL.</p>
    </div>`;
    return;
  }

  const id = match[1];
  try {
    pedigreeData = await api<PedigreeDetail>(`/api/pedigrees/${id}`);
  } catch (err) {
    app.innerHTML = `<div class="inspect-landing"><h1>Pedigree not found</h1><p>ID: ${id}</p><p>${err}</p></div>`;
    return;
  }

  buildOverviewBlade();
}

initInspector().catch((err) => {
  app.innerHTML = `<div class="inspect-landing"><h1>Error</h1><pre>${err}\n${err instanceof Error ? err.stack : ""}</pre></div>`;
});
