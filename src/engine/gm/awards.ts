// End-of-season awards: MVP, Rookie of the Year, Champs MVP and two All-CDL teams.
// Award winners gain reputation (they ask for more money), and your own winners get a
// morale lift.
import { loadSeasonData, type SeasonData, type SeasonId } from "../data/registry";
import { summarize, type SeasonState } from "../season/season";
import { pushInbox } from "./inbox";
import { addMorale } from "./morale";
import type { SeasonAwards } from "./types";

export interface AwardLine {
  player: string;
  team: string;
  maps: number;
  kd: number;
  winRate: number;
  score: number;
}

/** Every player's season, scored on K/D and map win rate (min. half the busiest player's maps). */
export function awardLines(state: SeasonState): AwardLine[] {
  const acc = new Map<string, { team: string; maps: number; kills: number; deaths: number; wins: number }>();
  for (const r of Object.values(state.series)) {
    for (const m of r.maps) {
      m.lineup.forEach((id, i) => {
        if (id.startsWith("repl-")) return;
        const side = i < 4 ? 0 : 1;
        const a = acc.get(id) ?? { team: r.teams[side], maps: 0, kills: 0, deaths: 0, wins: 0 };
        a.team = r.teams[side];
        a.maps++;
        a.kills += m.box[i]!.kills;
        a.deaths += m.box[i]!.deaths;
        if (m.winner === side) a.wins++;
        acc.set(id, a);
      });
    }
  }
  const most = Math.max(0, ...[...acc.values()].map((a) => a.maps));
  return [...acc.entries()]
    .filter(([, a]) => a.maps >= most / 2)
    .map(([player, a]) => {
      const kd = a.kills / Math.max(1, a.deaths);
      const winRate = a.wins / a.maps;
      return { player, team: a.team, maps: a.maps, kd, winRate, score: kd * 0.7 + winRate * 0.6 };
    })
    .sort((a, b) => b.score - a.score);
}

const PREV: Partial<Record<SeasonId, SeasonId>> = { "2025": "2024", "2026": "2025" };

/** Rookies: academy graduates, and players with no data in the previous real season. */
function isRookie(state: SeasonState, id: string): boolean {
  if (id.startsWith("pro-")) return true;
  if (state.ratingAdj) return false; // past the real seasons, only academy players are new
  const prev = PREV[state.seasonId];
  if (!prev) return false;
  const p = loadSeasonData(prev);
  return ![...p.rosters.teams, ...p.rosters.guests].some((t) => t.players.some((x) => x.id === id));
}

export function computeAwards(state: SeasonState, data: SeasonData): SeasonAwards {
  const lines = awardLines(state);
  return {
    mvp: lines[0]?.player,
    rookie: lines.find((l) => isRookie(state, l.player))?.player,
    champsMvp: summarize(state, data).mvp?.player,
    allCdl: [lines.slice(0, 4).map((l) => l.player), lines.slice(4, 8).map((l) => l.player)],
  };
}

/** After Champs: hand out awards, raise reputations, and tell the GM. */
export function awardSeason(state: SeasonState, data: SeasonData, refs: string[], name: (id: string) => string): void {
  const a = computeAwards(state, data);
  state.awards = a;
  const rep = { ...(state.reputation ?? {}) };
  const bump = (id: string | undefined, f: number) => {
    if (id) rep[id] = Math.max(rep[id] ?? 1, f);
  };
  bump(a.mvp, 1.2);
  a.allCdl[0].forEach((id) => bump(id, 1.1));
  a.allCdl[1].forEach((id) => bump(id, 1.05));
  bump(a.rookie, 1.05);
  bump(a.champsMvp, 1.1);
  state.reputation = rep;

  const gm = state.gm;
  if (gm) {
    const mine = gm.roster.filter((id) => id === a.mvp || id === a.rookie || id === a.champsMvp || a.allCdl.flat().includes(id));
    if (mine.length) addMorale(state, { refs, why: "Awards", deltas: Object.fromEntries(mine.map((id) => [id, 8])) });
    pushInbox(state, {
      date: data.season.championship.end,
      kind: "award",
      title: "Season awards",
      body:
        `MVP: ${a.mvp ? name(a.mvp) : "—"}. Rookie of the Year: ${a.rookie ? name(a.rookie) : "—"}. Champs MVP: ${a.champsMvp ? name(a.champsMvp) : "—"}. ` +
        `All-CDL first team: ${a.allCdl[0].map(name).join(", ")}. Second team: ${a.allCdl[1].map(name).join(", ")}.` +
        (mine.length ? ` Your winners: ${mine.map(name).join(", ")}.` : ""),
      refs,
    });
  }
}
