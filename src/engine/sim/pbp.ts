// Play-by-play text from stored events. One line per hill / round / possession beat,
// so the log reads like a broadcast summary; the raw events stay available for "watch".
import type { MapEvent, MapResult, Side } from "./types";

export interface Names {
  team: [string, string];
  /** Handle per lineup index 0-7. */
  player: string[];
}

const killsBetween = (events: MapEvent[], from: number, to: number) => {
  const k = new Map<number, number>();
  for (let i = from; i < to; i++) {
    const e = events[i]!;
    if (e.k === "kill") k.set(e.by, (k.get(e.by) ?? 0) + 1);
  }
  return k;
};

const topFragger = (k: Map<number, number>, side: Side) => {
  let best = -1;
  let n = 0;
  for (const [p, c] of k) if ((p < 4 ? 0 : 1) === side && c > n) [best, n] = [p, c];
  return best >= 0 ? { p: best, n } : null;
};

const clock = (t: number) => `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`;

export interface LogEntry {
  /** Index of the event that closes this line (for syncing with watch mode). */
  i: number;
  text: string;
}

export function mapLog(m: MapResult, names: Names): string[] {
  return mapLogEntries(m, names).map((e) => e.text);
}

export function mapLogEntries(m: MapResult, names: Names): LogEntry[] {
  const T = (s: Side) => names.team[s];
  const P = (i: number) => names.player[i] ?? `#${i}`;
  const lines: LogEntry[] = [];
  let segStart = 0;
  const ev = m.events;
  const push = (i: number, text: string) => lines.push({ i, text });

  ev.forEach((e, i) => {
    switch (e.k) {
      case "hill": {
        const w: Side = e.pts[0] >= e.pts[1] ? 0 : 1;
        const top = topFragger(killsBetween(ev, segStart, i), w);
        const star = top && top.n >= 3 ? ` · ${P(top.p)} ${top.n} kills` : "";
        push(
          i,
          `[${clock(e.t)}] Hill ${e.n} (${e.label}) — ${T(w)} ${e.pts[w]}–${e.pts[w === 0 ? 1 : 0]}${star}  |  ${e.score[0]}–${e.score[1]}`,
        );
        segStart = i + 1;
        break;
      }
      case "round": {
        const parts: string[] = [];
        for (let j = segStart; j < i; j++) {
          const x = ev[j]!;
          if (x.k === "kill" && x.fb) parts.push(`${P(x.by)} first blood`);
          if (x.k === "plant") parts.push(`plant ${x.site} (${P(x.by)})`);
          if (x.k === "defuse") parts.push(`defuse (${P(x.by)})`);
          if (x.k === "clutch") parts.push(`${P(x.by)} 1v${x.vs} clutch`);
          if (x.k === "zone") parts.push(`${x.zone} captured (${P(x.by)})`);
        }
        const how = {
          elim: "elimination", detonate: "detonation", defuse: "defuse", time: "time", capture: "full capture", lives: "lives",
        }[e.how];
        const lives = e.lives ? ` (lives ${e.lives[0]}–${e.lives[1]})` : "";
        push(
          i,
          `[${clock(e.t)}] Round ${e.n} (${T(e.atk)} attack) — ${parts.join(" · ") || "no plant"} → ${T(e.winner)} by ${how}${lives}  |  ${e.score[0]}–${e.score[1]}`,
        );
        segStart = i + 1;
        break;
      }
      case "ocap": {
        // Possession beats since the last capture or half, folded into one line.
        let turnovers = 0;
        for (let j = segStart; j < i; j++) if (ev[j]!.k === "drop") turnovers++;
        const top = topFragger(killsBetween(ev, segStart, i), e.team);
        const star = top && top.n >= 3 ? ` · ${P(top.p)} ${top.n} kills escorting` : "";
        const swing = turnovers ? ` after ${turnovers} turnover${turnovers > 1 ? "s" : ""}` : " on the first possession";
        push(i, `[${clock(e.t)}] CAPTURE — ${P(e.by)} scores for ${T(e.team)}${swing}${star}  |  ${e.score[0]}–${e.score[1]}`);
        segStart = i + 1;
        break;
      }
      case "half":
        push(i, `[${clock(e.t)}] End of half ${e.n}  |  ${e.score[0]}–${e.score[1]}`);
        segStart = i + 1;
        break;
      case "sudden":
        push(i, `[${clock(e.t)}] Tied — sudden death`);
        break;
    }
  });
  return lines;
}
