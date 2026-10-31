// Display lookups for teams (incl. Pro-Am guests) and players.
import type { SeasonData } from "../engine";

export interface TeamInfo {
  id: string;
  name: string;
  abbr: string;
}

export interface Directory {
  team(id: string): TeamInfo;
  player(id: string): string;
}

const cache = new WeakMap<SeasonData, Directory>();

export function directory(data: SeasonData): Directory {
  const hit = cache.get(data);
  if (hit) return hit;
  const teams = new Map<string, TeamInfo>(data.season.teams.map((t) => [t.id, t]));
  for (const st of data.season.stages) {
    if (st.major.format.type === "proam-gsl") for (const g of st.major.format.guests) teams.set(g.id, g);
  }
  const players = new Map<string, string>();
  for (const t of [...data.rosters.teams, ...data.rosters.guests]) for (const p of t.players) players.set(p.id, p.handle);
  const dir: Directory = {
    team: (id) => teams.get(id) ?? { id, name: id, abbr: id.slice(0, 4).toUpperCase() },
    player: (id) => players.get(id) ?? (id.startsWith("repl-") ? "Replacement" : id),
  };
  cache.set(data, dir);
  return dir;
}
