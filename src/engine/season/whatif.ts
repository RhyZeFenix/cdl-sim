// What if: change one result and see how the rest of the season plays out. Everything
// before the chosen event replays exactly; the event is re-rolled until the chosen team
// wins it (or, with no team, just re-rolled once), and the rest of the season plays on
// from there with the new luck.
import type { SeasonData } from "../data/registry";
import { advance, createSeason, isDone, type SeasonState, type Step } from "./season";

export interface WhatIfSpec {
  /** Index into state.steps of the Major or Champs to change. */
  step: number;
  /** The team that should win that event (omit to re-roll it with no fixed winner). */
  winner?: string;
}

export interface WhatIfResult {
  state?: SeasonState;
  /** How many re-rolls it took for the chosen team to win (1 = first try). */
  tries: number;
  /** Set when the chosen team never won in the allowed tries. */
  failed?: boolean;
}

const MAX_TRIES = 400;

/** Event steps of a season that a what-if can change. */
export function whatIfSteps(state: SeasonState): { index: number; step: Step }[] {
  return state.steps.map((step, index) => ({ index, step })).filter(({ step }) => step.kind === "major" || step.kind === "championship");
}

export function whatIf(state: SeasonState, data: SeasonData, spec: WhatIfSpec): WhatIfResult {
  if (state.gm) throw new Error("What if works on Commissioner seasons (GM decisions can't be replayed).");
  const step = state.steps[spec.step];
  if (!step || (step.kind !== "major" && step.kind !== "championship")) throw new Error("Pick a Major or Champs.");
  // The season up to the event, exactly as it went.
  const base = createSeason(data, { ...state.options, keepAllEvents: false });
  while (base.next < spec.step && !isDone(base) && advance(base, data));
  const snapshot = JSON.stringify(base);
  const root = state.options.seed;
  for (let k = 1; k <= MAX_TRIES; k++) {
    const s = JSON.parse(snapshot) as SeasonState;
    s.options = { ...s.options, seed: `${root}~whatif${k}` };
    advance(s, data);
    const ev = s.events[s.events.length - 1];
    const won = ev && Object.entries(ev.placements).find(([, p]) => p[0] === 1)?.[0];
    if (spec.winner && won !== spec.winner) continue;
    while (!isDone(s) && advance(s, data));
    return { state: s, tries: k };
  }
  return { tries: MAX_TRIES, failed: true };
}
