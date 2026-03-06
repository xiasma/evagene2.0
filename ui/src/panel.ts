import "./panel.css";
import { renderMarkdown } from "./markdown";
import {
  PanelCallbacks,
  DebouncerGroup,
  buildPanelShell,
  makeField,
  makeInput,
  makeSelect,
  makeTextarea,
  makeCheckboxRow,
  heading,
} from "./panel-utils";
import { buildEventEditor } from "./event-editor";

// --- Types ---

interface IndividualDiseaseEntry {
  disease_id: string;
  manifestations: unknown[];
  properties: Record<string, unknown>;
}

interface IndividualMarkerEntry {
  marker_id: string;
  allele_1: string;
  allele_2: string;
  zygosity: string;
  properties: Record<string, unknown>;
}

interface CatalogDisease {
  id: string;
  display_name: string;
  color: string;
}

interface CatalogMarker {
  id: string;
  display_name: string;
  type: string | null;
}

interface IndividualData {
  id: string;
  display_name: string;
  biological_sex: string | null;
  notes: string;
  generation: number | null;
  proband: number;
  proband_text: string;
  name: {
    given: string[];
    family: string;
    prefix: string;
    suffix: string;
  };
  properties: Record<string, unknown>;
  contacts: Record<string, {
    tel: { value: string; type: string }[];
    email: { value: string; type: string }[];
  }>;
  events: { id: string; type: string; display_name: string; date: string | null; properties: Record<string, unknown> }[];
  diseases: IndividualDiseaseEntry[];
  markers: IndividualMarkerEntry[];
}

// --- Module state ---

let callbacks: PanelCallbacks;
let sidebar: HTMLDivElement;
let currentId: string | null = null;
let debouncer = new DebouncerGroup();
let diseaseCatalog: CatalogDisease[] = [];
let markerCatalog: CatalogMarker[] = [];

// --- Dropdown option lists ---

const SEX_OPTIONS = [
  ["female", "Female"],
  ["male", "Male"],
  ["unknown", "Unknown"],
  ["ambiguous_female", "Ambiguous Female"],
  ["ambiguous_male", "Ambiguous Male"],
  ["intersex", "Intersex"],
  ["none", "None"],
  ["other", "Other"],
];

const DEATH_OPTIONS = [
  ["alive", "Alive"],
  ["unknown", "Unknown"],
  ["dead", "Dead"],
  ["suicide_confirmed", "Suicide (confirmed)"],
  ["suicide_unconfirmed", "Suicide (unconfirmed)"],
  ["spontaneous_abortion", "Spontaneous abortion"],
  ["therapeutic_abortion", "Therapeutic abortion"],
  ["neonatal_death", "Neonatal death"],
  ["stillborn", "Stillborn"],
  ["lived_one_day", "Lived one day"],
  ["pregnancy", "Pregnancy"],
  ["other", "Other"],
];

const AFFECTION_OPTIONS = [
  ["unknown", "Unknown"],
  ["clear", "Clear"],
  ["affected", "Affected"],
  ["possible_affection", "Possible affection"],
  ["heterozygous", "Heterozygous"],
  ["affected_by_hearsay", "Affected (hearsay)"],
  ["carrier", "Carrier"],
  ["examined", "Examined"],
  ["untested", "Untested"],
  ["immune", "Immune"],
  ["presymptomatic", "Presymptomatic"],
  ["other", "Other"],
];

const FERTILITY_OPTIONS = [
  ["unknown", "Unknown"],
  ["fertile", "Fertile"],
  ["infertile", "Infertile"],
  ["infertile_by_choice", "Infertile by choice"],
  ["other", "Other"],
];

const DEAD_STATUSES = new Set([
  "dead", "suicide_confirmed", "suicide_unconfirmed", "spontaneous_abortion",
  "therapeutic_abortion", "neonatal_death", "stillborn", "lived_one_day",
]);

const INDIVIDUAL_EVENT_TYPES = [
  ["birth", "Birth"],
  ["death", "Death"],
  ["diagnosis", "Diagnosis"],
  ["symptom", "Symptom"],
  ["affection", "Affection"],
  ["fertility", "Fertility"],
];

// --- Init ---

export function initPanel(cbs: PanelCallbacks): void {
  callbacks = cbs;
  sidebar = document.getElementById("sidebar") as HTMLDivElement;
}

// --- Open / Close ---

export async function openPanel(individualId: string): Promise<void> {
  const wasHidden = sidebar.classList.contains("hidden");
  currentId = individualId;
  sidebar.classList.remove("hidden");

  if (wasHidden) {
    sidebar.style.right = "24px";
    sidebar.style.top = "80px";
    sidebar.style.left = "auto";
  }

  const [data, diseases, markers] = await Promise.all([
    callbacks.api<IndividualData>(`/api/individuals/${individualId}`),
    callbacks.api<CatalogDisease[]>("/api/diseases").catch(() => [] as CatalogDisease[]),
    callbacks.api<CatalogMarker[]>("/api/markers").catch(() => [] as CatalogMarker[]),
  ]);
  diseaseCatalog = diseases;
  markerCatalog = markers;
  buildDOM(data);
}

export function closePanel(): void {
  currentId = null;
  sidebar.classList.add("hidden");
  debouncer.clear();
}

export function isPanelOpen(): boolean {
  return currentId !== null;
}

// --- Build DOM from scratch each time ---

function buildDOM(data: IndividualData): void {
  debouncer.clear();
  debouncer = new DebouncerGroup();

  const { body } = buildPanelShell(sidebar, "Individual", () => {
    closePanel();
    callbacks.onClose();
  });

  // Identity
  const elDisplayName = makeInput();
  elDisplayName.value = data.display_name ?? "";
  const elGivenNames = makeInput();
  elGivenNames.value = (data.name?.given ?? []).join(" ");
  const elSurname = makeInput();
  elSurname.value = data.name?.family ?? "";
  const elTitle = makeInput();
  elTitle.value = data.name?.prefix ?? "";
  const elSurnameAtBirth = makeInput();
  elSurnameAtBirth.value = (data.properties?.surname_at_birth as string) ?? "";

  // Clinical
  const elSex = makeSelect(SEX_OPTIONS);
  elSex.value = data.biological_sex ?? "unknown";
  const elMortality = makeSelect(DEATH_OPTIONS);
  elMortality.value = (data.properties?.death_status as string) ?? "alive";
  const elAffection = makeSelect(AFFECTION_OPTIONS);
  elAffection.value = (data.properties?.affection_status as string) ?? "unknown";
  const elFertility = makeSelect(FERTILITY_OPTIONS);
  elFertility.value = (data.properties?.fertility_status as string) ?? "unknown";
  const elProband = makeInput("range");
  elProband.min = "0";
  elProband.max = "360";
  elProband.value = String(data.proband ?? 0);
  elProband.className = "proband-slider";
  const elProbandText = makeInput();
  elProbandText.placeholder = "Proband label";
  elProbandText.value = data.proband_text ?? "";
  const elGeneration = makeInput("number");
  elGeneration.value = data.generation != null ? String(data.generation) : "";

  // Dates
  const elDob = makeInput("date");
  elDob.value = (data.properties?.date_of_birth as string) ?? "";
  const elDod = makeInput("date");
  elDod.value = (data.properties?.date_of_death as string) ?? "";

  // Notes
  const elNotes = makeTextarea();
  elNotes.value = data.notes ?? "";
  const elNotesPreview = document.createElement("div");
  elNotesPreview.className = "notes-preview";
  elNotesPreview.style.display = "none";
  const elNotesToggle = document.createElement("button");
  elNotesToggle.className = "notes-toggle";
  elNotesToggle.textContent = "Preview";
  let notesPreviewMode = false;
  elNotesToggle.addEventListener("click", () => {
    notesPreviewMode = !notesPreviewMode;
    if (notesPreviewMode) {
      elNotes.style.display = "none";
      elNotesPreview.style.display = "";
      elNotesPreview.innerHTML = renderMarkdown(elNotes.value);
      elNotesToggle.textContent = "Edit";
    } else {
      elNotes.style.display = "";
      elNotesPreview.style.display = "none";
      elNotesToggle.textContent = "Preview";
    }
  });
  const elShowNotes = makeInput("checkbox") as HTMLInputElement;
  elShowNotes.checked = !!(data.properties?.show_notes);

  // Contact
  const selfContact = data.contacts?.self;
  const tels = selfContact?.tel ?? [];
  const elTelHome = makeInput("tel");
  elTelHome.value = tels.find((t) => t.type === "home")?.value ?? "";
  const elTelWork = makeInput("tel");
  elTelWork.value = tels.find((t) => t.type === "work")?.value ?? "";
  const elTelMobile = makeInput("tel");
  elTelMobile.value = tels.find((t) => t.type === "cell")?.value ?? "";
  const elEmail = makeInput("email");
  elEmail.value = (selfContact?.email ?? [])[0]?.value ?? "";

  // Build name helper
  const buildName = () => ({
    given: elGivenNames.value.split(/\s+/).filter(Boolean),
    family: elSurname.value,
    prefix: elTitle.value,
  });

  // Patch helpers
  const patchDirect = async (patchBody: Record<string, unknown>) => {
    if (!currentId) return;
    try {
      await callbacks.api(`/api/individuals/${currentId}`, {
        method: "PATCH",
        body: JSON.stringify(patchBody),
      });
      await callbacks.onUpdate();
    } catch (err) {
      console.error("Panel patch failed:", err);
    }
  };

  const patchProperty = async (key: string, value: unknown) => {
    if (!currentId) return;
    try {
      const d = await callbacks.api<IndividualData>(`/api/individuals/${currentId}`);
      const merged = { ...(d.properties ?? {}), [key]: value };
      await callbacks.api(`/api/individuals/${currentId}`, {
        method: "PATCH",
        body: JSON.stringify({ properties: merged }),
      });
      await callbacks.onUpdate();
    } catch (err) {
      console.error("Panel property patch failed:", err);
    }
  };

  const patchContact = async () => {
    if (!currentId) return;
    try {
      const tel: { value: string; type: string }[] = [];
      if (elTelHome.value) tel.push({ value: elTelHome.value, type: "home" });
      if (elTelWork.value) tel.push({ value: elTelWork.value, type: "work" });
      if (elTelMobile.value) tel.push({ value: elTelMobile.value, type: "cell" });
      const email: { value: string; type: string }[] = [];
      if (elEmail.value) email.push({ value: elEmail.value, type: "home" });
      await callbacks.api(`/api/individuals/${currentId}`, {
        method: "PATCH",
        body: JSON.stringify({ contacts: { self: { tel, email } } }),
      });
      await callbacks.onUpdate();
    } catch (err) {
      console.error("Panel contact patch failed:", err);
    }
  };

  const handleDateOfDeath = async (dateValue: string) => {
    if (!currentId) return;
    try {
      const d = await callbacks.api<IndividualData>(`/api/individuals/${currentId}`);
      const props: Record<string, unknown> = { ...(d.properties ?? {}), date_of_death: dateValue };
      if (dateValue && !DEAD_STATUSES.has((d.properties?.death_status as string) ?? "")) {
        props.death_status = "dead";
      }
      await callbacks.api(`/api/individuals/${currentId}`, {
        method: "PATCH",
        body: JSON.stringify({ properties: props }),
      });
      if (dateValue) {
        await callbacks.api(`/api/individuals/${currentId}/events`, {
          method: "POST",
          body: JSON.stringify({ type: "death", date: dateValue }),
        });
      }
      elMortality.value = (props.death_status as string) ?? "alive";
      await callbacks.onUpdate();
    } catch (err) {
      console.error("Panel date-of-death patch failed:", err);
    }
  };

  // Build undo label helper
  const name = () => data.display_name || "individual";
  const labelFor = (field: string, from?: string, to?: string) => {
    if (from != null && to != null) return `Set ${field} on ${name()} from ${from} to ${to}`;
    return `Edit ${field} on ${name()}`;
  };
  const findOptionLabel = (options: string[][], value: string) =>
    options.find(([v]) => v === value)?.[1] ?? value;

  // Wire immediate events
  elSex.addEventListener("change", () => {
    const from = findOptionLabel(SEX_OPTIONS, data.biological_sex ?? "unknown");
    const to = findOptionLabel(SEX_OPTIONS, elSex.value);
    callbacks.onBeforeMutation(labelFor("Sex", from, to));
    data.biological_sex = elSex.value;
    patchDirect({ biological_sex: elSex.value });
  });
  elMortality.addEventListener("change", () => {
    const from = findOptionLabel(DEATH_OPTIONS, (data.properties?.death_status as string) ?? "alive");
    const to = findOptionLabel(DEATH_OPTIONS, elMortality.value);
    callbacks.onBeforeMutation(labelFor("Mortality", from, to));
    data.properties.death_status = elMortality.value;
    patchProperty("death_status", elMortality.value);
  });
  elAffection.addEventListener("change", () => {
    const from = findOptionLabel(AFFECTION_OPTIONS, (data.properties?.affection_status as string) ?? "unknown");
    const to = findOptionLabel(AFFECTION_OPTIONS, elAffection.value);
    callbacks.onBeforeMutation(labelFor("Affection", from, to));
    data.properties.affection_status = elAffection.value;
    patchProperty("affection_status", elAffection.value);
  });
  elFertility.addEventListener("change", () => {
    const from = findOptionLabel(FERTILITY_OPTIONS, (data.properties?.fertility_status as string) ?? "unknown");
    const to = findOptionLabel(FERTILITY_OPTIONS, elFertility.value);
    callbacks.onBeforeMutation(labelFor("Fertility", from, to));
    data.properties.fertility_status = elFertility.value;
    patchProperty("fertility_status", elFertility.value);
  });
  elProband.addEventListener("input", () => { callbacks.onBeforeMutation(`Edit Proband on ${name()}`); patchDirect({ proband: parseFloat(elProband.value) }); });
  elShowNotes.addEventListener("change", () => { callbacks.onBeforeMutation(`Toggle notes on ${name()}`); patchProperty("show_notes", elShowNotes.checked); });

  // Wire debounced events
  const wireDebounced = (el: HTMLInputElement | HTMLTextAreaElement, fn: () => void, label?: string) =>
    debouncer.wireDebouncedWithUndo(el, fn, () => callbacks.onBeforeMutation(label ?? `Edit ${name()}`));

  wireDebounced(elDisplayName, () => patchDirect({ display_name: elDisplayName.value }), `Rename ${name()}`);
  wireDebounced(elGivenNames, () => patchDirect({ name: buildName() }), `Edit name on ${name()}`);
  wireDebounced(elSurname, () => patchDirect({ name: buildName() }), `Edit surname on ${name()}`);
  wireDebounced(elTitle, () => patchDirect({ name: buildName() }), `Edit title on ${name()}`);
  wireDebounced(elSurnameAtBirth, () => patchProperty("surname_at_birth", elSurnameAtBirth.value), `Edit birth surname on ${name()}`);
  wireDebounced(elProbandText, () => patchDirect({ proband_text: elProbandText.value }), `Edit proband label on ${name()}`);
  wireDebounced(elGeneration, () => {
    const val = elGeneration.value === "" ? null : parseInt(elGeneration.value, 10);
    patchDirect({ generation: val });
  }, `Edit generation on ${name()}`);
  wireDebounced(elDob, () => patchProperty("date_of_birth", elDob.value), `Edit date of birth on ${name()}`);
  wireDebounced(elDod, () => handleDateOfDeath(elDod.value), `Edit date of death on ${name()}`);
  wireDebounced(elNotes, () => patchDirect({ notes: elNotes.value }), `Edit notes on ${name()}`);
  wireDebounced(elTelHome, () => patchContact(), `Edit contact on ${name()}`);
  wireDebounced(elTelWork, () => patchContact(), `Edit contact on ${name()}`);
  wireDebounced(elTelMobile, () => patchContact(), `Edit contact on ${name()}`);
  wireDebounced(elEmail, () => patchContact(), `Edit contact on ${name()}`);

  // Events section
  const eventEditor = buildEventEditor({
    entityType: "individual",
    entityId: data.id,
    events: data.events ?? [],
    eventTypes: INDIVIDUAL_EVENT_TYPES,
    callbacks,
  });

  // --- Diseases section ---
  const diseasesSection = document.createElement("div");
  diseasesSection.append(heading("Diseases"));

  const diseaseBadges = document.createElement("div");
  diseaseBadges.className = "badge-list";
  const assignedDiseaseIds = (data.diseases ?? []).map((d) => d.disease_id);

  for (const entry of data.diseases ?? []) {
    const cat = diseaseCatalog.find((d) => d.id === entry.disease_id);
    const badge = document.createElement("div");
    badge.className = "resource-badge";
    const dot = document.createElement("span");
    dot.className = "disease-dot";
    dot.style.background = cat?.color || "#999";
    const nameSpan = document.createElement("span");
    nameSpan.textContent = cat?.display_name || entry.disease_id;
    const removeBtn = document.createElement("button");
    removeBtn.className = "badge-remove";
    removeBtn.textContent = "\u00d7";
    removeBtn.addEventListener("click", async () => {
      callbacks.onBeforeMutation(`Remove ${cat?.display_name || "disease"} from ${name()}`);
      try {
        await callbacks.api(`/api/individuals/${data.id}/diseases/${entry.disease_id}`, { method: "DELETE" });
        await callbacks.onUpdate();
        if (currentId) openPanel(currentId);
      } catch (err) {
        console.error("Failed to remove disease:", err);
      }
    });
    badge.append(dot, nameSpan, removeBtn);
    diseaseBadges.append(badge);
  }
  diseasesSection.append(diseaseBadges);

  // Add disease dropdown
  const unassignedDiseases = diseaseCatalog.filter((d) => !assignedDiseaseIds.includes(d.id));
  if (unassignedDiseases.length > 0) {
    const addDiseaseSel = makeSelect([
      ["", "Add disease..."],
      ...unassignedDiseases.map((d) => [d.id, d.display_name || d.id]),
    ]);
    addDiseaseSel.addEventListener("change", async () => {
      if (!addDiseaseSel.value) return;
      const diseaseName = unassignedDiseases.find((d) => d.id === addDiseaseSel.value)?.display_name || "disease";
      callbacks.onBeforeMutation(`Add ${diseaseName} to ${name()}`);
      try {
        await callbacks.api(`/api/individuals/${data.id}/diseases`, {
          method: "POST",
          body: JSON.stringify({ disease_id: addDiseaseSel.value }),
        });
        await callbacks.onUpdate();
        if (currentId) openPanel(currentId);
      } catch (err) {
        console.error("Failed to add disease:", err);
      }
    });
    diseasesSection.append(addDiseaseSel);
  }

  // --- Markers section ---
  const markersSection = document.createElement("div");
  markersSection.append(heading("Markers"));

  const markerBadges = document.createElement("div");
  markerBadges.className = "badge-list";
  const assignedMarkerIds = (data.markers ?? []).map((m) => m.marker_id);

  for (const entry of data.markers ?? []) {
    const cat = markerCatalog.find((m) => m.id === entry.marker_id);
    const markerName = cat?.display_name || entry.marker_id;
    const badge = document.createElement("div");
    badge.className = "resource-badge marker-badge";

    const nameSpan2 = document.createElement("span");
    nameSpan2.className = "marker-badge-name";
    nameSpan2.textContent = markerName;

    // Inline editable alleles
    const allele1 = makeInput();
    allele1.className = "marker-allele-input";
    allele1.value = entry.allele_1;
    allele1.placeholder = "A1";
    allele1.addEventListener("change", () => {
      callbacks.onBeforeMutation(`Edit allele on ${name()}`);
      callbacks.api(`/api/individuals/${data.id}/markers/${entry.marker_id}`, {
        method: "PATCH",
        body: JSON.stringify({ allele_1: allele1.value }),
      }).then(() => callbacks.onUpdate());
    });

    const allele2 = makeInput();
    allele2.className = "marker-allele-input";
    allele2.value = entry.allele_2;
    allele2.placeholder = "A2";
    allele2.addEventListener("change", () => {
      callbacks.onBeforeMutation(`Edit allele on ${name()}`);
      callbacks.api(`/api/individuals/${data.id}/markers/${entry.marker_id}`, {
        method: "PATCH",
        body: JSON.stringify({ allele_2: allele2.value }),
      }).then(() => callbacks.onUpdate());
    });

    const zyg = makeInput();
    zyg.className = "marker-allele-input";
    zyg.value = entry.zygosity;
    zyg.placeholder = "Zyg";
    zyg.addEventListener("change", () => {
      callbacks.onBeforeMutation(`Edit zygosity on ${name()}`);
      callbacks.api(`/api/individuals/${data.id}/markers/${entry.marker_id}`, {
        method: "PATCH",
        body: JSON.stringify({ zygosity: zyg.value }),
      }).then(() => callbacks.onUpdate());
    });

    const removeBtn = document.createElement("button");
    removeBtn.className = "badge-remove";
    removeBtn.textContent = "\u00d7";
    removeBtn.addEventListener("click", async () => {
      callbacks.onBeforeMutation(`Remove ${markerName} from ${name()}`);
      try {
        await callbacks.api(`/api/individuals/${data.id}/markers/${entry.marker_id}`, { method: "DELETE" });
        await callbacks.onUpdate();
        if (currentId) openPanel(currentId);
      } catch (err) {
        console.error("Failed to remove marker:", err);
      }
    });

    badge.append(nameSpan2, allele1, allele2, zyg, removeBtn);
    markerBadges.append(badge);
  }
  markersSection.append(markerBadges);

  // Add marker dropdown
  const unassignedMarkers = markerCatalog.filter((m) => !assignedMarkerIds.includes(m.id));
  if (unassignedMarkers.length > 0) {
    const addMarkerSel = makeSelect([
      ["", "Add marker..."],
      ...unassignedMarkers.map((m) => [m.id, m.display_name || m.id]),
    ]);
    addMarkerSel.addEventListener("change", async () => {
      if (!addMarkerSel.value) return;
      const mkName = unassignedMarkers.find((m) => m.id === addMarkerSel.value)?.display_name || "marker";
      callbacks.onBeforeMutation(`Add ${mkName} to ${name()}`);
      try {
        await callbacks.api(`/api/individuals/${data.id}/markers`, {
          method: "POST",
          body: JSON.stringify({ marker_id: addMarkerSel.value }),
        });
        await callbacks.onUpdate();
        if (currentId) openPanel(currentId);
      } catch (err) {
        console.error("Failed to add marker:", err);
      }
    });
    markersSection.append(addMarkerSel);
  }

  // Assemble DOM
  body.append(
    heading("Identity"),
    makeField("Display name", elDisplayName),
    makeField("Given names", elGivenNames),
    makeField("Surname", elSurname),
    makeField("Title", elTitle),
    makeField("Surname at birth", elSurnameAtBirth),

    heading("Clinical"),
    makeField("Sex", elSex),
    makeField("Mortality", elMortality),
    makeField("Affection", elAffection),
    makeField("Fertility", elFertility),
    makeField("Proband", elProband),
    makeField("Proband label", elProbandText),
    makeField("Generation", elGeneration),

    heading("Dates"),
    makeField("Date of birth", elDob),
    makeField("Date of death", elDod),

    heading("Notes"),
    makeField("Notes", elNotes),
    elNotesPreview,
    elNotesToggle,
    makeCheckboxRow("Show notes on canvas", elShowNotes),

    heading("Contact"),
    makeField("Home telephone", elTelHome),
    makeField("Daytime telephone", elTelWork),
    makeField("Mobile", elTelMobile),
    makeField("Email", elEmail),

    eventEditor,

    diseasesSection,
    markersSection,
  );
}
