import { PanelCallbacks } from "./panel-utils";

// --- Types ---

interface DiseaseInfo {
  id: string;
  display_name: string;
  color: string;
}

interface DiseasePaletteContext {
  getSelectedIds: () => Set<string>;
  getSelectedIndividualId: () => string | null;
  getIndividualDiseases: (id: string) => string[];  // returns disease_ids
}

// --- Module state ---

let callbacks: PanelCallbacks;
let context: DiseasePaletteContext;
let container: HTMLDivElement;
let diseases: DiseaseInfo[] = [];
let open = false;

// --- Init ---

export function initDiseasePalette(cbs: PanelCallbacks, ctx: DiseasePaletteContext): void {
  callbacks = cbs;
  context = ctx;
  container = document.getElementById("disease-palette") as HTMLDivElement;
}

// --- Open / Close / Toggle ---

export function openDiseasePalette(): void {
  open = true;
  container.classList.remove("hidden");
  refreshDiseasePalette();
}

export function closeDiseasePalette(): void {
  open = false;
  container.classList.add("hidden");
}

export function isDiseasePaletteOpen(): boolean {
  return open;
}

// --- Refresh ---

export async function refreshDiseasePalette(): Promise<void> {
  if (!open) return;
  try {
    diseases = await callbacks.api<DiseaseInfo[]>("/api/diseases");
  } catch {
    diseases = [];
  }
  buildSwatches();
}

// --- Build UI ---

function getEffectiveSelection(): string[] {
  const ids: string[] = [];
  const sel = context.getSelectedIds();
  const single = context.getSelectedIndividualId();
  if (sel.size > 0) {
    for (const id of sel) ids.push(id);
  }
  if (single && !ids.includes(single)) ids.push(single);
  return ids;
}

function buildSwatches(): void {
  container.innerHTML = "";

  if (diseases.length === 0) {
    const empty = document.createElement("span");
    empty.className = "disease-palette-empty";
    empty.textContent = "No diseases defined";
    container.append(empty);
    return;
  }

  const selected = getEffectiveSelection();

  for (const disease of diseases) {
    const swatch = document.createElement("button");
    swatch.className = "disease-swatch";
    swatch.title = disease.display_name || disease.id;
    swatch.style.setProperty("--swatch-color", disease.color || "#999");

    // Add label text next to the dot
    const dot = document.createElement("span");
    dot.className = "disease-swatch-dot";
    const label = document.createElement("span");
    label.className = "disease-swatch-label";
    label.textContent = disease.display_name || disease.id;
    swatch.append(dot, label);

    // Check active state: all selected have this disease
    if (selected.length > 0) {
      const allHave = selected.every((id) =>
        context.getIndividualDiseases(id).includes(disease.id)
      );
      if (allHave) swatch.classList.add("active");
    }

    swatch.addEventListener("click", () => toggleDisease(disease));
    container.append(swatch);
  }
}

async function toggleDisease(disease: DiseaseInfo): Promise<void> {
  const selected = getEffectiveSelection();
  if (selected.length === 0) return;

  const allHave = selected.every((id) =>
    context.getIndividualDiseases(id).includes(disease.id)
  );

  const action = allHave ? "Remove" : "Add";
  callbacks.onBeforeMutation(`${action} ${disease.display_name || "disease"}`);

  try {
    if (allHave) {
      // Remove from all
      await Promise.all(
        selected.map((id) =>
          callbacks.api(`/api/individuals/${id}/diseases/${disease.id}`, { method: "DELETE" })
        )
      );
    } else {
      // Add to those missing
      const missing = selected.filter(
        (id) => !context.getIndividualDiseases(id).includes(disease.id)
      );
      await Promise.all(
        missing.map((id) =>
          callbacks.api(`/api/individuals/${id}/diseases`, {
            method: "POST",
            body: JSON.stringify({ disease_id: disease.id }),
          })
        )
      );
    }
    await callbacks.onUpdate();
  } catch (err) {
    console.error("Disease toggle failed:", err);
  }
}
