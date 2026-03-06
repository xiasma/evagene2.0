// Shared utilities for all property panels

export interface PanelCallbacks {
  onUpdate: () => Promise<void>;
  onClose: () => void;
  api: <T>(path: string, options?: RequestInit) => Promise<T>;
  onBeforeMutation: (label?: string) => void;
}

// --- DOM builders ---

export function makeField(label: string, el: HTMLElement): HTMLDivElement {
  const div = document.createElement("div");
  div.className = "field";
  const lbl = document.createElement("label");
  lbl.textContent = label;
  div.append(lbl, el);
  return div;
}

export function makeInput(type = "text"): HTMLInputElement {
  const input = document.createElement("input");
  input.type = type;
  return input;
}

export function makeSelect(options: string[][]): HTMLSelectElement {
  const sel = document.createElement("select");
  for (const [value, text] of options) {
    const opt = document.createElement("option");
    opt.value = value;
    opt.textContent = text;
    sel.append(opt);
  }
  return sel;
}

export function makeTextarea(rows = 3): HTMLTextAreaElement {
  const ta = document.createElement("textarea");
  ta.rows = rows;
  return ta;
}

export function makeCheckboxRow(label: string, cb: HTMLInputElement, extra?: HTMLInputElement): HTMLDivElement {
  const div = document.createElement("div");
  div.className = "field-row";
  const lbl = document.createElement("label");
  lbl.textContent = label;
  div.append(cb, lbl);
  if (extra) div.append(extra);
  return div;
}

export function heading(text: string): HTMLHeadingElement {
  const h = document.createElement("h3");
  h.textContent = text;
  return h;
}

// --- Debounce group ---

export class DebouncerGroup {
  private timers = new Map<string, ReturnType<typeof setTimeout>>();
  private counter = 0;

  /** Create a debounced input handler that fires onBeforeMutation once per edit session. */
  wireDebouncedWithUndo(
    el: HTMLInputElement | HTMLTextAreaElement,
    fn: () => void,
    onBeforeMutation: (() => void) | ((label?: string) => void),
    delay = 500,
  ): void {
    const key = `debounce-${this.counter++}`;
    let undoFired = false;
    const handler = () => {
      if (!undoFired) {
        onBeforeMutation();
        undoFired = true;
      }
      const existing = this.timers.get(key);
      if (existing) clearTimeout(existing);
      this.timers.set(key, setTimeout(() => {
        fn();
        undoFired = false;
      }, delay));
    };
    el.addEventListener("input", handler);
  }

  clear(): void {
    for (const t of this.timers.values()) clearTimeout(t);
    this.timers.clear();
  }
}

// --- Drag logic ---

export function initDrag(handle: HTMLElement, panel: HTMLElement): void {
  let dragging = false;
  let offsetX = 0;
  let offsetY = 0;

  handle.addEventListener("pointerdown", (e) => {
    dragging = true;
    const rect = panel.getBoundingClientRect();
    offsetX = e.clientX - rect.left;
    offsetY = e.clientY - rect.top;
    handle.setPointerCapture(e.pointerId);
    e.preventDefault();
  });

  handle.addEventListener("pointermove", (e) => {
    if (!dragging) return;
    const x = e.clientX - offsetX;
    const y = e.clientY - offsetY;
    panel.style.left = `${x}px`;
    panel.style.top = `${y}px`;
    panel.style.right = "auto";
  });

  handle.addEventListener("pointerup", () => {
    dragging = false;
  });
}

// --- Panel shell builder ---

/**
 * Builds the panel titlebar + scrollable body, sets up drag, and returns references.
 * Clears the sidebar first.
 */
export function buildPanelShell(
  sidebar: HTMLDivElement,
  title: string,
  onClose: () => void,
): { body: HTMLDivElement } {
  sidebar.innerHTML = "";

  const titlebar = document.createElement("div");
  titlebar.className = "sidebar-titlebar";
  const titleText = document.createElement("span");
  titleText.textContent = title;
  const closeBtn = document.createElement("button");
  closeBtn.className = "sidebar-close";
  closeBtn.textContent = "\u00d7";
  closeBtn.addEventListener("click", onClose);
  titlebar.append(titleText, closeBtn);
  sidebar.append(titlebar);

  const body = document.createElement("div");
  body.className = "sidebar-body";
  sidebar.append(body);

  initDrag(titlebar, sidebar);

  return { body };
}
