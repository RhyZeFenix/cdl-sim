// A full series: veto, then maps in order until someone clinches.
import type { MapPool, Mode, Season, VetoProcedure } from "../data/schema";
import { startersOn, type SeasonData } from "../data/registry";
import type { Rng } from "../rng";
import { createArena } from "./arena";
import { boxScore } from "./boxscore";
import { playControl } from "./modes/control";
import { playHardpoint } from "./modes/hardpoint";
import { playOverload } from "./modes/overload";
import { playSnd } from "./modes/snd";
import { other, type MapResult, type Pair, type Side, type SimTeam } from "./types";
import { aiChooser, runVeto, type Chooser, type VetoMap, type VetoResult } from "./veto";

export interface SeriesResult {
  bestOf: 5 | 7 | 9;
  teams: [string, string];
  veto: VetoResult;
  maps: MapResult[];
  score: Pair;
  winner: Side;
}

/** Who attacks first on a round-based map, from the veto side pick. */
function firstAttacker(vm: VetoMap, rng: Rng): Side {
  if (!vm.side) return rng.chance(0.5) ? 0 : 1;
  return vm.side.choice === "attack" ? vm.side.team : other(vm.side.team);
}

export function simulateMap(opts: {
  teams: [SimTeam, SimTeam];
  season: Season;
  vm: VetoMap;
  rng: Rng;
}): MapResult {
  const { teams, season, vm, rng } = opts;
  const arena = createArena(rng, teams, vm.mode, vm.map);
  const s = season.modeSettings;
  let score: Pair;
  const mode: Mode = vm.mode;
  switch (mode) {
    case "hp":
      score = playHardpoint(arena, s.hp);
      break;
    case "snd":
      score = playSnd(arena, s.snd, firstAttacker(vm, rng));
      break;
    case "control":
      if (!s.control) throw new Error(`${season.id} has no Control settings`);
      score = playControl(arena, s.control, firstAttacker(vm, rng));
      break;
    case "overload":
      if (!s.overload) throw new Error(`${season.id} has no Overload settings`);
      score = playOverload(arena, s.overload);
      break;
  }
  if (score[0] === score[1]) throw new Error(`${mode} map ended tied ${score[0]}-${score[1]}`);
  return {
    slot: vm.slot,
    mode,
    map: vm.map,
    score,
    winner: score[0] > score[1] ? 0 : 1,
    durationSec: Math.round(arena.t),
    lineup: arena.players.map((p) => p.id),
    events: arena.events,
    box: boxScore(arena.events),
  };
}

/**
 * The AI veto choosers and the AI's Team A/B choice for a series. Shared by the
 * simulation and the interactive GM veto so both see the same opponent decisions.
 */
export function seriesVetoSetup(teams: [SimTeam, SimTeam], rng: Rng): { ai: [Chooser, Chooser]; aiTeamA: Side } {
  const vetoRng = rng.fork("veto");
  return {
    ai: [aiChooser(teams, 0, vetoRng.fork("ai0")), aiChooser(teams, 1, vetoRng.fork("ai1"))],
    aiTeamA: vetoRng.chance(0.5) ? 0 : 1,
  };
}

export function simulateSeries(opts: {
  teams: [SimTeam, SimTeam];
  bestOf: 5 | 7 | 9;
  season: Season;
  veto: { bo5: VetoProcedure; bo7: VetoProcedure; bo9: VetoProcedure };
  pool: MapPool;
  rng: Rng;
  /** Override either team's veto decisions (GM mode). */
  choosers?: [Chooser?, Chooser?];
  /** Which side acts as veto Team A. The higher seed (side 0) chooses; AI picks at random. */
  teamA?: Side;
  /**
   * Teams for each map (sub swaps). Defaults to `teams`. Gets the series so far, so a
   * caller can decide lineups between maps.
   */
  teamsForMap?: (vm: VetoMap, sofar: { score: Pair; maps: MapResult[] }) => [SimTeam, SimTeam];
}): SeriesResult {
  const { teams, bestOf, season, pool, rng } = opts;
  const setup = seriesVetoSetup(teams, rng);
  const choosers: [Chooser, Chooser] = [opts.choosers?.[0] ?? setup.ai[0], opts.choosers?.[1] ?? setup.ai[1]];
  const teamA = opts.teamA ?? setup.aiTeamA;
  const veto = runVeto({ proc: opts.veto[`bo${bestOf}`], season, pool, teamA, choosers });

  const need = (bestOf + 1) / 2;
  const score: Pair = [0, 0];
  const maps: MapResult[] = [];
  for (const vm of veto.maps) {
    if (score[0] === need || score[1] === need) break;
    const mapTeams = opts.teamsForMap?.(vm, { score: [score[0], score[1]], maps: [...maps] }) ?? teams;
    const m = simulateMap({ teams: mapTeams, season, vm, rng: rng.fork(`map${vm.slot}`) });
    score[m.winner]++;
    maps.push(m);
  }
  return {
    bestOf,
    teams: [teams[0].id, teams[1].id],
    veto,
    maps,
    score,
    winner: score[0] > score[1] ? 0 : 1,
  };
}

/** Builds a team's starting four for a date from season data. */
export function buildSimTeam(data: SeasonData, teamId: string, date: string): SimTeam {
  const roster = [...data.rosters.teams, ...data.rosters.guests].find((t) => t.team === teamId);
  if (!roster) throw new Error(`${data.season.id}: no roster for ${teamId}`);
  const starters = startersOn(data.rosters, teamId, date);
  const info =
    data.season.teams.find((t) => t.id === teamId) ??
    data.season.stages
      .flatMap((s) => (s.major.format.type === "proam-gsl" ? s.major.format.guests : []))
      .find((g) => g.id === teamId);
  if (!info) throw new Error(`${data.season.id}: unknown team ${teamId}`);
  return {
    id: teamId,
    name: info.name,
    abbr: info.abbr,
    mapMods: roster.mapMods,
    players: starters.map((id) => {
      const p = roster.players.find((x) => x.id === id);
      if (!p) throw new Error(`${teamId}: starter ${id} missing from players`);
      return { id: p.id, handle: p.handle, ratings: p.ratings };
    }),
  };
}
