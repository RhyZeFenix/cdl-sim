// Map editor layouts saved in this browser (localStorage). Kept apart from the layout
// data itself so the main bundle can read them without loading every map.
import type { Traced } from "./replay/shapes";

export const LAYOUTS_KEY = "cdl-sim:layouts";

export function savedOverrides(): Record<string, Traced> {
  try {
    return JSON.parse(localStorage.getItem(LAYOUTS_KEY) ?? "{}") as Record<string, Traced>;
  } catch {
    return {};
  }
}
