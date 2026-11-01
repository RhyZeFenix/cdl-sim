// Layouts edited in the map editor, kept in this browser (localStorage) and applied
// on load so replays use them.
import { setLayoutOverride } from "./replay/layouts";
import type { Traced } from "./replay/shapes";

const KEY = "cdl-sim:layouts";

function readAll(): Record<string, Traced> {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "{}") as Record<string, Traced>;
  } catch {
    return {};
  }
}

/** Applies every saved edit (call once at startup). */
export function loadLayoutOverrides(): void {
  for (const [map, t] of Object.entries(readAll())) setLayoutOverride(map, t);
}

export function savedOverrides(): Record<string, Traced> {
  return readAll();
}

/** Saves (or clears, with null) the edited layout for a map, and applies it now. */
export function saveLayoutOverride(map: string, t: Traced | null): void {
  const all = readAll();
  if (t) all[map] = t;
  else delete all[map];
  try {
    localStorage.setItem(KEY, JSON.stringify(all));
  } catch {
    /* storage full or blocked: the edit still applies for this session */
  }
  setLayoutOverride(map, t);
}
