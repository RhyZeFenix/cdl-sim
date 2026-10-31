// Team chemistry and role balance for the GM lineup. Chemistry grows with every map
// a pair of players plays together (real teammates start with some), so roster churn
// costs a little; a lineup missing an AR or an SMG player costs a little too.
import type { SeasonData } from "../data/registry";
import { playerInfo, type SeasonState, type SeriesRecord } from "../season/season";

export const pairKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);
/** Maps a pair needs together for full chemistry. */
export const FULL_CHEMISTRY_MAPS = 50;
/** Real teammates start as if they'd played this many maps together. */
export const TEAMMATE_START = 30;

const pairs = (ids: string[]) => ids.flatMap((a, i) => ids.slice(i + 1).map((b) => pairKey(a, b)));

/** Chemistry of a lineup, 0-100: the average over its six pairs. */
export function chemistryOf(state: SeasonState, ids: string[]): number {
  const t = state.gm?.together ?? {};
  const ps = pairs(ids);
  if (!ps.length) return 0;
  return Math.round(ps.reduce((s, k) => s + Math.min(100, (100 * (t[k] ?? 0)) / FULL_CHEMISTRY_MAPS), 0) / ps.length);
}

/** −0.01 at zero chemistry up to +0.01 at full. */
export const chemistryForm = (c: number) => ((c - 50) / 50) * 0.01;

/** Real teammates on the GM's starting roster begin with some chemistry. */
export function initialTogether(ids: string[]): Record<string, number> {
  return Object.fromEntries(pairs(ids).map((k) => [k, TEAMMATE_START]));
}

/** Counts the maps each GM pair played together in a series. */
export function addTogether(state: SeasonState, rec: SeriesRecord): void {
  const gm = state.gm!;
  const side = rec.teams[0] === gm.team ? 0 : 1;
  const t = { ...(gm.together ?? {}) };
  for (const m of rec.maps) for (const k of pairs(m.lineup.slice(side * 4, side * 4 + 4))) t[k] = (t[k] ?? 0) + 1;
  gm.together = t;
}

export const ROLE_PENALTY = 0.012;

export interface RoleBalance {
  ar: number;
  smg: number;
  flex: number;
  ok: boolean;
  /** What's missing, if anything. */
  note?: string;
}

/** A lineup needs someone on an AR and someone on an SMG (flex players can cover either). */
export function roleBalance(state: SeasonState, data: SeasonData, ids: string[]): RoleBalance {
  const roles = ids.map((id) => playerInfo(state, data, id)?.role ?? "flex");
  const ar = roles.filter((r) => r === "AR").length;
  const smg = roles.filter((r) => r === "SMG").length;
  const flex = roles.filter((r) => r === "flex").length;
  const needAr = ar === 0;
  const needSmg = smg === 0;
  // One flex can cover one missing role.
  const ok = (needAr ? 1 : 0) + (needSmg ? 1 : 0) <= flex;
  return { ar, smg, flex, ok, note: ok ? undefined : needAr && needSmg ? "No AR or SMG players" : needAr ? "No AR player" : "No SMG player" };
}
