// In-season growth and the Challengers circuit.
//
// Development: after each Major, your players aged 23 and under improve a little (more
// for the youngest and with a better coach), with some luck either way. It's stored as
// its own adjustment so it never mixes with the off-season progression.
//
// Challengers: after each Major your academy prospects play a Challengers event with
// their Challengers teams. Results come from their ratings with some luck, and a strong
// showing gives them a growth boost.
import type { SeasonData } from "../data/registry";
import { createRng } from "../rng";
import { playerInfo, type SeasonState, type Step } from "../season/season";
import { playerAge } from "./dynasty";
import { pushInbox } from "./inbox";
import { coachFactor } from "./staff";
import { overall } from "./values";

/** Rating points gained per stage at 21 and under, and at 22-23 (before the coach and luck). */
const GROWTH = { youngest: 0.8, young: 0.4 };

export function developDuringSeason(state: SeasonState, data: SeasonData, step: Step, date: string): void {
  const gm = state.gm!;
  if (step.kind !== "major") return;
  const rng = createRng(`${state.options.seed}/dev/${step.stage}/${state.dynasty?.year ?? 1}`);
  const dev = { ...(gm.devAdj ?? {}) };
  const notes: string[] = [];
  for (const id of gm.roster) {
    const age = playerAge(state, id);
    if (age > 23) continue;
    const base = age <= 21 ? GROWTH.youngest : GROWTH.young;
    const gain = Math.round((base * coachFactor(state) + rng.normal(0, 0.3)) * 10) / 10;
    if (gain <= 0) continue;
    dev[id] = Math.round(((dev[id] ?? 0) + gain) * 10) / 10;
    notes.push(`${playerInfo(state, data, id)?.handle ?? id} +${gain.toFixed(1)}`);
  }
  gm.devAdj = dev;
  if (notes.length) pushInbox(state, { date, kind: "staff", title: "Young players are growing", body: `Rating gains this stage: ${notes.join(", ")}.` });
  challengersEvent(state, step.stage, date);
}

export interface ChallengersResult {
  stage: number;
  /** Prospect id → placing (1 = won) out of the field. */
  places: Record<string, number>;
  field: number;
}

/** A Challengers event for your academy prospects: placings, and a growth boost for the best. */
function challengersEvent(state: SeasonState, stage: number, date: string): void {
  const gm = state.gm!;
  const academy = gm.academy ?? [];
  if (!academy.length || !gm.prospects) return;
  const rng = createRng(`${state.options.seed}/challengers/${stage}/${state.dynasty?.year ?? 1}`);
  const FIELD = 16;
  const places: Record<string, number> = {};
  const lines: string[] = [];
  for (const id of academy) {
    const p = gm.prospects[id];
    if (!p) continue;
    // A prospect at 80 overall is a contender; at 65, mid-table. Luck spreads it out.
    const strength = (overall(p.player.ratings) - 72) / 6 + rng.normal(0, 1);
    const place = Math.max(1, Math.min(FIELD, Math.round(FIELD / 2 - strength * 3)));
    places[id] = place;
    const boost = place <= 2 ? 1.2 : place <= 4 ? 0.6 : 0;
    if (boost) {
      const r = p.player.ratings;
      const g = (v: number) => Math.min(99, Math.round((v + boost) * 10) / 10);
      gm.prospects[id] = { ...p, player: { ...p.player, ratings: { ...r, slaying: g(r.slaying), hp_obj: g(r.hp_obj), snd_iq: g(r.snd_iq), third_mode: g(r.third_mode) } } };
    }
    lines.push(`${p.player.handle} (${p.team}): ${place === 1 ? "won it" : ordinalPlace(place)}${boost ? `, +${boost} growth` : ""}`);
  }
  gm.challengers = [...(gm.challengers ?? []), { stage, places, field: FIELD }];
  pushInbox(state, { date, kind: "staff", title: `Challengers Stage ${stage} results`, body: lines.join("; ") + "." });
}

const ordinalPlace = (n: number) => (n <= 2 ? "runner-up" : n <= 4 ? "top 4" : n <= 8 ? "top 8" : `top ${n <= 12 ? 12 : 16}`);
