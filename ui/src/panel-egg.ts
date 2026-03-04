import {
  PanelCallbacks,
  DebouncerGroup,
  buildPanelShell,
  makeField,
  makeInput,
  makeTextarea,
  makeCheckboxRow,
  heading,
} from "./panel-utils";
import { buildEventEditor } from "./event-editor";

interface EggData {
  id: string;
  display_name: string;
  notes: string;
  properties: Record<string, unknown>;
  events: { id: string; type: string; display_name: string; date: string | null; properties: Record<string, unknown> }[];
}

let callbacks: PanelCallbacks;
let sidebar: HTMLDivElement;
let currentId: string | null = null;
let debouncer = new DebouncerGroup();

export function initEggPanel(cbs: PanelCallbacks): void {
  callbacks = cbs;
  sidebar = document.getElementById("sidebar") as HTMLDivElement;
}

export async function openEggPanel(eggId: string): Promise<void> {
  const wasHidden = sidebar.classList.contains("hidden");
  currentId = eggId;
  sidebar.classList.remove("hidden");

  if (wasHidden) {
    sidebar.style.right = "24px";
    sidebar.style.top = "80px";
    sidebar.style.left = "auto";
  }

  const data = await callbacks.api<EggData>(`/api/eggs/${eggId}`);
  buildDOM(data);
}

export function closeEggPanel(): void {
  currentId = null;
  sidebar.classList.add("hidden");
  debouncer.clear();
}

function buildDOM(data: EggData): void {
  debouncer.clear();
  debouncer = new DebouncerGroup();

  const { body } = buildPanelShell(sidebar, "Egg", () => {
    closeEggPanel();
    callbacks.onClose();
  });

  const elDisplayName = makeInput();
  elDisplayName.value = data.display_name ?? "";
  const elNotes = makeTextarea();
  elNotes.value = data.notes ?? "";

  const elTwin = makeInput("checkbox") as HTMLInputElement;
  elTwin.checked = !!(data.properties?.twin);
  const elMonozygotic = makeInput("checkbox") as HTMLInputElement;
  elMonozygotic.checked = !!(data.properties?.monozygotic);

  const patch = async (patchBody: Record<string, unknown>) => {
    if (!currentId) return;
    try {
      await callbacks.api(`/api/eggs/${currentId}`, {
        method: "PATCH",
        body: JSON.stringify(patchBody),
      });
      await callbacks.onUpdate();
    } catch (err) {
      console.error("Egg panel patch failed:", err);
    }
  };

  const patchProperty = async (key: string, value: unknown) => {
    if (!currentId) return;
    try {
      const d = await callbacks.api<EggData>(`/api/eggs/${currentId}`);
      const merged = { ...(d.properties ?? {}), [key]: value };
      await callbacks.api(`/api/eggs/${currentId}`, {
        method: "PATCH",
        body: JSON.stringify({ properties: merged }),
      });
      await callbacks.onUpdate();
    } catch (err) {
      console.error("Egg panel property patch failed:", err);
    }
  };

  const wireDebounced = (el: HTMLInputElement | HTMLTextAreaElement, fn: () => void) =>
    debouncer.wireDebouncedWithUndo(el, fn, callbacks.onBeforeMutation);

  wireDebounced(elDisplayName, () => patch({ display_name: elDisplayName.value }));
  wireDebounced(elNotes, () => patch({ notes: elNotes.value }));

  elTwin.addEventListener("change", () => { callbacks.onBeforeMutation(); patchProperty("twin", elTwin.checked); });
  elMonozygotic.addEventListener("change", () => { callbacks.onBeforeMutation(); patchProperty("monozygotic", elMonozygotic.checked); });

  const eventEditor = buildEventEditor({
    entityType: "egg",
    entityId: data.id,
    events: data.events ?? [],
    eventTypes: [], // free text for egg events
    callbacks,
  });

  body.append(
    heading("Egg"),
    makeField("Display Name", elDisplayName),
    makeField("Notes", elNotes),
    makeCheckboxRow("Twin", elTwin),
    makeCheckboxRow("Monozygotic", elMonozygotic),
    eventEditor,
  );
}
