// Theme and font settings module

const LS_KEY_THEME = "evagene-theme";
const LS_KEY_FONT = "evagene-font";

export interface FontSettings {
  family: string;
  size: number;
  bold: boolean;
  italic: boolean;
}

const defaultFont: FontSettings = {
  family: "system-ui",
  size: 12,
  bold: false,
  italic: false,
};

function loadFont(): FontSettings {
  try {
    const raw = localStorage.getItem(LS_KEY_FONT);
    if (raw) return { ...defaultFont, ...JSON.parse(raw) };
  } catch { /* ignore */ }
  return { ...defaultFont };
}

function saveFont(f: FontSettings): void {
  localStorage.setItem(LS_KEY_FONT, JSON.stringify(f));
}

export let fontSettings: FontSettings = loadFont();

export function updateFontSettings(partial: Partial<FontSettings>): void {
  fontSettings = { ...fontSettings, ...partial };
  saveFont(fontSettings);
}

export function getCanvasFont(): string {
  const style = fontSettings.italic ? "italic" : "normal";
  const weight = fontSettings.bold ? "bold" : "normal";
  return `${style} ${weight} ${fontSettings.size}px ${fontSettings.family}`;
}

export function getCanvasFontWithSize(size: number): string {
  const style = fontSettings.italic ? "italic" : "normal";
  const weight = fontSettings.bold ? "bold" : "normal";
  return `${style} ${weight} ${size}px ${fontSettings.family}`;
}

/** Read a CSS custom property value from the document root. */
export function cssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

export function isDark(): boolean {
  return document.documentElement.getAttribute("data-theme") === "dark";
}

export function toggleTheme(): void {
  const dark = !isDark();
  document.documentElement.setAttribute("data-theme", dark ? "dark" : "");
  localStorage.setItem(LS_KEY_THEME, dark ? "dark" : "light");
}

// Apply saved theme on load
(function initTheme() {
  const saved = localStorage.getItem(LS_KEY_THEME);
  if (saved === "dark") {
    document.documentElement.setAttribute("data-theme", "dark");
  }
})();
