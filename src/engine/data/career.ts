// A player's real career across the seasons in the data (2024-2026): teams, ratings,
// K/D, real age, and event-by-event K/D from the CoD Esports Wiki.
import { realEventLines, type RealEventLine } from "./form";
import { SEASON_IDS, loadSeasonData, type SeasonId } from "./registry";
import { ageIn } from "../gm/values";

export interface CareerSeason {
  season: SeasonId;
  label: string;
  /** Teams they were on that season (most recent last). */
  teams: string[];
  ovr?: number;
  maps: number;
  kd?: number;
  age: number;
  events: RealEventLine[];
}

export function playerCareer(id: string): CareerSeason[] {
  const out: CareerSeason[] = [];
  for (const s of SEASON_IDS) {
    const data = loadSeasonData(s);
    const all = [...data.rosters.teams, ...data.rosters.guests];
    const teams = all.filter((t) => t.players.some((p) => p.id === id)).map((t) => t.team);
    const events = realEventLines(s, id);
    if (!teams.length && !events.length) continue;
    const p = all.flatMap((t) => t.players).find((x) => x.id === id);
    const r = p?.ratings;
    const k = events.reduce((n, e) => n + e.kills, 0);
    const d = events.reduce((n, e) => n + e.deaths, 0);
    out.push({
      season: s,
      label: data.season.label,
      teams,
      ovr: r ? Math.round((r.slaying + r.hp_obj + r.snd_iq + r.third_mode) / 4) : undefined,
      maps: events.reduce((n, e) => n + e.maps, 0),
      kd: d ? Math.round((k / d) * 100) / 100 : undefined,
      age: ageIn(id, Number(s)),
      events,
    });
  }
  return out;
}
