// Made-up names for generated people (staff and Challengers prospects). Seeded, so a
// season always produces the same names.
import type { Rng } from "../rng";

const FIRST = ["Alex", "Jordan", "Sam", "Chris", "Taylor", "Morgan", "Casey", "Riley", "Jamie", "Drew", "Avery", "Quinn", "Reese", "Rowan", "Parker", "Blake"];
const LAST = ["Hart", "Vance", "Reyes", "Okafor", "Lindqvist", "Moreau", "Tanaka", "Brooks", "Calder", "Novak", "Ibarra", "Whitfield", "Sato", "Kerr", "Duval", "Mercer"];
const HANDLE_A = ["Vex", "Kryo", "Zen", "Nox", "Rift", "Hex", "Blitz", "Volt", "Jinx", "Echo", "Flux", "Ryze", "Skye", "Drift", "Pyro", "Nova", "Lux", "Grim", "Tide", "Onyx"];
const HANDLE_B = ["", "", "", "x", "z", "o", "y", "er", "ix", "ic", "um", "ah"];

export const personName = (rng: Rng) => `${rng.pick(FIRST)} ${rng.pick(LAST)}`;

export function handle(rng: Rng, taken: Set<string>): string {
  for (let i = 0; i < 50; i++) {
    const h = rng.pick(HANDLE_A) + rng.pick(HANDLE_B) + (i > 10 ? String(rng.int(1, 99)) : "");
    if (!taken.has(h.toLowerCase())) {
      taken.add(h.toLowerCase());
      return h;
    }
  }
  return `Prospect${rng.int(100, 999)}`;
}
