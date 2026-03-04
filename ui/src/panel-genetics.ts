import "./panel.css";
import {
  PanelCallbacks,
  DebouncerGroup,
  buildPanelShell,
  makeField,
  makeInput,
  makeSelect,
  makeTextarea,
  makeCheckboxRow,
} from "./panel-utils";

// --- Types ---

interface SpeciesData {
  id: string;
  display_name: string;
  ploidy: number;
  notes: string;
  chromosome_ids: string[];
}

interface ChromosomeData {
  id: string;
  display_name: string;
  base_pairs: number | null;
  source: string | null;
  autosome: boolean;
  notes: string;
  marker_ids: string[];
}

interface MarkerData {
  id: string;
  display_name: string;
  type: string | null;
  chromosome_band: string;
  base_pairs: number | null;
  centimorgans: number | null;
  mckusick_number: string;
  enzyme_used: string;
  probe_used: string;
  notes: string;
}

interface DiseaseData {
  id: string;
  display_name: string;
  color: string;
  notes: string;
  marker_ids: string[];
}

// --- Constants ---

const TABS = ["Species", "Chromosomes", "Markers", "Diseases"] as const;
type TabName = (typeof TABS)[number];

const SOURCE_OPTIONS = [
  ["", "(none)"],
  ["unknown", "Unknown"],
  ["parents", "Parents"],
  ["mitochondria", "Mitochondria"],
  ["chloroplasts", "Chloroplasts"],
  ["other", "Other"],
];

const MARKER_TYPE_OPTIONS = [
  ["", "(none)"],
  ["unknown", "Unknown"],
  ["gene", "Gene"],
  ["regulator", "Regulator"],
  ["marker", "Marker"],
  ["other", "Other"],
];

// --- Module state ---

let callbacks: PanelCallbacks;
let sidebar: HTMLDivElement;
let debouncer = new DebouncerGroup();
let activeTab: TabName = "Species";

// --- Init ---

export function initGeneticsPanel(cbs: PanelCallbacks): void {
  callbacks = cbs;
  sidebar = document.getElementById("sidebar") as HTMLDivElement;
}

// --- Open / Close ---

export async function openGeneticsPanel(): Promise<void> {
  const wasHidden = sidebar.classList.contains("hidden");
  sidebar.classList.remove("hidden");

  if (wasHidden) {
    sidebar.style.right = "24px";
    sidebar.style.top = "80px";
    sidebar.style.left = "auto";
  }

  await buildPanel();
}

export function closeGeneticsPanel(): void {
  sidebar.classList.add("hidden");
  debouncer.clear();
}

// --- Build panel ---

async function buildPanel(): Promise<void> {
  debouncer.clear();
  debouncer = new DebouncerGroup();

  const { body } = buildPanelShell(sidebar, "Genetics", () => {
    closeGeneticsPanel();
    callbacks.onClose();
  });

  // Tab bar
  const tabBar = document.createElement("div");
  tabBar.className = "genetics-tab-bar";
  for (const tab of TABS) {
    const btn = document.createElement("button");
    btn.className = "genetics-tab" + (tab === activeTab ? " active" : "");
    btn.textContent = tab;
    btn.addEventListener("click", () => {
      activeTab = tab;
      buildPanel();
    });
    tabBar.append(btn);
  }
  body.append(tabBar);

  // Tab content
  const content = document.createElement("div");
  content.className = "genetics-tab-content";
  body.append(content);

  switch (activeTab) {
    case "Species": await buildSpeciesTab(content); break;
    case "Chromosomes": await buildChromosomesTab(content); break;
    case "Markers": await buildMarkersTab(content); break;
    case "Diseases": await buildDiseasesTab(content); break;
  }
}

// --- Species tab ---

async function buildSpeciesTab(container: HTMLElement): Promise<void> {
  let items: SpeciesData[];
  try {
    items = await callbacks.api<SpeciesData[]>("/api/species");
  } catch {
    items = [];
  }

  for (const sp of items) {
    container.append(buildAccordionItem(sp.display_name || "Species", (body) => {
      const elName = makeInput();
      elName.value = sp.display_name;
      elName.addEventListener("change", () => {
        callbacks.onBeforeMutation();
        callbacks.api(`/api/species/${sp.id}`, {
          method: "PATCH",
          body: JSON.stringify({ display_name: elName.value }),
        }).then(() => callbacks.onUpdate());
      });

      const elPloidy = makeInput("number");
      elPloidy.value = String(sp.ploidy);
      elPloidy.addEventListener("change", () => {
        callbacks.onBeforeMutation();
        callbacks.api(`/api/species/${sp.id}`, {
          method: "PATCH",
          body: JSON.stringify({ ploidy: parseInt(elPloidy.value, 10) || 2 }),
        }).then(() => callbacks.onUpdate());
      });

      const elNotes = makeTextarea(2);
      elNotes.value = sp.notes;
      elNotes.addEventListener("change", () => {
        callbacks.onBeforeMutation();
        callbacks.api(`/api/species/${sp.id}`, {
          method: "PATCH",
          body: JSON.stringify({ notes: elNotes.value }),
        }).then(() => callbacks.onUpdate());
      });

      body.append(
        makeField("Name", elName),
        makeField("Ploidy", elPloidy),
        makeField("Notes", elNotes),
      );

      // Chromosome sub-list
      if (sp.chromosome_ids.length > 0) {
        const subHeading = document.createElement("div");
        subHeading.className = "sub-resource-label";
        subHeading.textContent = `Chromosomes (${sp.chromosome_ids.length})`;
        body.append(subHeading);
      }
    }, async () => {
      callbacks.onBeforeMutation();
      await callbacks.api(`/api/species/${sp.id}`, { method: "DELETE" });
      await callbacks.onUpdate();
      buildPanel();
    }));
  }

  container.append(buildAddButton("+ Add Species", async () => {
    callbacks.onBeforeMutation();
    await callbacks.api("/api/species", {
      method: "POST",
      body: JSON.stringify({ display_name: "New Species" }),
    });
    await callbacks.onUpdate();
    buildPanel();
  }));
}

// --- Chromosomes tab ---

async function buildChromosomesTab(container: HTMLElement): Promise<void> {
  let items: ChromosomeData[];
  try {
    items = await callbacks.api<ChromosomeData[]>("/api/chromosomes");
  } catch {
    items = [];
  }

  for (const ch of items) {
    container.append(buildAccordionItem(
      `${ch.display_name || "Chromosome"}${ch.autosome ? "" : " (sex)"}`,
      (body) => {
        const elName = makeInput();
        elName.value = ch.display_name;
        elName.addEventListener("change", () => {
          callbacks.onBeforeMutation();
          callbacks.api(`/api/chromosomes/${ch.id}`, {
            method: "PATCH",
            body: JSON.stringify({ display_name: elName.value }),
          }).then(() => callbacks.onUpdate());
        });

        const elAutosome = makeInput("checkbox") as HTMLInputElement;
        elAutosome.checked = ch.autosome;
        elAutosome.addEventListener("change", () => {
          callbacks.onBeforeMutation();
          callbacks.api(`/api/chromosomes/${ch.id}`, {
            method: "PATCH",
            body: JSON.stringify({ autosome: elAutosome.checked }),
          }).then(() => callbacks.onUpdate());
        });

        const elBasePairs = makeInput("number");
        elBasePairs.value = ch.base_pairs != null ? String(ch.base_pairs) : "";
        elBasePairs.addEventListener("change", () => {
          callbacks.onBeforeMutation();
          const val = elBasePairs.value === "" ? null : parseInt(elBasePairs.value, 10);
          callbacks.api(`/api/chromosomes/${ch.id}`, {
            method: "PATCH",
            body: JSON.stringify({ base_pairs: val }),
          }).then(() => callbacks.onUpdate());
        });

        const elSource = makeSelect(SOURCE_OPTIONS);
        elSource.value = ch.source ?? "";
        elSource.addEventListener("change", () => {
          callbacks.onBeforeMutation();
          callbacks.api(`/api/chromosomes/${ch.id}`, {
            method: "PATCH",
            body: JSON.stringify({ source: elSource.value || null }),
          }).then(() => callbacks.onUpdate());
        });

        const elNotes = makeTextarea(2);
        elNotes.value = ch.notes;
        elNotes.addEventListener("change", () => {
          callbacks.onBeforeMutation();
          callbacks.api(`/api/chromosomes/${ch.id}`, {
            method: "PATCH",
            body: JSON.stringify({ notes: elNotes.value }),
          }).then(() => callbacks.onUpdate());
        });

        body.append(
          makeField("Name", elName),
          makeCheckboxRow("Autosome", elAutosome),
          makeField("Base pairs", elBasePairs),
          makeField("Source", elSource),
          makeField("Notes", elNotes),
        );

        // Marker sub-list
        if (ch.marker_ids.length > 0) {
          const subHeading = document.createElement("div");
          subHeading.className = "sub-resource-label";
          subHeading.textContent = `Markers (${ch.marker_ids.length})`;
          body.append(subHeading);
        }
      },
      async () => {
        callbacks.onBeforeMutation();
        await callbacks.api(`/api/chromosomes/${ch.id}`, { method: "DELETE" });
        await callbacks.onUpdate();
        buildPanel();
      },
    ));
  }

  container.append(buildAddButton("+ Add Chromosome", async () => {
    callbacks.onBeforeMutation();
    await callbacks.api("/api/chromosomes", {
      method: "POST",
      body: JSON.stringify({ display_name: "New Chromosome" }),
    });
    await callbacks.onUpdate();
    buildPanel();
  }));
}

// --- Markers tab ---

async function buildMarkersTab(container: HTMLElement): Promise<void> {
  let items: MarkerData[];
  try {
    items = await callbacks.api<MarkerData[]>("/api/markers");
  } catch {
    items = [];
  }

  for (const mk of items) {
    const typeLabel = mk.type ? ` (${mk.type})` : "";
    container.append(buildAccordionItem(
      `${mk.display_name || "Marker"}${typeLabel}`,
      (body) => {
        const elName = makeInput();
        elName.value = mk.display_name;
        elName.addEventListener("change", () => {
          callbacks.onBeforeMutation();
          callbacks.api(`/api/markers/${mk.id}`, {
            method: "PATCH",
            body: JSON.stringify({ display_name: elName.value }),
          }).then(() => callbacks.onUpdate());
        });

        const elType = makeSelect(MARKER_TYPE_OPTIONS);
        elType.value = mk.type ?? "";
        elType.addEventListener("change", () => {
          callbacks.onBeforeMutation();
          callbacks.api(`/api/markers/${mk.id}`, {
            method: "PATCH",
            body: JSON.stringify({ type: elType.value || null }),
          }).then(() => callbacks.onUpdate());
        });

        const elBand = makeInput();
        elBand.value = mk.chromosome_band;
        elBand.addEventListener("change", () => {
          callbacks.onBeforeMutation();
          callbacks.api(`/api/markers/${mk.id}`, {
            method: "PATCH",
            body: JSON.stringify({ chromosome_band: elBand.value }),
          }).then(() => callbacks.onUpdate());
        });

        const elBasePairs = makeInput("number");
        elBasePairs.value = mk.base_pairs != null ? String(mk.base_pairs) : "";
        elBasePairs.addEventListener("change", () => {
          callbacks.onBeforeMutation();
          const val = elBasePairs.value === "" ? null : parseInt(elBasePairs.value, 10);
          callbacks.api(`/api/markers/${mk.id}`, {
            method: "PATCH",
            body: JSON.stringify({ base_pairs: val }),
          }).then(() => callbacks.onUpdate());
        });

        const elCentimorgans = makeInput("number");
        elCentimorgans.value = mk.centimorgans != null ? String(mk.centimorgans) : "";
        elCentimorgans.addEventListener("change", () => {
          callbacks.onBeforeMutation();
          const val = elCentimorgans.value === "" ? null : parseInt(elCentimorgans.value, 10);
          callbacks.api(`/api/markers/${mk.id}`, {
            method: "PATCH",
            body: JSON.stringify({ centimorgans: val }),
          }).then(() => callbacks.onUpdate());
        });

        const elMckusick = makeInput();
        elMckusick.value = mk.mckusick_number;
        elMckusick.addEventListener("change", () => {
          callbacks.onBeforeMutation();
          callbacks.api(`/api/markers/${mk.id}`, {
            method: "PATCH",
            body: JSON.stringify({ mckusick_number: elMckusick.value }),
          }).then(() => callbacks.onUpdate());
        });

        const elEnzyme = makeInput();
        elEnzyme.value = mk.enzyme_used;
        elEnzyme.addEventListener("change", () => {
          callbacks.onBeforeMutation();
          callbacks.api(`/api/markers/${mk.id}`, {
            method: "PATCH",
            body: JSON.stringify({ enzyme_used: elEnzyme.value }),
          }).then(() => callbacks.onUpdate());
        });

        const elProbe = makeInput();
        elProbe.value = mk.probe_used;
        elProbe.addEventListener("change", () => {
          callbacks.onBeforeMutation();
          callbacks.api(`/api/markers/${mk.id}`, {
            method: "PATCH",
            body: JSON.stringify({ probe_used: elProbe.value }),
          }).then(() => callbacks.onUpdate());
        });

        const elNotes = makeTextarea(2);
        elNotes.value = mk.notes;
        elNotes.addEventListener("change", () => {
          callbacks.onBeforeMutation();
          callbacks.api(`/api/markers/${mk.id}`, {
            method: "PATCH",
            body: JSON.stringify({ notes: elNotes.value }),
          }).then(() => callbacks.onUpdate());
        });

        body.append(
          makeField("Name", elName),
          makeField("Type", elType),
          makeField("Chromosome band", elBand),
          makeField("Base pairs", elBasePairs),
          makeField("Centimorgans", elCentimorgans),
          makeField("McKusick #", elMckusick),
          makeField("Enzyme used", elEnzyme),
          makeField("Probe used", elProbe),
          makeField("Notes", elNotes),
        );
      },
      async () => {
        callbacks.onBeforeMutation();
        await callbacks.api(`/api/markers/${mk.id}`, { method: "DELETE" });
        await callbacks.onUpdate();
        buildPanel();
      },
    ));
  }

  container.append(buildAddButton("+ Add Marker", async () => {
    callbacks.onBeforeMutation();
    await callbacks.api("/api/markers", {
      method: "POST",
      body: JSON.stringify({ display_name: "New Marker" }),
    });
    await callbacks.onUpdate();
    buildPanel();
  }));
}

// --- Diseases tab ---

async function buildDiseasesTab(container: HTMLElement): Promise<void> {
  let items: DiseaseData[];
  let markers: MarkerData[];
  try {
    [items, markers] = await Promise.all([
      callbacks.api<DiseaseData[]>("/api/diseases"),
      callbacks.api<MarkerData[]>("/api/markers"),
    ]);
  } catch {
    items = [];
    markers = [];
  }

  for (const ds of items) {
    const colorDot = ds.color ? `<span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${ds.color};margin-right:4px;vertical-align:middle;"></span>` : "";
    container.append(buildAccordionItem(
      ds.display_name || "Disease",
      (body, headerLabel) => {
        // Inject color dot into header
        if (ds.color) headerLabel.insertAdjacentHTML("afterbegin", colorDot);

        const elName = makeInput();
        elName.value = ds.display_name;
        elName.addEventListener("change", () => {
          callbacks.onBeforeMutation();
          callbacks.api(`/api/diseases/${ds.id}`, {
            method: "PATCH",
            body: JSON.stringify({ display_name: elName.value }),
          }).then(() => callbacks.onUpdate());
        });

        const elColor = makeInput("color");
        elColor.value = ds.color || "#999999";
        elColor.addEventListener("change", () => {
          callbacks.onBeforeMutation();
          callbacks.api(`/api/diseases/${ds.id}`, {
            method: "PATCH",
            body: JSON.stringify({ color: elColor.value }),
          }).then(() => {
            callbacks.onUpdate();
            buildPanel(); // refresh color dots
          });
        });

        const elNotes = makeTextarea(2);
        elNotes.value = ds.notes;
        elNotes.addEventListener("change", () => {
          callbacks.onBeforeMutation();
          callbacks.api(`/api/diseases/${ds.id}`, {
            method: "PATCH",
            body: JSON.stringify({ notes: elNotes.value }),
          }).then(() => callbacks.onUpdate());
        });

        body.append(
          makeField("Name", elName),
          makeField("Color", elColor),
          makeField("Notes", elNotes),
        );

        // Linked markers
        const markerSection = document.createElement("div");
        markerSection.className = "sub-resource-section";

        const markerLabel = document.createElement("div");
        markerLabel.className = "sub-resource-label";
        markerLabel.textContent = "Linked Markers";
        markerSection.append(markerLabel);

        // Current markers
        for (const mkId of ds.marker_ids) {
          const mk = markers.find((m) => m.id === mkId);
          if (!mk) continue;
          const badge = document.createElement("div");
          badge.className = "resource-badge";
          badge.innerHTML = `<span>${mk.display_name || mk.id}</span>`;
          const removeBtn = document.createElement("button");
          removeBtn.className = "badge-remove";
          removeBtn.textContent = "\u00d7";
          removeBtn.addEventListener("click", async () => {
            callbacks.onBeforeMutation();
            await callbacks.api(`/api/diseases/${ds.id}/markers/${mk.id}`, { method: "DELETE" });
            await callbacks.onUpdate();
            buildPanel();
          });
          badge.append(removeBtn);
          markerSection.append(badge);
        }

        // Add marker dropdown
        const unlinked = markers.filter((m) => !ds.marker_ids.includes(m.id));
        if (unlinked.length > 0) {
          const addSel = makeSelect([
            ["", "Add marker..."],
            ...unlinked.map((m) => [m.id, m.display_name || m.id]),
          ]);
          addSel.addEventListener("change", async () => {
            if (!addSel.value) return;
            callbacks.onBeforeMutation();
            await callbacks.api(`/api/diseases/${ds.id}/markers/${addSel.value}`, { method: "POST" });
            await callbacks.onUpdate();
            buildPanel();
          });
          markerSection.append(addSel);
        }

        body.append(markerSection);
      },
      async () => {
        callbacks.onBeforeMutation();
        await callbacks.api(`/api/diseases/${ds.id}`, { method: "DELETE" });
        await callbacks.onUpdate();
        buildPanel();
      },
    ));
  }

  container.append(buildAddButton("+ Add Disease", async () => {
    callbacks.onBeforeMutation();
    await callbacks.api("/api/diseases", {
      method: "POST",
      body: JSON.stringify({ display_name: "New Disease", color: "#e06060" }),
    });
    await callbacks.onUpdate();
    buildPanel();
  }));
}

// --- Shared accordion item builder ---

function buildAccordionItem(
  label: string,
  buildBody: (body: HTMLDivElement, headerLabel: HTMLSpanElement) => void,
  onDelete: () => Promise<void>,
): HTMLDivElement {
  const item = document.createElement("div");
  item.className = "event-item";

  const hdr = document.createElement("div");
  hdr.className = "event-item-header";
  const hdrLabel = document.createElement("span");
  hdrLabel.textContent = label;
  const deleteBtn = document.createElement("button");
  deleteBtn.className = "event-delete-btn";
  deleteBtn.textContent = "\u00d7";
  deleteBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    onDelete();
  });
  hdr.append(hdrLabel, deleteBtn);
  item.append(hdr);

  const body = document.createElement("div");
  body.className = "event-item-body";
  item.append(body);

  hdr.addEventListener("click", () => {
    item.classList.toggle("expanded");
  });

  buildBody(body, hdrLabel);
  return item;
}

function buildAddButton(text: string, onClick: () => Promise<void>): HTMLButtonElement {
  const btn = document.createElement("button");
  btn.className = "event-add-btn";
  btn.textContent = text;
  btn.addEventListener("click", onClick);
  return btn;
}
