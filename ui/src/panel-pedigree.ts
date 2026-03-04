import {
  PanelCallbacks,
  DebouncerGroup,
  buildPanelShell,
  makeField,
  makeInput,
  makeTextarea,
  heading,
} from "./panel-utils";
import { buildEventEditor } from "./event-editor";

interface PedigreeData {
  id: string;
  display_name: string;
  date_represented: string | null;
  owner: string;
  notes: string;
  events: { id: string; type: string; display_name: string; date: string | null; properties: Record<string, unknown> }[];
}

let callbacks: PanelCallbacks;
let sidebar: HTMLDivElement;
let currentId: string | null = null;
let debouncer = new DebouncerGroup();

export function initPedigreePanel(cbs: PanelCallbacks): void {
  callbacks = cbs;
  sidebar = document.getElementById("sidebar") as HTMLDivElement;
}

export async function openPedigreePanel(pedigreeId: string): Promise<void> {
  const wasHidden = sidebar.classList.contains("hidden");
  currentId = pedigreeId;
  sidebar.classList.remove("hidden");

  if (wasHidden) {
    sidebar.style.right = "24px";
    sidebar.style.top = "80px";
    sidebar.style.left = "auto";
  }

  const data = await callbacks.api<PedigreeData>(`/api/pedigrees/${pedigreeId}`);
  buildDOM(data);
}

export function closePedigreePanel(): void {
  currentId = null;
  sidebar.classList.add("hidden");
  debouncer.clear();
}

function buildDOM(data: PedigreeData): void {
  debouncer.clear();
  debouncer = new DebouncerGroup();

  const { body } = buildPanelShell(sidebar, "Pedigree", () => {
    closePedigreePanel();
    callbacks.onClose();
  });

  const elDisplayName = makeInput();
  elDisplayName.value = data.display_name ?? "";
  const elDate = makeInput("date");
  elDate.value = data.date_represented ?? "";
  const elOwner = makeInput();
  elOwner.value = data.owner ?? "";
  const elNotes = makeTextarea();
  elNotes.value = data.notes ?? "";

  const patch = async (patchBody: Record<string, unknown>) => {
    if (!currentId) return;
    try {
      await callbacks.api(`/api/pedigrees/${currentId}`, {
        method: "PATCH",
        body: JSON.stringify(patchBody),
      });
      await callbacks.onUpdate();
    } catch (err) {
      console.error("Pedigree panel patch failed:", err);
    }
  };

  const wireDebounced = (el: HTMLInputElement | HTMLTextAreaElement, fn: () => void) =>
    debouncer.wireDebouncedWithUndo(el, fn, callbacks.onBeforeMutation);

  wireDebounced(elDisplayName, () => patch({ display_name: elDisplayName.value }));
  wireDebounced(elDate, () => patch({ date_represented: elDate.value || null }));
  wireDebounced(elOwner, () => patch({ owner: elOwner.value }));
  wireDebounced(elNotes, () => patch({ notes: elNotes.value }));

  const eventEditor = buildEventEditor({
    entityType: "pedigree",
    entityId: data.id,
    events: data.events ?? [],
    eventTypes: [], // free text for pedigree events
    callbacks,
  });

  body.append(
    heading("Pedigree"),
    makeField("Display Name", elDisplayName),
    makeField("Date Represented", elDate),
    makeField("Owner", elOwner),
    makeField("Notes", elNotes),
    eventEditor,
  );
}
