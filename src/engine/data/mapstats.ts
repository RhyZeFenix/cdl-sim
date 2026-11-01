// Per-map factors from real results (CoD Esports Wiki PlayerStats, split by winners
// and losers): pace is kills per player per map, and closeness is the losing team's
// share of the winning team's score (Hardpoint hill time, Control captures, SnD kills as
// a rounds proxy). Both are relative to the mode's average across maps, and shrunk
// toward 1 for maps with few games.
import type { Mode } from "./schema";

export interface MapFactor {
  /** Kills per player per map, relative to the mode average. */
  pace: number;
  /** Loser's share of the winner's score, relative to the mode average. */
  close: number;
  games: number;
}

interface Row {
  Map: string;
  Gamemode: string;
  Win: string;
  Rows: string;
  Kills: string;
  HPTime: string;
  OVRCaps: string;
  SDKills: string;
  ConCaptures: string;
}

const MODES: Record<string, Mode> = { Hardpoint: "hp", "Search and Destroy": "snd", Control: "control", Overload: "overload" };
const SCORE: Record<Mode, keyof Row> = { hp: "HPTime", snd: "SDKills", control: "ConCaptures", overload: "OVRCaps" };
/** Games at which a map's own numbers count for half. */
const SHRINK = 30;

export function mapFactors(rows: Row[]): Record<string, MapFactor> {
  const by = new Map<string, { mode: Mode; map: string; w?: Row; l?: Row }>();
  for (const r of rows) {
    const mode = MODES[r.Gamemode];
    if (!mode || /unrecognized/i.test(r.Map)) continue;
    const k = `${mode}:${r.Map}`;
    const e = by.get(k) ?? { mode, map: r.Map };
    if (r.Win === "1") e.w = r;
    else e.l = r;
    by.set(k, e);
  }
  const raw = [...by.entries()]
    .filter(([, e]) => e.w && e.l)
    .map(([k, e]) => {
      const games = Number(e.w!.Rows) / 4;
      const pace = (Number(e.w!.Kills) + Number(e.l!.Kills)) / Math.max(1, Number(e.w!.Rows) + Number(e.l!.Rows));
      const f = SCORE[e.mode];
      const close = Number(e.l![f] || 0) / Math.max(1, Number(e.w![f] || 0));
      return { k, mode: e.mode, games, pace, close };
    });
  const mean = (mode: Mode, f: "pace" | "close") => {
    const xs = raw.filter((x) => x.mode === mode && x[f] > 0);
    const g = xs.reduce((s, x) => s + x.games, 0);
    return g ? xs.reduce((s, x) => s + x[f] * x.games, 0) / g : 1;
  };
  const out: Record<string, MapFactor> = {};
  for (const x of raw) {
    const w = x.games / (x.games + SHRINK);
    const rel = (v: number, m: number) => (v > 0 && m > 0 ? 1 + (v / m - 1) * w : 1);
    out[x.k] = { pace: round(rel(x.pace, mean(x.mode, "pace"))), close: round(rel(x.close, mean(x.mode, "close"))), games: x.games };
  }
  return out;
}

const round = (x: number) => Math.round(x * 1000) / 1000;
