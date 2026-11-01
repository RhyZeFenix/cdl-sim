// Highlights and commentary for a played map, both read straight off its event log.
// Highlights are the moments worth jumping to (clutches, multi-kills, defuses, Overload
// scores, broken hills); commentary is one short caster line per notable event.
import { other, type MapEvent, type MapResult, type Side } from "./types";

export interface Highlight {
  /** When it happens (the closing event). */
  t: number;
  /** Where a replay of it should start. */
  from: number;
  kind: "clutch" | "multikill" | "defuse" | "score" | "break" | "ace";
  /** The player it's about (lineup index), if any. */
  by?: number;
  title: string;
  weight: number;
}

const MULTI_WINDOW = 10;
const MAX = 10;
/** At most this many of one kind (multi-kills count with aces), so a reel isn't all one thing. */
const PER_KIND = 4;

/** The best moments of a map, in time order. */
export function highlights(map: MapResult, players: string[], teams: [string, string]): Highlight[] {
  const P = (i: number) => players[i] ?? `#${i}`;
  const out: Highlight[] = [];
  const ev = map.events;
  // Multi-kills: 3+ kills by one player within the window (counted once, at the longest run).
  const kills = new Map<number, number[]>();
  for (const e of ev) if (e.k === "kill") kills.set(e.by, [...(kills.get(e.by) ?? []), e.t]);
  for (const [by, ts] of kills) {
    let i = 0;
    while (i < ts.length) {
      let j = i;
      while (j + 1 < ts.length && ts[j + 1]! - ts[i]! <= MULTI_WINDOW) j++;
      const n = j - i + 1;
      if (n >= 3) {
        const secs = Math.max(1, Math.round(ts[j]! - ts[i]!));
        out.push({
          t: ts[j]!,
          from: Math.max(0, ts[i]! - 3),
          kind: n >= 4 ? "ace" : "multikill",
          by,
          title: `${P(by)}: ${n === 3 ? "triple" : n === 4 ? "quad" : `${n}-kill`} in ${secs}s`,
          weight: 1.5 * n,
        });
        i = j + 1;
      } else i++;
    }
  }
  let lastHold: { hill: number; team: Side } | null = null;
  for (const e of ev) {
    switch (e.k) {
      case "clutch":
        out.push({ t: e.t, from: Math.max(0, e.t - 12), kind: "clutch", by: e.by, title: `${P(e.by)} clutches a 1v${e.vs}`, weight: 2.5 * e.vs });
        break;
      case "defuse":
        out.push({ t: e.t, from: Math.max(0, e.t - 10), kind: "defuse", by: e.by, title: `${P(e.by)} defuses`, weight: 3 });
        break;
      case "ocap":
        out.push({ t: e.t, from: Math.max(0, e.t - 10), kind: "score", by: e.by, title: `${P(e.by)} scores for ${teams[e.team]}`, weight: 2 });
        break;
      case "hold":
        // A hill taken straight off the other team (a hold event lands when the hold ends,
        // so the break itself is `secs` earlier).
        if (lastHold && lastHold.hill === e.hill && lastHold.team !== e.team && e.secs >= 10) {
          const at = e.t - e.secs;
          out.push({ t: at, from: Math.max(0, at - 10), kind: "break", title: `${teams[e.team]} break the hill`, weight: 1 + e.secs / 20 });
        }
        lastHold = { hill: e.hill, team: e.team };
        break;
      case "hill":
        lastHold = null;
        break;
    }
  }
  const ranked = out.sort((a, b) => b.weight - a.weight);
  const kindOf = (h: Highlight) => (h.kind === "ace" ? "multikill" : h.kind);
  const count = new Map<string, number>();
  const picked: Highlight[] = [];
  for (const h of ranked) {
    if (picked.length >= MAX) break;
    const n = count.get(kindOf(h)) ?? 0;
    if (n >= PER_KIND) continue;
    count.set(kindOf(h), n + 1);
    picked.push(h);
  }
  // Short of other kinds: top up with the best of the rest.
  for (const h of ranked) if (picked.length < MAX && !picked.includes(h)) picked.push(h);
  return picked.sort((a, b) => a.t - b.t);
}

export interface Caption {
  t: number;
  text: string;
}

/** A stable pick from a few phrasings, so the same map always reads the same. */
const pick = (opts: string[], n: number) => opts[Math.abs(n) % opts.length]!;

/** Caster lines for a map. */
export function commentary(map: MapResult, players: string[], teams: [string, string]): Caption[] {
  const P = (i: number) => players[i] ?? `#${i}`;
  const T = (s: Side) => teams[s];
  const out: Caption[] = [];
  const toWin = map.mode === "snd" ? 6 : map.mode === "control" ? 3 : 0;
  const hl = highlights(map, players, teams);
  const multi = new Map(hl.filter((h) => h.kind === "multikill" || h.kind === "ace").map((h) => [h.t, h]));
  for (const h of hl) if (h.kind === "break") out.push({ t: h.t, text: `${h.title.replace(" break the hill", "")} break the hill and take it off ${h.title.startsWith(teams[0]) ? teams[1] : teams[0]}!` });
  let n = 0;
  for (const e of map.events as MapEvent[]) {
    n++;
    const h = multi.get(e.t);
    if (h && e.k === "kill" && e.by === h.by) {
      out.push({ t: e.t, text: pick([`${h.title}! What a run.`, `${h.title} — that's a highlight.`, `Unreal from ${P(e.by)}: ${h.title.split(": ")[1]}.`], n) });
      continue;
    }
    switch (e.k) {
      case "kill":
        if (e.fb && map.mode !== "snd") break;
        if (e.fb) out.push({ t: e.t, text: pick([`First blood ${P(e.by)}.`, `${P(e.by)} opens it up on ${P(e.on)}.`, `${P(e.by)} gets the pick early.`], n) });
        break;
      case "plant":
        out.push({ t: e.t, text: pick([`Bomb's down on ${e.site}.`, `${P(e.by)} gets the plant on ${e.site}.`, `Plant on ${e.site} — now hold it.`], n) });
        break;
      case "defuse":
        out.push({ t: e.t, text: pick([`${P(e.by)} gets the defuse!`, `Defused! ${P(e.by)} saves the round.`], n) });
        break;
      case "clutch":
        out.push({ t: e.t, text: pick([`${P(e.by)} in the 1v${e.vs}… and gets it done!`, `Clutch! ${P(e.by)} wins the 1v${e.vs}.`], n) });
        break;
      case "hill": {
        const lead = e.score[0] === e.score[1] ? null : e.score[0] > e.score[1] ? 0 : 1;
        out.push({ t: e.t, text: lead === null ? `Hill ${e.n} done, dead level at ${e.score[0]}.` : `Hill ${e.n} done: ${T(lead)} up ${Math.max(...e.score)}–${Math.min(...e.score)}.` });
        break;
      }
      case "round": {
        const [a, b] = e.score;
        const point = toWin && (a === toWin - 1 || b === toWin - 1) && a !== b;
        const how = e.how === "detonate" ? "on the detonation" : e.how === "defuse" ? "on the defuse" : e.how === "time" ? "on time" : "";
        out.push({ t: e.t, text: `${T(e.winner)} take round ${e.n}${how ? ` ${how}` : ""}: ${a}–${b}.${point ? ` Map point ${T(a > b ? 0 : 1)}.` : ""}` });
        break;
      }
      case "ocap":
        out.push({ t: e.t, text: pick([`${P(e.by)} scores! ${e.score[0]}–${e.score[1]}.`, `Device in — ${T(e.team)} make it ${e.score[e.team]}.`], n) });
        break;
      case "half":
        out.push({ t: e.t, text: `End of the half: ${e.score[0]}–${e.score[1]}.` });
        break;
      case "sudden":
        out.push({ t: e.t, text: "Sudden death! One round for the map." });
        break;
      case "zone":
        out.push({ t: e.t, text: `${T(e.team)} take ${e.zone}, ${T(other(e.team))} need a response.` });
        break;
    }
  }
  return out.sort((a, b) => a.t - b.t);
}

export interface RoundChip {
  n: number;
  /** When the round started and ended (game seconds). */
  from: number;
  t: number;
  winner: Side;
  how: Extract<MapEvent, { k: "round" }>["how"];
  score: [number, number];
  site?: "A" | "B";
  /** A clutch won this round: who and against how many. */
  clutch?: { by: number; vs: number };
}

/** Round-by-round summary for SnD and Control maps. */
export function roundStrip(map: MapResult): RoundChip[] {
  const out: RoundChip[] = [];
  let from = 0;
  let site: "A" | "B" | undefined;
  let clutch: RoundChip["clutch"];
  for (const e of map.events) {
    if (e.k === "plant") site = e.site;
    else if (e.k === "clutch") clutch = { by: e.by, vs: e.vs };
    else if (e.k === "round") {
      out.push({ n: e.n, from, t: e.t, winner: e.winner, how: e.how, score: [e.score[0], e.score[1]], site, clutch });
      from = e.t;
      site = undefined;
      clutch = undefined;
    }
  }
  return out;
}

/**
 * A few sentences on how a series went: the result, any comeback, the deciding map,
 * the series' best player and its best moment.
 */
export function seriesRecap(maps: MapResult[], teams: [string, string], handle: (lineupIndex: number, map: MapResult) => string): string {
  if (!maps.length) return "";
  const wins: [number, number] = [0, 0];
  let worst: [number, number] = [0, 0];
  for (const m of maps) {
    wins[m.winner]++;
    if (wins[0] - wins[1] < worst[0]) worst = [wins[0] - wins[1], worst[1]];
    if (wins[1] - wins[0] < worst[1]) worst = [worst[0], wins[1] - wins[0]];
  }
  const w: Side = wins[0] > wins[1] ? 0 : 1;
  const l = other(w);
  const score = `${Math.max(...wins)}–${Math.min(...wins)}`;
  const mapName = (m: MapResult) => `${m.map} ${m.mode === "hp" ? "Hardpoint" : m.mode === "snd" ? "SnD" : m.mode === "control" ? "Control" : "Overload"}`;
  const mapScore = (m: MapResult) => `${Math.max(...m.score)}–${Math.min(...m.score)}`;
  const parts: string[] = [];
  const down = -worst[w];
  if (down >= 2) parts.push(`${teams[w]} came back from ${down} maps down to beat ${teams[l]} ${score}.`);
  else if (wins[l] === 0) parts.push(`${teams[w]} swept ${teams[l]} ${score}.`);
  else parts.push(`${teams[w]} beat ${teams[l]} ${score}.`);
  const last = maps[maps.length - 1]!;
  if (wins[l] === Math.max(...wins) - 1 && maps.length > 1) parts.push(`It went the distance: ${teams[w]} took ${mapName(last)} ${mapScore(last)} to close it.`);
  // Best K/D over the series among players with every map, by name.
  const acc = new Map<string, { k: number; d: number; n: number }>();
  for (const m of maps)
    m.lineup.forEach((_, i) => {
      const name = handle(i, m);
      const e = acc.get(name) ?? { k: 0, d: 0, n: 0 };
      e.k += m.box[i]!.kills;
      e.d += m.box[i]!.deaths;
      e.n++;
      acc.set(name, e);
    });
  const best = [...acc.entries()].filter(([, e]) => e.n === maps.length).sort((a, b) => b[1].k / Math.max(1, b[1].d) - a[1].k / Math.max(1, a[1].d))[0];
  if (best) parts.push(`${best[0]} led the series at ${(best[1].k / Math.max(1, best[1].d)).toFixed(2)} K/D (${best[1].k}–${best[1].d}).`);
  // The single best moment across the maps.
  let top: { h: Highlight; m: MapResult } | null = null;
  for (const m of maps) {
    const names = m.lineup.map((_, i) => handle(i, m));
    for (const h of highlights(m, names, teams)) if (!top || h.weight > top.h.weight) top = { h, m };
  }
  if (top) parts.push(`Moment of the series: ${top.h.title} on ${mapName(top.m)}.`);
  return parts.join(" ");
}
