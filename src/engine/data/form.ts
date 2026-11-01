// Real form: each player's K/D at each real event (data/stats/{year}.form.json, from the
// CoD Esports Wiki) against their K/D for the whole season. With "Real form" on, a
// historical season plays every event with the players running as hot or cold as they
// really did. Small samples are shrunk toward no effect.
import form2024 from "../../../data/stats/2024.form.json";
import form2025 from "../../../data/stats/2025.form.json";
import form2026 from "../../../data/stats/2026.form.json";
import type { PoolPhase } from "./pools";
import type { SeasonId } from "./registry";

interface Row {
  PlayerLink: string;
  TournamentPage: string;
  Maps: string;
  Kills: string;
  Deaths: string;
}

const RAW: Record<SeasonId, { rows: Row[] }> = { "2024": form2024, "2025": form2025, "2026": form2026 };

/** Skill units per 1.0 of K/D ratio above the season (a K/D 20% up is +0.03). */
export const REAL_FORM_K = 0.15;
export const REAL_FORM_CAP = 0.04;
/** Maps at which an event's own K/D counts for half. */
const SHRINK = 6;

export const playerKey = (s: string) => s.toLowerCase().replace(/\s*\(.*\)$/, "").replace(/[^a-z0-9]/g, "");

/** The wiki page key for a phase: "major 1/qualifiers", "major 1/minor", "major 1", "championship". */
export function pageKey(phase: PoolPhase): string {
  switch (phase.kind) {
    case "qualifiers":
      return `major ${phase.stage}/qualifiers`;
    case "minor":
      return `major ${phase.stage}/minor`;
    case "major":
      return `major ${phase.stage}`;
    case "championship":
      return "championship";
  }
}

const pageOf = (page: string) => (/Championship/.test(page) ? "championship" : (/Season\/(.+)$/.exec(page)?.[1] ?? page).toLowerCase());

type Table = Map<string, Map<string, number>>;
const cache = new Map<SeasonId, Table>();

function table(id: SeasonId): Table {
  const hit = cache.get(id);
  if (hit) return hit;
  const by = new Map<string, { k: number; d: number; events: Map<string, { maps: number; k: number; d: number }> }>();
  for (const r of RAW[id].rows) {
    const key = playerKey(r.PlayerLink);
    const e = by.get(key) ?? { k: 0, d: 0, events: new Map() };
    const k = Number(r.Kills);
    const d = Number(r.Deaths);
    e.k += k;
    e.d += d;
    const page = pageOf(r.TournamentPage);
    const ev = e.events.get(page) ?? { maps: 0, k: 0, d: 0 };
    e.events.set(page, { maps: ev.maps + Number(r.Maps), k: ev.k + k, d: ev.d + d });
    by.set(key, e);
  }
  const out: Table = new Map();
  for (const [key, e] of by) {
    const season = e.k / Math.max(1, e.d);
    const m = new Map<string, number>();
    for (const [page, ev] of e.events) {
      const ratio = ev.k / Math.max(1, ev.d) / Math.max(0.1, season);
      const w = ev.maps / (ev.maps + SHRINK);
      const f = Math.max(-REAL_FORM_CAP, Math.min(REAL_FORM_CAP, REAL_FORM_K * (ratio - 1) * w));
      m.set(page, Math.round(f * 1000) / 1000);
    }
    out.set(key, m);
  }
  cache.set(id, out);
  return out;
}

/** A player's real form at an event (skill units; 0 when unknown). */
export function realForm(id: SeasonId, playerId: string, phase: PoolPhase): number {
  return table(id).get(playerKey(playerId))?.get(pageKey(phase)) ?? 0;
}

export interface RealEventLine {
  /** "major 1", "major 1/qualifiers", "championship"… */
  event: string;
  maps: number;
  kills: number;
  deaths: number;
}

/** A player's real kills and deaths at every event of a season (empty when unknown). */
export function realEventLines(id: SeasonId, playerId: string): RealEventLine[] {
  const key = playerKey(playerId);
  const acc = new Map<string, RealEventLine>();
  for (const r of RAW[id].rows) {
    if (playerKey(r.PlayerLink) !== key) continue;
    const event = pageOf(r.TournamentPage);
    const e = acc.get(event) ?? { event, maps: 0, kills: 0, deaths: 0 };
    e.maps += Number(r.Maps);
    e.kills += Number(r.Kills);
    e.deaths += Number(r.Deaths);
    acc.set(event, e);
  }
  return [...acc.values()];
}
