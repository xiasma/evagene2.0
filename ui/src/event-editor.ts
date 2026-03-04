import { PanelCallbacks, makeField, makeInput, makeSelect, heading } from "./panel-utils";

// --- Types ---

interface EventData {
  id: string;
  type: string;
  display_name: string;
  date: string | null;
  properties: Record<string, unknown>;
}

interface EventEditorOptions {
  entityType: "individual" | "relationship" | "egg" | "pedigree";
  entityId: string;
  events: EventData[];
  eventTypes: string[][]; // [value, label] pairs — or empty for free text
  callbacks: PanelCallbacks;
  /** Which property fields to show. Defaults to all. */
  fields?: ("numeric_value" | "text_value" | "certainty" | "status")[];
  /** Override status dropdown options. Uses INDIVIDUAL_STATUS_OPTIONS by default. */
  statusOptions?: string[][];
}

// --- Option lists ---

const CERTAINTY_OPTIONS = [
  ["", "(none)"],
  ["unknown", "Unknown"],
  ["hearsay", "Hearsay"],
  ["evidence", "Evidence"],
  ["proven", "Proven"],
  ["other", "Other"],
];

const INDIVIDUAL_STATUS_OPTIONS = [
  ["", "(none)"],
  ["unknown", "Unknown"],
  ["natural_conception", "Natural Conception"],
  ["assisted_conception", "Assisted Conception"],
  ["other_conception", "Other Conception"],
  ["invasive_test", "Invasive Test"],
  ["uninvasive_test", "Uninvasive Test"],
  ["spontaneous_abortion", "Spontaneous Abortion"],
  ["therapeutic_abortion", "Therapeutic Abortion"],
  ["natural_delivery", "Natural Delivery"],
  ["assisted_delivery", "Assisted Delivery"],
  ["other_delivery", "Other Delivery"],
  ["consultation", "Consultation"],
  ["diagnosis", "Diagnosis"],
  ["trauma", "Trauma"],
  ["treatment", "Treatment"],
  ["death", "Death"],
  ["other", "Other"],
];

export const RELATIONSHIP_STATUS_OPTIONS = [
  ["", "(none)"],
  ["unknown", "Unknown"],
  ["marriage", "Marriage"],
  ["divorce", "Divorce"],
  ["separation", "Separation"],
  ["engagement", "Engagement"],
  ["other", "Other"],
];

const ALL_FIELDS: EventEditorOptions["fields"] = ["numeric_value", "text_value", "certainty", "status"];

// --- Build event editor component ---

export function buildEventEditor(opts: EventEditorOptions): HTMLDivElement {
  const container = document.createElement("div");
  container.className = "event-list";
  container.append(heading("Events"));

  const list = document.createElement("div");
  container.append(list);

  function renderList() {
    list.innerHTML = "";
    for (const ev of opts.events) {
      list.append(buildEventItem(ev, opts));
    }
  }

  // Add button
  const addBtn = document.createElement("button");
  addBtn.className = "event-add-btn";
  addBtn.textContent = "+ Add Event";
  addBtn.addEventListener("click", async () => {
    const defaultType = opts.eventTypes.length > 0 ? opts.eventTypes[0][0] : "other";
    opts.callbacks.onBeforeMutation();
    try {
      const path = `/api/${opts.entityType}s/${opts.entityId}/events`;
      const newEvent = await opts.callbacks.api<EventData>(path, {
        method: "POST",
        body: JSON.stringify({ type: defaultType }),
      });
      opts.events.push(newEvent);
      renderList();
      await opts.callbacks.onUpdate();
    } catch (err) {
      console.error("Failed to add event:", err);
    }
  });
  container.append(addBtn);

  renderList();
  return container;
}

function buildEventItem(ev: EventData, opts: EventEditorOptions): HTMLDivElement {
  const item = document.createElement("div");
  item.className = "event-item";

  // Header (collapsed view)
  const hdr = document.createElement("div");
  hdr.className = "event-item-header";
  const hdrLabel = document.createElement("span");
  hdrLabel.textContent = formatEventLabel(ev, opts.eventTypes);
  const deleteBtn = document.createElement("button");
  deleteBtn.className = "event-delete-btn";
  deleteBtn.textContent = "\u00d7";
  deleteBtn.addEventListener("click", async (e) => {
    e.stopPropagation();
    opts.callbacks.onBeforeMutation();
    try {
      await opts.callbacks.api(`/api/events/${ev.id}`, { method: "DELETE" });
      const idx = opts.events.indexOf(ev);
      if (idx >= 0) opts.events.splice(idx, 1);
      item.remove();
      await opts.callbacks.onUpdate();
    } catch (err) {
      console.error("Failed to delete event:", err);
    }
  });
  hdr.append(hdrLabel, deleteBtn);
  item.append(hdr);

  // Body (expanded view)
  const body = document.createElement("div");
  body.className = "event-item-body";
  item.append(body);

  hdr.addEventListener("click", () => {
    item.classList.toggle("expanded");
  });

  // Type field
  let elType: HTMLSelectElement | HTMLInputElement;
  if (opts.eventTypes.length > 0) {
    elType = makeSelect(opts.eventTypes);
    elType.value = ev.type;
  } else {
    elType = makeInput();
    elType.value = ev.type;
    elType.placeholder = "Event type";
  }
  elType.addEventListener("change", () => {
    patchEvent(ev, opts, { type: elType.value });
    hdrLabel.textContent = formatEventLabel(ev, opts.eventTypes);
  });

  // Display name
  const elName = makeInput();
  elName.value = ev.display_name ?? "";
  elName.addEventListener("change", () => {
    patchEvent(ev, opts, { display_name: elName.value });
    hdrLabel.textContent = formatEventLabel(ev, opts.eventTypes);
  });

  // Date
  const elDate = makeInput("date");
  elDate.value = ev.date ?? "";
  elDate.addEventListener("change", () => {
    patchEvent(ev, opts, { date: elDate.value || null });
    hdrLabel.textContent = formatEventLabel(ev, opts.eventTypes);
  });

  body.append(
    makeField("Type", elType),
    makeField("Display Name", elName),
    makeField("Date", elDate),
  );

  const fields = opts.fields ?? ALL_FIELDS;

  if (fields!.includes("numeric_value")) {
    const elNumeric = makeInput("number");
    elNumeric.value = ev.properties?.numeric_value != null ? String(ev.properties.numeric_value) : "";
    elNumeric.addEventListener("change", () => {
      const val = elNumeric.value === "" ? null : parseInt(elNumeric.value, 10);
      patchEventProperty(ev, opts, "numeric_value", val);
    });
    body.append(makeField("Numeric Value", elNumeric));
  }

  if (fields!.includes("text_value")) {
    const elText = makeInput();
    elText.value = (ev.properties?.text_value as string) ?? "";
    elText.addEventListener("change", () => {
      patchEventProperty(ev, opts, "text_value", elText.value || null);
    });
    body.append(makeField("Text Value", elText));
  }

  if (fields!.includes("certainty")) {
    const elCertainty = makeSelect(CERTAINTY_OPTIONS);
    elCertainty.value = (ev.properties?.certainty as string) ?? "";
    elCertainty.addEventListener("change", () => {
      patchEventProperty(ev, opts, "certainty", elCertainty.value || null);
    });
    body.append(makeField("Certainty", elCertainty));
  }

  if (fields!.includes("status")) {
    const statusOpts = opts.statusOptions ?? INDIVIDUAL_STATUS_OPTIONS;
    const elStatus = makeSelect(statusOpts);
    elStatus.value = (ev.properties?.status as string) ?? "";
    elStatus.addEventListener("change", () => {
      patchEventProperty(ev, opts, "status", elStatus.value || null);
    });
    body.append(makeField("Status", elStatus));
  }

  return item;
}

function formatEventLabel(ev: EventData, eventTypes: string[][]): string {
  const typePair = eventTypes.find(([v]) => v === ev.type);
  const typeLabel = typePair ? typePair[1] : ev.type;
  const detail = ev.display_name || ev.date || "";
  return detail ? `${typeLabel} \u2014 ${detail}` : typeLabel;
}

async function patchEvent(ev: EventData, opts: EventEditorOptions, fields: Record<string, unknown>): Promise<void> {
  opts.callbacks.onBeforeMutation();
  try {
    // Update local data
    Object.assign(ev, fields);
    await opts.callbacks.api(`/api/events/${ev.id}`, {
      method: "PATCH",
      body: JSON.stringify(fields),
    });
    await opts.callbacks.onUpdate();
  } catch (err) {
    console.error("Failed to patch event:", err);
  }
}

async function patchEventProperty(ev: EventData, opts: EventEditorOptions, key: string, value: unknown): Promise<void> {
  opts.callbacks.onBeforeMutation();
  try {
    const merged = { ...(ev.properties ?? {}), [key]: value };
    ev.properties = merged;
    await opts.callbacks.api(`/api/events/${ev.id}`, {
      method: "PATCH",
      body: JSON.stringify({ properties: merged }),
    });
    await opts.callbacks.onUpdate();
  } catch (err) {
    console.error("Failed to patch event property:", err);
  }
}
