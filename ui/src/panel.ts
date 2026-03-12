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
  laterality: string | null;
  site: string;
  tumor_properties: Record<string, unknown>;
  manifestations: unknown[];
  properties: Record<string, unknown>;
}

interface IndividualEthnicityEntry {
  ethnicity_id: string;
  proportion: number;
}

interface IndividualGeneticTestEntry {
  id: string;
  gene: string;
  result: string | null;
  method: string;
  date: string | null;
  properties: Record<string, unknown>;
}

interface IndividualTreatmentEntry {
  id: string;
  treatment_type_id: string;
  disease_id: string | null;
  laterality: string | null;
  date: string | null;
  end_date: string | null;
  prophylactic: boolean;
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
  parent_id: string | null;
  color: string;
}

interface CatalogEthnicity {
  id: string;
  display_name: string;
  parent_id: string | null;
}

interface CatalogTreatmentType {
  id: string;
  display_name: string;
  parent_id: string | null;
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
  ethnicities: IndividualEthnicityEntry[];
  diseases: IndividualDiseaseEntry[];
  markers: IndividualMarkerEntry[];
  genetic_tests: IndividualGeneticTestEntry[];
  treatments: IndividualTreatmentEntry[];
}

// --- Module state ---

let callbacks: PanelCallbacks;
let sidebar: HTMLDivElement;
let currentId: string | null = null;
let debouncer = new DebouncerGroup();
let diseaseCatalog: CatalogDisease[] = [];
let markerCatalog: CatalogMarker[] = [];
let ethnicityCatalog: CatalogEthnicity[] = [];
let treatmentTypeCatalog: CatalogTreatmentType[] = [];
let displayNameInput: HTMLInputElement | null = null;

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

const LATERALITY_OPTIONS = [
  ["", "(none)"],
  ["unknown", "Unknown"],
  ["left", "Left"],
  ["right", "Right"],
  ["bilateral", "Bilateral"],
  ["not_applicable", "N/A"],
];

const GENETIC_TEST_RESULT_OPTIONS = [
  ["", "(none)"],
  ["unknown", "Unknown"],
  ["positive", "Positive"],
  ["negative", "Negative"],
  ["variant_of_uncertain_significance", "VUS"],
  ["not_tested", "Not tested"],
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

  const [data, diseases, markers, ethnicities, treatmentTypes] = await Promise.all([
    callbacks.api<IndividualData>(`/api/individuals/${individualId}`),
    callbacks.api<CatalogDisease[]>("/api/diseases").catch(() => [] as CatalogDisease[]),
    callbacks.api<CatalogMarker[]>("/api/markers").catch(() => [] as CatalogMarker[]),
    callbacks.api<CatalogEthnicity[]>("/api/ethnicities").catch(() => [] as CatalogEthnicity[]),
    callbacks.api<CatalogTreatmentType[]>("/api/treatment-types").catch(() => [] as CatalogTreatmentType[]),
  ]);
  diseaseCatalog = diseases;
  markerCatalog = markers;
  ethnicityCatalog = ethnicities;
  treatmentTypeCatalog = treatmentTypes;
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

export function focusDisplayName(): void {
  if (displayNameInput) {
    displayNameInput.focus();
    displayNameInput.select();
  }
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
  displayNameInput = elDisplayName;
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

  // --- Diseases section (popup picker instead of dropdown) ---
  const diseasesSection = document.createElement("div");
  diseasesSection.append(heading("Diseases"));

  const diseaseList = document.createElement("div");
  for (const entry of data.diseases ?? []) {
    const cat = diseaseCatalog.find((d) => d.id === entry.disease_id);
    diseaseList.append(buildDiseaseItem(data, entry, cat, name));
  }
  diseasesSection.append(diseaseList);

  // Add disease button + popup
  const assignedDiseaseIds = new Set((data.diseases ?? []).map((d) => d.disease_id));
  const unassignedDiseases = diseaseCatalog.filter((d) => !assignedDiseaseIds.has(d.id));
  if (unassignedDiseases.length > 0) {
    diseasesSection.append(
      buildPopupPicker({
        buttonLabel: "+ Add Disease",
        items: unassignedDiseases,
        groups: diseaseCatalog,
        searchPlaceholder: "Search diseases...",
        renderItem: (item) => {
          const d = item as CatalogDisease;
          const dot = document.createElement("span");
          dot.className = "disease-dot";
          dot.style.background = d.color || "#999";
          const label = document.createElement("span");
          label.textContent = d.display_name || d.id;
          const frag = document.createDocumentFragment();
          frag.append(dot, label);
          return frag;
        },
        onSelect: async (item) => {
          const d = item as CatalogDisease;
          callbacks.onBeforeMutation(`Add ${d.display_name || "disease"} to ${name()}`);
          try {
            await callbacks.api(`/api/individuals/${data.id}/diseases`, {
              method: "POST",
              body: JSON.stringify({ disease_id: d.id }),
            });
            await callbacks.onUpdate();
            if (currentId) openPanel(currentId);
          } catch (err) {
            console.error("Failed to add disease:", err);
          }
        },
      }),
    );
  }

  // --- Ethnicity section ---
  const ethnicitySection = document.createElement("div");
  ethnicitySection.append(heading("Ethnicity"));

  const ethnicityBadges = document.createElement("div");
  ethnicityBadges.className = "badge-list";
  const assignedEthnicityIds = new Set((data.ethnicities ?? []).map((e) => e.ethnicity_id));

  for (const entry of data.ethnicities ?? []) {
    const cat = ethnicityCatalog.find((e) => e.id === entry.ethnicity_id);
    const badge = document.createElement("div");
    badge.className = "ethnicity-badge";
    const nameSpan = document.createElement("span");
    nameSpan.textContent = cat?.display_name || entry.ethnicity_id;
    const propInput = makeInput();
    propInput.className = "ethnicity-proportion";
    propInput.type = "number";
    propInput.min = "0";
    propInput.max = "100";
    propInput.step = "1";
    propInput.value = String(Math.round(entry.proportion * 100));
    propInput.title = "Proportion %";
    propInput.addEventListener("change", async () => {
      const pct = Math.max(0, Math.min(100, parseInt(propInput.value, 10) || 0));
      propInput.value = String(pct);
      callbacks.onBeforeMutation(`Edit ethnicity proportion on ${name()}`);
      try {
        await callbacks.api(`/api/individuals/${data.id}/ethnicities`, {
          method: "POST",
          body: JSON.stringify({ ethnicity_id: entry.ethnicity_id, proportion: pct / 100 }),
        });
        await callbacks.onUpdate();
      } catch (err) {
        console.error("Failed to update ethnicity:", err);
      }
    });
    const pctLabel = document.createElement("span");
    pctLabel.textContent = "%";
    pctLabel.style.fontSize = "0.68rem";
    pctLabel.style.color = "var(--color-text-subtle)";
    const removeBtn = document.createElement("button");
    removeBtn.className = "badge-remove";
    removeBtn.textContent = "\u00d7";
    removeBtn.addEventListener("click", async () => {
      callbacks.onBeforeMutation(`Remove ${cat?.display_name || "ethnicity"} from ${name()}`);
      try {
        await callbacks.api(`/api/individuals/${data.id}/ethnicities/${entry.ethnicity_id}`, { method: "DELETE" });
        await callbacks.onUpdate();
        if (currentId) openPanel(currentId);
      } catch (err) {
        console.error("Failed to remove ethnicity:", err);
      }
    });
    badge.append(nameSpan, propInput, pctLabel, removeBtn);
    ethnicityBadges.append(badge);
  }
  ethnicitySection.append(ethnicityBadges);

  // Add ethnicity popup
  const unassignedEthnicities = ethnicityCatalog.filter((e) => !assignedEthnicityIds.has(e.id));
  if (unassignedEthnicities.length > 0) {
    ethnicitySection.append(
      buildPopupPicker({
        buttonLabel: "+ Add Ethnicity",
        items: unassignedEthnicities,
        groups: ethnicityCatalog,
        searchPlaceholder: "Search ethnicities...",
        onSelect: async (item) => {
          callbacks.onBeforeMutation(`Add ${item.display_name || "ethnicity"} to ${name()}`);
          try {
            await callbacks.api(`/api/individuals/${data.id}/ethnicities`, {
              method: "POST",
              body: JSON.stringify({ ethnicity_id: item.id, proportion: 1.0 }),
            });
            await callbacks.onUpdate();
            if (currentId) openPanel(currentId);
          } catch (err) {
            console.error("Failed to add ethnicity:", err);
          }
        },
      }),
    );
  }

  // --- Genetic Tests section ---
  const geneticTestsSection = document.createElement("div");
  geneticTestsSection.append(heading("Genetic Tests"));

  const testList = document.createElement("div");
  for (const test of data.genetic_tests ?? []) {
    testList.append(buildGeneticTestItem(data.id, test, name));
  }
  geneticTestsSection.append(testList);

  const addTestBtn = document.createElement("button");
  addTestBtn.className = "event-add-btn";
  addTestBtn.textContent = "+ Add Genetic Test";
  addTestBtn.addEventListener("click", async () => {
    callbacks.onBeforeMutation(`Add genetic test to ${name()}`);
    try {
      await callbacks.api(`/api/individuals/${data.id}/genetic-tests`, {
        method: "POST",
        body: JSON.stringify({ gene: "", result: null }),
      });
      await callbacks.onUpdate();
      if (currentId) openPanel(currentId);
    } catch (err) {
      console.error("Failed to add genetic test:", err);
    }
  });
  geneticTestsSection.append(addTestBtn);

  // --- Treatments section ---
  const treatmentsSection = document.createElement("div");
  treatmentsSection.append(heading("Treatments"));

  const treatmentList = document.createElement("div");
  for (const t of data.treatments ?? []) {
    treatmentList.append(buildTreatmentItem(data, t, name));
  }
  treatmentsSection.append(treatmentList);

  // Add treatment popup (pick treatment type)
  if (treatmentTypeCatalog.length > 0) {
    treatmentsSection.append(
      buildPopupPicker({
        buttonLabel: "+ Add Treatment",
        items: treatmentTypeCatalog,
        groups: treatmentTypeCatalog,
        searchPlaceholder: "Search treatments...",
        onSelect: async (item) => {
          callbacks.onBeforeMutation(`Add ${item.display_name || "treatment"} to ${name()}`);
          try {
            await callbacks.api(`/api/individuals/${data.id}/treatments`, {
              method: "POST",
              body: JSON.stringify({ treatment_type_id: item.id }),
            });
            await callbacks.onUpdate();
            if (currentId) openPanel(currentId);
          } catch (err) {
            console.error("Failed to add treatment:", err);
          }
        },
      }),
    );
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

    ethnicitySection,
    diseasesSection,
    geneticTestsSection,
    treatmentsSection,
    markersSection,
  );
}

// --- Popup picker (reusable for diseases, ethnicities, treatments) ---

interface PopupPickerOptions {
  buttonLabel: string;
  items: { id: string; display_name: string; parent_id?: string | null }[];
  groups: { id: string; display_name: string; parent_id?: string | null }[];
  searchPlaceholder?: string;
  renderItem?: (item: { id: string; display_name: string }) => DocumentFragment | HTMLElement;
  onSelect: (item: { id: string; display_name: string }) => void;
}

function buildPopupPicker(opts: PopupPickerOptions): HTMLDivElement {
  const anchor = document.createElement("div");
  anchor.className = "popup-picker-anchor";

  const btn = document.createElement("button");
  btn.className = "event-add-btn";
  btn.textContent = opts.buttonLabel;
  anchor.append(btn);

  let popup: HTMLDivElement | null = null;

  const dismiss = () => {
    if (popup) {
      popup.remove();
      popup = null;
    }
  };

  btn.addEventListener("click", () => {
    if (popup) { dismiss(); return; }
    popup = document.createElement("div");
    popup.className = "popup-picker";

    const search = document.createElement("input");
    search.className = "popup-picker-search";
    search.placeholder = opts.searchPlaceholder ?? "Search...";
    popup.append(search);

    const listEl = document.createElement("div");
    listEl.className = "popup-picker-list";
    popup.append(listEl);

    // Build grouped list
    const parents = new Map<string, string>();
    for (const g of opts.groups) {
      if (!g.parent_id) parents.set(g.id, g.display_name);
    }

    const renderList = (filter: string) => {
      listEl.innerHTML = "";
      const lf = filter.toLowerCase();
      const filtered = opts.items.filter((i) =>
        !lf || i.display_name.toLowerCase().includes(lf),
      );
      if (filtered.length === 0) {
        const empty = document.createElement("div");
        empty.className = "popup-picker-empty";
        empty.textContent = "No results";
        listEl.append(empty);
        return;
      }

      // Group items: parent items first, then children grouped under parents
      const parentItems = filtered.filter((i) => !i.parent_id);
      const childItems = filtered.filter((i) => i.parent_id);
      const grouped = new Map<string, typeof filtered>();
      for (const child of childItems) {
        const key = child.parent_id!;
        if (!grouped.has(key)) grouped.set(key, []);
        grouped.get(key)!.push(child);
      }

      // Show ungrouped parents
      for (const item of parentItems) {
        // If this parent has children in the filtered list, show as group header
        if (grouped.has(item.id)) {
          const groupLabel = document.createElement("div");
          groupLabel.className = "popup-picker-group";
          groupLabel.textContent = item.display_name;
          listEl.append(groupLabel);
          for (const child of grouped.get(item.id)!) {
            listEl.append(makePickerItem(child, opts, dismiss));
          }
          grouped.delete(item.id);
        } else {
          listEl.append(makePickerItem(item, opts, dismiss));
        }
      }

      // Show remaining grouped children whose parent wasn't in filtered results
      for (const [parentId, children] of grouped) {
        const parentName = parents.get(parentId);
        if (parentName) {
          const groupLabel = document.createElement("div");
          groupLabel.className = "popup-picker-group";
          groupLabel.textContent = parentName;
          listEl.append(groupLabel);
        }
        for (const child of children) {
          listEl.append(makePickerItem(child, opts, dismiss));
        }
      }
    };

    search.addEventListener("input", () => renderList(search.value));
    renderList("");
    anchor.append(popup);
    search.focus();

    // Close on outside click
    const onDocClick = (e: MouseEvent) => {
      if (!anchor.contains(e.target as Node)) {
        dismiss();
        document.removeEventListener("click", onDocClick);
      }
    };
    setTimeout(() => document.addEventListener("click", onDocClick), 0);
  });

  return anchor;
}

function makePickerItem(
  item: { id: string; display_name: string },
  opts: PopupPickerOptions,
  dismiss: () => void,
): HTMLDivElement {
  const row = document.createElement("div");
  row.className = "popup-picker-item";
  if (opts.renderItem) {
    row.append(opts.renderItem(item));
  } else {
    row.textContent = item.display_name || item.id;
  }
  row.addEventListener("click", () => {
    dismiss();
    opts.onSelect(item);
  });
  return row;
}

// --- Disease accordion item (expandable with laterality/site/tumor) ---

function buildDiseaseItem(
  data: IndividualData,
  entry: IndividualDiseaseEntry,
  cat: CatalogDisease | undefined,
  name: () => string,
): HTMLDivElement {
  const item = document.createElement("div");
  item.className = "panel-accordion-item";

  // Header
  const hdr = document.createElement("div");
  hdr.className = "panel-accordion-header";
  const hdrContent = document.createElement("span");
  const dot = document.createElement("span");
  dot.className = "disease-dot";
  dot.style.background = cat?.color || "#999";
  dot.style.marginRight = "6px";
  dot.style.display = "inline-block";
  hdrContent.append(dot);
  hdrContent.append(document.createTextNode(cat?.display_name || entry.disease_id));
  const deleteBtn = document.createElement("button");
  deleteBtn.className = "event-delete-btn";
  deleteBtn.textContent = "\u00d7";
  deleteBtn.addEventListener("click", async (e) => {
    e.stopPropagation();
    callbacks.onBeforeMutation(`Remove ${cat?.display_name || "disease"} from ${name()}`);
    try {
      await callbacks.api(`/api/individuals/${data.id}/diseases/${entry.disease_id}`, { method: "DELETE" });
      await callbacks.onUpdate();
      if (currentId) openPanel(currentId);
    } catch (err) {
      console.error("Failed to remove disease:", err);
    }
  });
  hdr.append(hdrContent, deleteBtn);
  hdr.addEventListener("click", () => item.classList.toggle("expanded"));
  item.append(hdr);

  // Body
  const body = document.createElement("div");
  body.className = "panel-accordion-body";

  const patchDisease = async (fields: Record<string, unknown>) => {
    try {
      await callbacks.api(`/api/individuals/${data.id}/diseases/${entry.disease_id}`, {
        method: "PATCH",
        body: JSON.stringify(fields),
      });
      await callbacks.onUpdate();
    } catch (err) {
      console.error("Failed to update disease:", err);
    }
  };

  const elLaterality = makeSelect(LATERALITY_OPTIONS);
  elLaterality.value = entry.laterality ?? "";
  elLaterality.addEventListener("change", () => {
    callbacks.onBeforeMutation(`Edit laterality on ${name()}`);
    patchDisease({ laterality: elLaterality.value || null });
  });

  const elSite = makeInput();
  elSite.value = entry.site ?? "";
  elSite.placeholder = "e.g. breast, ovary, colon";
  elSite.addEventListener("change", () => {
    callbacks.onBeforeMutation(`Edit disease site on ${name()}`);
    patchDisease({ site: elSite.value });
  });

  // Tumor properties: ER, PR, HER2 as simple select fields
  const tp = entry.tumor_properties ?? {};
  const receptorOpts = [["", "(none)"], ["positive", "+"], ["negative", "-"], ["unknown", "?"]];
  const elER = makeSelect(receptorOpts);
  elER.value = (tp.er_status as string) ?? "";
  elER.addEventListener("change", () => {
    callbacks.onBeforeMutation(`Edit tumor properties on ${name()}`);
    patchDisease({ tumor_properties: { ...tp, er_status: elER.value || null } });
    tp.er_status = elER.value || null;
  });
  const elPR = makeSelect(receptorOpts);
  elPR.value = (tp.pr_status as string) ?? "";
  elPR.addEventListener("change", () => {
    callbacks.onBeforeMutation(`Edit tumor properties on ${name()}`);
    patchDisease({ tumor_properties: { ...tp, pr_status: elPR.value || null } });
    tp.pr_status = elPR.value || null;
  });
  const elHER2 = makeSelect(receptorOpts);
  elHER2.value = (tp.her2_status as string) ?? "";
  elHER2.addEventListener("change", () => {
    callbacks.onBeforeMutation(`Edit tumor properties on ${name()}`);
    patchDisease({ tumor_properties: { ...tp, her2_status: elHER2.value || null } });
    tp.her2_status = elHER2.value || null;
  });

  body.append(
    makeField("Laterality", elLaterality),
    makeField("Site", elSite),
    makeField("ER status", elER),
    makeField("PR status", elPR),
    makeField("HER2 status", elHER2),
  );
  item.append(body);
  return item;
}

// --- Genetic test accordion item ---

function buildGeneticTestItem(
  individualId: string,
  test: IndividualGeneticTestEntry,
  name: () => string,
): HTMLDivElement {
  const item = document.createElement("div");
  item.className = "panel-accordion-item";

  const hdr = document.createElement("div");
  hdr.className = "panel-accordion-header";
  const hdrLabel = document.createElement("span");
  hdrLabel.textContent = test.gene || "Genetic Test";
  if (test.result) hdrLabel.textContent += ` \u2014 ${test.result}`;
  const deleteBtn = document.createElement("button");
  deleteBtn.className = "event-delete-btn";
  deleteBtn.textContent = "\u00d7";
  deleteBtn.addEventListener("click", async (e) => {
    e.stopPropagation();
    callbacks.onBeforeMutation(`Remove genetic test from ${name()}`);
    try {
      await callbacks.api(`/api/individuals/${individualId}/genetic-tests/${test.id}`, { method: "DELETE" });
      await callbacks.onUpdate();
      if (currentId) openPanel(currentId);
    } catch (err) {
      console.error("Failed to delete genetic test:", err);
    }
  });
  hdr.append(hdrLabel, deleteBtn);
  hdr.addEventListener("click", () => item.classList.toggle("expanded"));
  item.append(hdr);

  const body = document.createElement("div");
  body.className = "panel-accordion-body";

  const patchTest = async (fields: Record<string, unknown>) => {
    try {
      await callbacks.api(`/api/individuals/${individualId}/genetic-tests/${test.id}`, {
        method: "PATCH",
        body: JSON.stringify(fields),
      });
      Object.assign(test, fields);
      hdrLabel.textContent = test.gene || "Genetic Test";
      if (test.result) hdrLabel.textContent += ` \u2014 ${test.result}`;
      await callbacks.onUpdate();
    } catch (err) {
      console.error("Failed to update genetic test:", err);
    }
  };

  const elGene = makeInput();
  elGene.value = test.gene ?? "";
  elGene.placeholder = "e.g. BRCA1, BRCA2, MLH1";
  elGene.addEventListener("change", () => {
    callbacks.onBeforeMutation(`Edit genetic test on ${name()}`);
    patchTest({ gene: elGene.value });
  });

  const elResult = makeSelect(GENETIC_TEST_RESULT_OPTIONS);
  elResult.value = test.result ?? "";
  elResult.addEventListener("change", () => {
    callbacks.onBeforeMutation(`Edit genetic test result on ${name()}`);
    patchTest({ result: elResult.value || null });
  });

  const elMethod = makeInput();
  elMethod.value = test.method ?? "";
  elMethod.placeholder = "e.g. sequencing, MLPA";
  elMethod.addEventListener("change", () => {
    callbacks.onBeforeMutation(`Edit genetic test on ${name()}`);
    patchTest({ method: elMethod.value });
  });

  const elDate = makeInput("date");
  elDate.value = test.date ?? "";
  elDate.addEventListener("change", () => {
    callbacks.onBeforeMutation(`Edit genetic test date on ${name()}`);
    patchTest({ date: elDate.value || null });
  });

  body.append(
    makeField("Gene", elGene),
    makeField("Result", elResult),
    makeField("Method", elMethod),
    makeField("Date", elDate),
  );
  item.append(body);
  return item;
}

// --- Treatment accordion item ---

function buildTreatmentItem(
  data: IndividualData,
  treatment: IndividualTreatmentEntry,
  name: () => string,
): HTMLDivElement {
  const item = document.createElement("div");
  item.className = "panel-accordion-item";

  const ttCat = treatmentTypeCatalog.find((t) => t.id === treatment.treatment_type_id);
  const ttName = ttCat?.display_name || "Treatment";

  const hdr = document.createElement("div");
  hdr.className = "panel-accordion-header";
  const hdrLabel = document.createElement("span");
  hdrLabel.textContent = ttName;
  if (treatment.prophylactic) hdrLabel.textContent += " (prophylactic)";
  const deleteBtn = document.createElement("button");
  deleteBtn.className = "event-delete-btn";
  deleteBtn.textContent = "\u00d7";
  deleteBtn.addEventListener("click", async (e) => {
    e.stopPropagation();
    callbacks.onBeforeMutation(`Remove ${ttName} from ${name()}`);
    try {
      await callbacks.api(`/api/individuals/${data.id}/treatments/${treatment.id}`, { method: "DELETE" });
      await callbacks.onUpdate();
      if (currentId) openPanel(currentId);
    } catch (err) {
      console.error("Failed to delete treatment:", err);
    }
  });
  hdr.append(hdrLabel, deleteBtn);
  hdr.addEventListener("click", () => item.classList.toggle("expanded"));
  item.append(hdr);

  const body = document.createElement("div");
  body.className = "panel-accordion-body";

  const patchTreatment = async (fields: Record<string, unknown>) => {
    try {
      await callbacks.api(`/api/individuals/${data.id}/treatments/${treatment.id}`, {
        method: "PATCH",
        body: JSON.stringify(fields),
      });
      Object.assign(treatment, fields);
      await callbacks.onUpdate();
    } catch (err) {
      console.error("Failed to update treatment:", err);
    }
  };

  const elLaterality = makeSelect(LATERALITY_OPTIONS);
  elLaterality.value = treatment.laterality ?? "";
  elLaterality.addEventListener("change", () => {
    callbacks.onBeforeMutation(`Edit treatment on ${name()}`);
    patchTreatment({ laterality: elLaterality.value || null });
  });

  const elProphylactic = makeInput("checkbox") as HTMLInputElement;
  elProphylactic.checked = treatment.prophylactic ?? false;
  elProphylactic.addEventListener("change", () => {
    callbacks.onBeforeMutation(`Edit treatment on ${name()}`);
    patchTreatment({ prophylactic: elProphylactic.checked });
    hdrLabel.textContent = ttName + (elProphylactic.checked ? " (prophylactic)" : "");
  });

  // Disease link
  const diseaseOptions: string[][] = [["", "(none)"]];
  for (const d of data.diseases ?? []) {
    const dc = diseaseCatalog.find((c) => c.id === d.disease_id);
    diseaseOptions.push([d.disease_id, dc?.display_name || d.disease_id]);
  }
  const elDiseaseLink = makeSelect(diseaseOptions);
  elDiseaseLink.value = treatment.disease_id ?? "";
  elDiseaseLink.addEventListener("change", () => {
    callbacks.onBeforeMutation(`Edit treatment on ${name()}`);
    patchTreatment({ disease_id: elDiseaseLink.value || null });
  });

  const elStartDate = makeInput("date");
  elStartDate.value = treatment.date ?? "";
  elStartDate.addEventListener("change", () => {
    callbacks.onBeforeMutation(`Edit treatment date on ${name()}`);
    patchTreatment({ date: elStartDate.value || null });
  });

  const elEndDate = makeInput("date");
  elEndDate.value = treatment.end_date ?? "";
  elEndDate.addEventListener("change", () => {
    callbacks.onBeforeMutation(`Edit treatment date on ${name()}`);
    patchTreatment({ end_date: elEndDate.value || null });
  });

  body.append(
    makeField("Laterality", elLaterality),
    makeCheckboxRow("Prophylactic", elProphylactic),
    makeField("For disease", elDiseaseLink),
    makeField("Start date", elStartDate),
    makeField("End date", elEndDate),
  );
  item.append(body);
  return item;
}
