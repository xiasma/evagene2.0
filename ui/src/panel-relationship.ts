import {
  PanelCallbacks,
  DebouncerGroup,
  buildPanelShell,
  makeField,
  makeInput,
  makeTextarea,
  heading,
} from "./panel-utils";
import { buildEventEditor, RELATIONSHIP_STATUS_OPTIONS } from "./event-editor";

interface RelationshipData {
  id: string;
  display_name: string;
  notes: string;
  events: { id: string; type: string; display_name: string; date: string | null; properties: Record<string, unknown> }[];
}

const RELATIONSHIP_EVENT_TYPES = [
  ["marriage", "Marriage"],
  ["divorce", "Divorce"],
  ["separation", "Separation"],
  ["partnership", "Partnership"],
  ["engagement", "Engagement"],
  ["pregnancy", "Pregnancy"],
];

let callbacks: PanelCallbacks;
let sidebar: HTMLDivElement;
let currentId: string | null = null;
let debouncer = new DebouncerGroup();

export function initRelationshipPanel(cbs: PanelCallbacks): void {
  callbacks = cbs;
  sidebar = document.getElementById("sidebar") as HTMLDivElement;
}

export async function openRelationshipPanel(relationshipId: string): Promise<void> {
  const wasHidden = sidebar.classList.contains("hidden");
  currentId = relationshipId;
  sidebar.classList.remove("hidden");

  if (wasHidden) {
    sidebar.style.right = "24px";
    sidebar.style.top = "80px";
    sidebar.style.left = "auto";
  }

  const data = await callbacks.api<RelationshipData>(`/api/relationships/${relationshipId}`);
  buildDOM(data);
}

export function closeRelationshipPanel(): void {
  currentId = null;
  sidebar.classList.add("hidden");
  debouncer.clear();
}

function buildDOM(data: RelationshipData): void {
  debouncer.clear();
  debouncer = new DebouncerGroup();

  const { body } = buildPanelShell(sidebar, "Relationship", () => {
    closeRelationshipPanel();
    callbacks.onClose();
  });

  const elDisplayName = makeInput();
  elDisplayName.value = data.display_name ?? "";
  const elNotes = makeTextarea();
  elNotes.value = data.notes ?? "";

  const patch = async (patchBody: Record<string, unknown>) => {
    if (!currentId) return;
    try {
      await callbacks.api(`/api/relationships/${currentId}`, {
        method: "PATCH",
        body: JSON.stringify(patchBody),
      });
      await callbacks.onUpdate();
    } catch (err) {
      console.error("Relationship panel patch failed:", err);
    }
  };

  const wireDebounced = (el: HTMLInputElement | HTMLTextAreaElement, fn: () => void) =>
    debouncer.wireDebouncedWithUndo(el, fn, callbacks.onBeforeMutation);

  wireDebounced(elDisplayName, () => patch({ display_name: elDisplayName.value }));
  wireDebounced(elNotes, () => patch({ notes: elNotes.value }));

  const eventEditor = buildEventEditor({
    entityType: "relationship",
    entityId: data.id,
    events: data.events ?? [],
    eventTypes: RELATIONSHIP_EVENT_TYPES,
    callbacks,
    fields: ["certainty", "status"],
    statusOptions: RELATIONSHIP_STATUS_OPTIONS,
  });

  body.append(
    heading("Relationship"),
    makeField("Display Name", elDisplayName),
    makeField("Notes", elNotes),
    eventEditor,
  );
}
