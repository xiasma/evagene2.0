import "./panel-risk.css";
import { PanelCallbacks, buildPanelShell } from "./panel-utils";

// --- Types ---

interface FutureRisk {
  age: number;
  risks: Record<string, number>;
}

interface RiskResult {
  model: string;
  counselee_id: string;
  counselee_name: string;
  carrier_probabilities: Record<string, number>;
  future_risks: FutureRisk[];
  warnings: string[];
  error: string | null;
}

interface RiskModelsResponse {
  models: string[];
  sidecar_available: boolean;
}

// --- Module state ---

let callbacks: PanelCallbacks;
let sidebar: HTMLDivElement;
let visible = false;
let currentPedigreeId: string | null = null;

// --- Public API ---

export function initRiskPanel(cbs: PanelCallbacks): void {
  callbacks = cbs;
  sidebar = document.createElement("div");
  sidebar.id = "risk-panel";
  sidebar.className = "sidebar hidden";
  document.body.appendChild(sidebar);
}

export async function openRiskPanel(pedigreeId: string): Promise<void> {
  currentPedigreeId = pedigreeId;
  sidebar.classList.remove("hidden");
  visible = true;
  await renderPanel();
}

export function closeRiskPanel(): void {
  sidebar.classList.add("hidden");
  visible = false;
  currentPedigreeId = null;
}

export function isRiskPanelOpen(): boolean {
  return visible;
}

// --- Rendering ---

async function renderPanel(): Promise<void> {
  if (!currentPedigreeId) return;

  const { body } = buildPanelShell(sidebar, "Risk Analysis", closeRiskPanel);

  // Loading state
  body.innerHTML = `<div class="risk-loading">Checking sidecar...</div>`;

  // Check available models
  let modelsResp: RiskModelsResponse;
  try {
    modelsResp = await callbacks.api<RiskModelsResponse>(
      `/api/pedigrees/${currentPedigreeId}/risk/models`
    );
  } catch {
    body.innerHTML = `<div class="risk-error">Could not reach the API.</div>`;
    return;
  }

  if (!modelsResp.sidecar_available) {
    body.innerHTML = `
      <div class="risk-error">
        <strong>R sidecar not running</strong>
        <p>Start it with:</p>
        <code>cd risk && Rscript run.R</code>
      </div>
    `;
    return;
  }

  if (modelsResp.models.length === 0) {
    body.innerHTML = `<div class="risk-error">No risk models available.</div>`;
    return;
  }

  // Build form
  body.innerHTML = "";

  // Model selector
  const formDiv = document.createElement("div");
  formDiv.className = "risk-form";

  const modelLabel = document.createElement("label");
  modelLabel.textContent = "Model";
  const modelSelect = document.createElement("select");
  modelSelect.className = "risk-select";

  const MODEL_DESCRIPTIONS: Record<string, string> = {
    BRCAPRO: "BRCA1/2 — Breast & Ovarian",
    MMRpro: "MLH1/MSH2/MSH6 — Lynch Syndrome",
    PancPRO: "PALB2 — Pancreatic",
  };

  for (const m of modelsResp.models) {
    const opt = document.createElement("option");
    opt.value = m;
    opt.textContent = `${m} — ${MODEL_DESCRIPTIONS[m] || ""}`;
    modelSelect.appendChild(opt);
  }

  // Allele frequency selector
  const allefLabel = document.createElement("label");
  allefLabel.textContent = "Population";
  const allefSelect = document.createElement("select");
  allefSelect.className = "risk-select";
  for (const [val, text] of [
    ["nonAJ", "General (non-Ashkenazi)"],
    ["AJ", "Ashkenazi Jewish"],
    ["Italian", "Italian"],
  ]) {
    const opt = document.createElement("option");
    opt.value = val;
    opt.textContent = text;
    allefSelect.appendChild(opt);
  }

  // Run button
  const runBtn = document.createElement("button");
  runBtn.className = "risk-run-btn";
  runBtn.textContent = "Run Analysis";

  formDiv.append(modelLabel, modelSelect, allefLabel, allefSelect, runBtn);
  body.appendChild(formDiv);

  // Results container
  const resultsDiv = document.createElement("div");
  resultsDiv.className = "risk-results";
  body.appendChild(resultsDiv);

  // Model change → show description
  const descDiv = document.createElement("div");
  descDiv.className = "risk-model-desc";
  updateModelDesc(modelSelect.value, descDiv);
  body.insertBefore(descDiv, resultsDiv);

  modelSelect.addEventListener("change", () => {
    updateModelDesc(modelSelect.value, descDiv);
    // Show/hide allele freq for BRCAPRO only
    allefLabel.style.display = modelSelect.value === "BRCAPRO" ? "" : "none";
    allefSelect.style.display = modelSelect.value === "BRCAPRO" ? "" : "none";
  });
  // Initial visibility
  allefLabel.style.display = modelSelect.value === "BRCAPRO" ? "" : "none";
  allefSelect.style.display = modelSelect.value === "BRCAPRO" ? "" : "none";

  // Run handler
  runBtn.addEventListener("click", async () => {
    runBtn.disabled = true;
    runBtn.textContent = "Calculating...";
    resultsDiv.innerHTML = `<div class="risk-loading">Running ${modelSelect.value}...</div>`;

    try {
      const result = await callbacks.api<RiskResult>(
        `/api/pedigrees/${currentPedigreeId}/risk/calculate`,
        {
          method: "POST",
          body: JSON.stringify({
            model: modelSelect.value,
            allef_type: allefSelect.value,
          }),
        }
      );
      renderResults(result, resultsDiv);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      resultsDiv.innerHTML = `<div class="risk-error">${escapeHtml(msg)}</div>`;
    } finally {
      runBtn.disabled = false;
      runBtn.textContent = "Run Analysis";
    }
  });
}

function updateModelDesc(model: string, el: HTMLDivElement): void {
  const descs: Record<string, string> = {
    BRCAPRO: "Estimates BRCA1/BRCA2 mutation carrier probability and future breast/ovarian cancer risk based on family history.",
    MMRpro: "Estimates MLH1/MSH2/MSH6 mutation carrier probability and future colorectal/endometrial cancer risk (Lynch syndrome).",
    PancPRO: "Estimates pancreatic cancer gene carrier probability and future pancreatic cancer risk based on family history.",
  };
  el.textContent = descs[model] || "";
}

function renderResults(result: RiskResult, container: HTMLDivElement): void {
  container.innerHTML = "";

  // Warnings
  if (result.warnings.length > 0) {
    const warnDiv = document.createElement("div");
    warnDiv.className = "risk-warnings";
    warnDiv.innerHTML = `<strong>Warnings:</strong><ul>${
      result.warnings.map(w => `<li>${escapeHtml(w)}</li>`).join("")
    }</ul>`;
    container.appendChild(warnDiv);
  }

  // Error
  if (result.error) {
    const errDiv = document.createElement("div");
    errDiv.className = "risk-error";
    errDiv.textContent = result.error;
    container.appendChild(errDiv);
    return;
  }

  // Counselee info
  const infoDiv = document.createElement("div");
  infoDiv.className = "risk-info";
  infoDiv.innerHTML = `<strong>${escapeHtml(result.model)}</strong> results for <strong>${escapeHtml(result.counselee_name || "proband")}</strong>`;
  container.appendChild(infoDiv);

  // Carrier probabilities
  if (Object.keys(result.carrier_probabilities).length > 0) {
    const section = document.createElement("div");
    section.className = "risk-section";

    const h = document.createElement("h4");
    h.textContent = "Carrier Probabilities";
    section.appendChild(h);

    const table = document.createElement("table");
    table.className = "risk-table";
    const thead = document.createElement("thead");
    thead.innerHTML = `<tr><th>Gene / Status</th><th>Probability</th></tr>`;
    table.appendChild(thead);

    const tbody = document.createElement("tbody");
    for (const [key, val] of Object.entries(result.carrier_probabilities)) {
      const tr = document.createElement("tr");
      const pct = (val * 100).toFixed(1);
      tr.innerHTML = `<td>${escapeHtml(key)}</td><td class="risk-val">${pct}%</td>`;
      // Highlight high-risk rows
      if (val >= 0.1) tr.classList.add("risk-elevated");
      if (val >= 0.25) tr.classList.add("risk-high");
      tbody.appendChild(tr);
    }
    table.appendChild(tbody);
    section.appendChild(table);
    container.appendChild(section);
  }

  // Future risks
  if (result.future_risks.length > 0) {
    const section = document.createElement("div");
    section.className = "risk-section";

    const h = document.createElement("h4");
    h.textContent = "Future Cancer Risk";
    section.appendChild(h);

    // Determine risk column names
    const riskKeys = Object.keys(result.future_risks[0].risks);

    const table = document.createElement("table");
    table.className = "risk-table";
    const thead = document.createElement("thead");
    const headerRow = document.createElement("tr");
    headerRow.innerHTML = `<th>By Age</th>`;
    for (const key of riskKeys) {
      const th = document.createElement("th");
      th.textContent = key;
      headerRow.appendChild(th);
    }
    thead.appendChild(headerRow);
    table.appendChild(thead);

    const tbody = document.createElement("tbody");
    for (const row of result.future_risks) {
      const tr = document.createElement("tr");
      tr.innerHTML = `<td>${row.age}</td>`;
      for (const key of riskKeys) {
        const val = row.risks[key] || 0;
        const pct = (val * 100).toFixed(1);
        const td = document.createElement("td");
        td.className = "risk-val";
        td.textContent = `${pct}%`;
        if (val >= 0.1) td.classList.add("risk-elevated");
        if (val >= 0.25) td.classList.add("risk-high");
        tr.appendChild(td);
      }
      tbody.appendChild(tr);
    }
    table.appendChild(tbody);
    section.appendChild(table);
    container.appendChild(section);
  }
}

function escapeHtml(text: string): string {
  const el = document.createElement("span");
  el.textContent = text;
  return el.innerHTML;
}
