// Theme (auto / light / dark) and high contrast, remembered per browser.
export type Theme = "auto" | "light" | "dark";

const KEY = "cdl-sim:theme";
const CONTRAST = "cdl-sim:contrast";

const read = (k: string) => {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
};
const write = (k: string, v: string) => {
  try {
    localStorage.setItem(k, v);
  } catch {
    /* per-browser convenience only */
  }
};

export const savedTheme = (): Theme => (read(KEY) as Theme | null) ?? "auto";
export const savedContrast = () => read(CONTRAST) === "high";

export function applyTheme(theme: Theme, high: boolean): void {
  const root = document.documentElement;
  if (theme === "auto") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", theme);
  if (high) root.setAttribute("data-contrast", "high");
  else root.removeAttribute("data-contrast");
  write(KEY, theme);
  write(CONTRAST, high ? "high" : "normal");
}

/** First-run hints, dismissed per browser. */
export const hintSeen = (id: string) => read(`cdl-sim:hint:${id}`) === "1";
export const markHintSeen = (id: string) => write(`cdl-sim:hint:${id}`, "1");
