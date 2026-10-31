// The Challengers academy: a seeded pool of generated prospects each season. Sign up
// to three to your academy; they develop every step (faster with a better coach) and
// can be promoted to the main roster, where they play like anyone else. Potential is
// only a rough range unless you have a good analyst.
import type { Player, Ratings } from "../data/schema";
import { createRng } from "../rng";
import { GM_ROSTER_MAX, gmCanMakeMoves, type SeasonState } from "../season/season";
import { pushInbox } from "./inbox";
import { handle } from "./names";
import { analystLevel, coachFactor, STAFF_BUDGET, staffPayroll } from "./staff";
import type { Prospect } from "./types";
import { askingSalary, overall } from "./values";

export const ACADEMY_MAX = 3;
export const ACADEMY_SALARY = 15;

const CHALLENGERS = ["Kingdom", "Cosmic", "Nexus", "Rival", "Elevate", "Wolves", "Revenge", "Hydra", "Vortex", "Supremacy"];
const ROLES = ["AR", "SMG", "flex"] as const;

/** The season's prospect pool: twelve generated players aged 17-20. */
export function prospectPool(state: SeasonState, taken: Set<string>): Record<string, Prospect> {
  const year = state.dynasty?.year ?? 1;
  const rng = createRng(`${state.options.seed}/prospects/${year}`);
  const out: Record<string, Prospect> = {};
  for (let i = 0; i < 12; i++) {
    const base = rng.int(62, 75);
    const r = (sd: number) => Math.max(50, Math.min(85, base + rng.int(-sd, sd)));
    const ratings: Ratings = { slaying: r(4), hp_obj: r(4), snd_iq: r(4), third_mode: r(4), clutch: r(6), consistency: rng.int(55, 72) };
    const id = `pro-${year}-${i}`;
    const player: Player = { id, handle: handle(rng, taken), role: rng.pick(ROLES), ratings, ratingSource: "placeholder" };
    out[id] = { player, potential: Math.round(overall(ratings) + rng.int(4, 18)), age: rng.int(17, 20), team: `${rng.pick(CHALLENGERS)} Challengers` };
  }
  return out;
}

/** What the GM sees of a prospect's potential: exact with a 3+ star analyst, else a range. */
export function potentialRange(state: SeasonState, p: Prospect): [number, number] {
  const level = analystLevel(state);
  if (level >= 3) return [p.potential, p.potential];
  const spread = level >= 1 ? 4 : 7;
  const shift = createRng(`pot:${p.player.id}`).int(-2, 2);
  return [p.potential - spread + shift, p.potential + spread + shift];
}

export const academyPayroll = (state: SeasonState) => (state.gm?.academy?.length ?? 0) * ACADEMY_SALARY;

export function gmSignProspect(state: SeasonState, id: string): void {
  const gm = state.gm;
  if (!gm) throw new Error("not in GM mode");
  if (!gmCanMakeMoves(state)) throw new Error("Academy signings happen before the season and between stages.");
  if (!gm.prospects?.[id]) throw new Error("No such prospect.");
  if ((gm.academy ?? []).includes(id)) throw new Error("Already in your academy.");
  if ((gm.academy?.length ?? 0) >= ACADEMY_MAX) throw new Error(`The academy holds ${ACADEMY_MAX} players.`);
  if (staffPayroll(state) + academyPayroll(state) + ACADEMY_SALARY > STAFF_BUDGET) throw new Error("No room in the staff budget.");
  gm.academy = [...(gm.academy ?? []), id];
}

export function gmReleaseProspect(state: SeasonState, id: string): void {
  const gm = state.gm;
  if (!gm) throw new Error("not in GM mode");
  gm.academy = (gm.academy ?? []).filter((x) => x !== id);
}

/** Moves an academy player onto the main roster on a two-year minimum deal. */
export function gmPromoteProspect(state: SeasonState, id: string): void {
  const gm = state.gm;
  if (!gm) throw new Error("not in GM mode");
  if (!gmCanMakeMoves(state)) throw new Error("Promotions happen before the season and between stages.");
  if (!(gm.academy ?? []).includes(id)) throw new Error("Only academy players can be promoted.");
  if (gm.roster.length >= GM_ROSTER_MAX) throw new Error(`The roster is full (${GM_ROSTER_MAX}).`);
  const p = gm.prospects![id]!;
  state.carried = { ...(state.carried ?? {}), [id]: p.player };
  gm.roster = [...gm.roster, id];
  gm.contracts = { ...(gm.contracts ?? {}), [id]: { salary: askingSalary(overall(p.player.ratings)), years: 2 } };
  gm.morale = { ...(gm.morale ?? {}), [id]: 80 };
  gm.academy = gm.academy!.filter((x) => x !== id);
  pushInbox(state, { date: "", kind: "academy", title: `${p.player.handle} promoted`, body: `Up from the academy at ${Math.round(overall(p.player.ratings))} overall, aged ${p.age}.` });
}

/** Each step every prospect grows toward their potential; academy players twice as fast. */
export function developProspects(state: SeasonState): void {
  const gm = state.gm!;
  if (!gm.prospects) return;
  const academy = new Set(gm.academy ?? []);
  const out: Record<string, Prospect> = {};
  for (const [id, p] of Object.entries(gm.prospects)) {
    const rate = (academy.has(id) ? 0.06 * coachFactor(state) : 0.025);
    const gain = Math.max(0, (p.potential - overall(p.player.ratings)) * rate);
    const r = p.player.ratings;
    const g = (v: number) => Math.min(99, v + gain);
    out[id] = { ...p, player: { ...p.player, ratings: { ...r, slaying: g(r.slaying), hp_obj: g(r.hp_obj), snd_iq: g(r.snd_iq), third_mode: g(r.third_mode), clutch: g(r.clutch) } } };
  }
  gm.prospects = out;
}
