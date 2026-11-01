// Saving layouts edited in the map editor. The layout module picks up saved ones when it
// first loads (see savedLayouts.ts), so replays use them.
import { setLayoutOverride } from "./replay/layouts";
import type { Traced } from "./replay/shapes";
import { LAYOUTS_KEY as KEY, savedOverrides as readAll } from "./savedLayouts";

export { savedOverrides } from "./savedLayouts";

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
