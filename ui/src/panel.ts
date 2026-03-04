import "./panel.css";
import { renderMarkdown } from "./markdown";

// --- Types ---

interface PanelCallbacks {
  onUpdate: () => Promise<void>;
  onClose: () => void;
  api: <T>(path: string, options?: RequestInit) => Promise<T>;
  onBeforeMutation: () => void;
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
}

// --- Module state ---

let callbacks: PanelCallbacks;
let sidebar: HTMLDivElement;
let currentId: string | null = null;
let debounceTimers: Map<string, ReturnType<typeof setTimeout>> = new Map();

// Field elements
let elDisplayName: HTMLInputElement;
let elGivenNames: HTMLInputElement;
let elSurname: HTMLInputElement;
let elTitle: HTMLInputElement;
let elSurnameAtBirth: HTMLInputElement;

let elSex: HTMLSelectElement;
let elMortality: HTMLSelectElement;
let elAffection: HTMLSelectElement;
let elFertility: HTMLSelectElement;
let elProband: HTMLInputElement;  // range slider 0-360
let elProbandText: HTMLInputElement;
let elGeneration: HTMLInputElement;

let elDob: HTMLInputElement;
let elDod: HTMLInputElement;

let elNotes: HTMLTextAreaElement;
let elNotesPreview: HTMLDivElement;
let elNotesToggle: HTMLButtonElement;
let elShowNotes: HTMLInputElement;
let notesPreviewMode = false;

let elTelHome: HTMLInputElement;
let elTelWork: HTMLInputElement;
let elTelMobile: HTMLInputElement;
let elEmail: HTMLInputElement;

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

// --- DOM builders ---

function makeField(label: string, el: HTMLElement): HTMLDivElement {
  const div = document.createElement("div");
  div.className = "field";
  const lbl = document.createElement("label");
  lbl.textContent = label;
  div.append(lbl, el);
  return div;
}

function makeInput(type = "text"): HTMLInputElement {
  const input = document.createElement("input");
  input.type = type;
  return input;
}

function makeSelect(options: string[][]): HTMLSelectElement {
  const sel = document.createElement("select");
  for (const [value, text] of options) {
    const opt = document.createElement("option");
    opt.value = value;
    opt.textContent = text;
    sel.append(opt);
  }
  return sel;
}

function makeTextarea(): HTMLTextAreaElement {
  const ta = document.createElement("textarea");
  ta.rows = 3;
  return ta;
}

function makeCheckboxRow(label: string, cb: HTMLInputElement, extra?: HTMLInputElement): HTMLDivElement {
  const div = document.createElement("div");
  div.className = "field-row";
  const lbl = document.createElement("label");
  lbl.textContent = label;
  div.append(cb, lbl);
  if (extra) div.append(extra);
  return div;
}

function heading(text: string): HTMLHeadingElement {
  const h = document.createElement("h3");
  h.textContent = text;
  return h;
}

// --- Init ---

export function initPanel(cbs: PanelCallbacks): void {
  callbacks = cbs;

  sidebar = document.getElementById("sidebar") as HTMLDivElement;

  // Title bar with drag handle + close button
  const titlebar = document.createElement("div");
  titlebar.className = "sidebar-titlebar";
  const titleText = document.createElement("span");
  titleText.textContent = "Properties";
  const closeBtn = document.createElement("button");
  closeBtn.className = "sidebar-close";
  closeBtn.textContent = "\u00d7";
  closeBtn.addEventListener("click", () => {
    closePanel();
    cbs.onClose();
  });
  titlebar.append(titleText, closeBtn);
  sidebar.append(titlebar);

  // Scrollable body
  const body = document.createElement("div");
  body.className = "sidebar-body";
  sidebar.append(body);

  // Set up dragging
  initDrag(titlebar);

  // Identity section
  elDisplayName = makeInput();
  elGivenNames = makeInput();
  elSurname = makeInput();
  elTitle = makeInput();
  elSurnameAtBirth = makeInput();

  // Clinical section
  elSex = makeSelect(SEX_OPTIONS);
  elMortality = makeSelect(DEATH_OPTIONS);
  elAffection = makeSelect(AFFECTION_OPTIONS);
  elFertility = makeSelect(FERTILITY_OPTIONS);
  elProband = makeInput("range") as HTMLInputElement;
  elProband.min = "0";
  elProband.max = "360";
  elProband.value = "0";
  elProband.className = "proband-slider";
  elProbandText = makeInput();
  elProbandText.placeholder = "Proband label";
  elGeneration = makeInput("number");

  // Dates section
  elDob = makeInput("date");
  elDod = makeInput("date");

  // Notes section
  elNotes = makeTextarea();
  elNotesPreview = document.createElement("div");
  elNotesPreview.className = "notes-preview";
  elNotesPreview.style.display = "none";
  elNotesToggle = document.createElement("button");
  elNotesToggle.className = "notes-toggle";
  elNotesToggle.textContent = "Preview";
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
  elShowNotes = makeInput("checkbox") as HTMLInputElement;

  // Contact section
  elTelHome = makeInput("tel");
  elTelWork = makeInput("tel");
  elTelMobile = makeInput("tel");
  elEmail = makeInput("email");

  // Build DOM into scrollable body
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
  );

  // Wire events — immediate for dropdowns/checkbox
  elSex.addEventListener("change", () => { callbacks.onBeforeMutation(); patchDirect({ biological_sex: elSex.value }); });
  elMortality.addEventListener("change", () => { callbacks.onBeforeMutation(); patchProperty("death_status", elMortality.value); });
  elAffection.addEventListener("change", () => { callbacks.onBeforeMutation(); patchProperty("affection_status", elAffection.value); });
  elFertility.addEventListener("change", () => { callbacks.onBeforeMutation(); patchProperty("fertility_status", elFertility.value); });
  elProband.addEventListener("input", () => { callbacks.onBeforeMutation(); patchDirect({ proband: parseFloat(elProband.value) }); });
  elShowNotes.addEventListener("change", () => { callbacks.onBeforeMutation(); patchProperty("show_notes", elShowNotes.checked); });

  // Wire events — debounced for text inputs (onBeforeMutation fires once when typing starts)
  wireDebouncedWithUndo(elDisplayName, () => patchDirect({ display_name: elDisplayName.value }));
  wireDebouncedWithUndo(elGivenNames, () => patchDirect({ name: buildName() }));
  wireDebouncedWithUndo(elSurname, () => patchDirect({ name: buildName() }));
  wireDebouncedWithUndo(elTitle, () => patchDirect({ name: buildName() }));
  wireDebouncedWithUndo(elSurnameAtBirth, () => patchProperty("surname_at_birth", elSurnameAtBirth.value));
  wireDebouncedWithUndo(elProbandText, () => patchDirect({ proband_text: elProbandText.value }));
  wireDebouncedWithUndo(elGeneration, () => {
    const val = elGeneration.value === "" ? null : parseInt(elGeneration.value, 10);
    patchDirect({ generation: val });
  });
  wireDebouncedWithUndo(elDob, () => patchProperty("date_of_birth", elDob.value));
  wireDebouncedWithUndo(elDod, () => handleDateOfDeath(elDod.value));
  wireDebouncedWithUndo(elNotes, () => patchDirect({ notes: elNotes.value }));
  wireDebouncedWithUndo(elTelHome, () => patchContact());
  wireDebouncedWithUndo(elTelWork, () => patchContact());
  wireDebouncedWithUndo(elTelMobile, () => patchContact());
  wireDebouncedWithUndo(elEmail, () => patchContact());
}

// --- Open / Close ---

export async function openPanel(individualId: string): Promise<void> {
  // If already open for same individual, just refresh
  const wasHidden = sidebar.classList.contains("hidden");
  currentId = individualId;
  sidebar.classList.remove("hidden");

  // Reset position only when first opening (not when switching individuals)
  if (wasHidden) {
    sidebar.style.right = "24px";
    sidebar.style.top = "80px";
    sidebar.style.left = "auto";
  }

  // Fetch current data
  const data = await callbacks.api<IndividualData>(`/api/individuals/${individualId}`);
  populate(data);
}

export function closePanel(): void {
  currentId = null;
  sidebar.classList.add("hidden");
  clearDebounces();
}

export function isPanelOpen(): boolean {
  return currentId !== null;
}

// --- Populate fields from API data ---

function populate(data: IndividualData): void {
  elDisplayName.value = data.display_name ?? "";
  elGivenNames.value = (data.name?.given ?? []).join(" ");
  elSurname.value = data.name?.family ?? "";
  elTitle.value = data.name?.prefix ?? "";
  elSurnameAtBirth.value = (data.properties?.surname_at_birth as string) ?? "";

  elSex.value = data.biological_sex ?? "unknown";
  elMortality.value = (data.properties?.death_status as string) ?? "alive";
  elAffection.value = (data.properties?.affection_status as string) ?? "unknown";
  elFertility.value = (data.properties?.fertility_status as string) ?? "unknown";
  elProband.value = String(data.proband ?? 0);
  elProbandText.value = data.proband_text ?? "";
  elGeneration.value = data.generation != null ? String(data.generation) : "";

  elDob.value = (data.properties?.date_of_birth as string) ?? "";
  elDod.value = (data.properties?.date_of_death as string) ?? "";

  elNotes.value = data.notes ?? "";
  elShowNotes.checked = !!(data.properties?.show_notes);

  // Reset preview mode
  notesPreviewMode = false;
  elNotes.style.display = "";
  elNotesPreview.style.display = "none";
  elNotesToggle.textContent = "Preview";

  // Contacts
  const selfContact = data.contacts?.self;
  const tels = selfContact?.tel ?? [];
  elTelHome.value = tels.find((t) => t.type === "home")?.value ?? "";
  elTelWork.value = tels.find((t) => t.type === "work")?.value ?? "";
  elTelMobile.value = tels.find((t) => t.type === "cell")?.value ?? "";
  elEmail.value = (selfContact?.email ?? [])[0]?.value ?? "";
}

// --- Patch helpers ---

async function patchDirect(body: Record<string, unknown>): Promise<void> {
  if (!currentId) return;
  try {
    await callbacks.api(`/api/individuals/${currentId}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    });
    await callbacks.onUpdate();
  } catch (err) {
    console.error("Panel patch failed:", err);
  }
}

async function patchProperty(key: string, value: unknown): Promise<void> {
  if (!currentId) return;
  try {
    // Fetch current to get existing properties
    const data = await callbacks.api<IndividualData>(`/api/individuals/${currentId}`);
    const merged = { ...(data.properties ?? {}), [key]: value };
    await callbacks.api(`/api/individuals/${currentId}`, {
      method: "PATCH",
      body: JSON.stringify({ properties: merged }),
    });
    await callbacks.onUpdate();
  } catch (err) {
    console.error("Panel property patch failed:", err);
  }
}

async function patchContact(): Promise<void> {
  if (!currentId) return;
  try {
    const tel: { value: string; type: string }[] = [];
    if (elTelHome.value) tel.push({ value: elTelHome.value, type: "home" });
    if (elTelWork.value) tel.push({ value: elTelWork.value, type: "work" });
    if (elTelMobile.value) tel.push({ value: elTelMobile.value, type: "cell" });

    const email: { value: string; type: string }[] = [];
    if (elEmail.value) email.push({ value: elEmail.value, type: "home" });

    const contacts = {
      self: { tel, email },
    };

    await callbacks.api(`/api/individuals/${currentId}`, {
      method: "PATCH",
      body: JSON.stringify({ contacts }),
    });
    await callbacks.onUpdate();
  } catch (err) {
    console.error("Panel contact patch failed:", err);
  }
}

const DEAD_STATUSES = new Set([
  "dead", "suicide_confirmed", "suicide_unconfirmed", "spontaneous_abortion",
  "therapeutic_abortion", "neonatal_death", "stillborn", "lived_one_day",
]);

async function handleDateOfDeath(dateValue: string): Promise<void> {
  if (!currentId) return;
  try {
    // Fetch current individual to read existing properties
    const data = await callbacks.api<IndividualData>(`/api/individuals/${currentId}`);
    const props: Record<string, unknown> = { ...(data.properties ?? {}), date_of_death: dateValue };

    // If a date is being set and mortality is not already a death-related status, set to "dead"
    if (dateValue && !DEAD_STATUSES.has((data.properties?.death_status as string) ?? "")) {
      props.death_status = "dead";
    }

    await callbacks.api(`/api/individuals/${currentId}`, {
      method: "PATCH",
      body: JSON.stringify({ properties: props }),
    });

    // Add a death event if a date is being set
    if (dateValue) {
      await callbacks.api(`/api/individuals/${currentId}/events`, {
        method: "POST",
        body: JSON.stringify({ type: "death", date: dateValue }),
      });
    }

    // Update UI to reflect the mortality dropdown change
    elMortality.value = (props.death_status as string) ?? "alive";

    await callbacks.onUpdate();
  } catch (err) {
    console.error("Panel date-of-death patch failed:", err);
  }
}

function buildName(): Record<string, unknown> {
  return {
    given: elGivenNames.value.split(/\s+/).filter(Boolean),
    family: elSurname.value,
    prefix: elTitle.value,
  };
}

// --- Debounce ---

let debounceCounter = 0;

/** Debounced input handler that fires onBeforeMutation once when a new edit session starts. */
function wireDebouncedWithUndo(el: HTMLInputElement | HTMLTextAreaElement, fn: () => void): void {
  const key = `debounce-undo-${debounceCounter++}`;
  let undoFired = false;
  const handler = () => {
    if (!undoFired) {
      callbacks.onBeforeMutation();
      undoFired = true;
    }
    const existing = debounceTimers.get(key);
    if (existing) clearTimeout(existing);
    debounceTimers.set(key, setTimeout(() => {
      fn();
      undoFired = false;
    }, 500));
  };
  el.addEventListener("input", handler);
}

function clearDebounces(): void {
  for (const t of debounceTimers.values()) clearTimeout(t);
  debounceTimers.clear();
}

// --- Drag logic ---

function initDrag(handle: HTMLElement): void {
  let dragging = false;
  let offsetX = 0;
  let offsetY = 0;

  handle.addEventListener("pointerdown", (e) => {
    dragging = true;
    const rect = sidebar.getBoundingClientRect();
    offsetX = e.clientX - rect.left;
    offsetY = e.clientY - rect.top;
    handle.setPointerCapture(e.pointerId);
    e.preventDefault();
  });

  handle.addEventListener("pointermove", (e) => {
    if (!dragging) return;
    const x = e.clientX - offsetX;
    const y = e.clientY - offsetY;
    sidebar.style.left = `${x}px`;
    sidebar.style.top = `${y}px`;
    sidebar.style.right = "auto";
  });

  handle.addEventListener("pointerup", () => {
    dragging = false;
  });
}
