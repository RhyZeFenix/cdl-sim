// Executes a data-driven veto procedure (data/veto.json). Each team's decisions go
// through a Chooser: the AI by default, or the user's UI in GM mode.
import type { MapPool, Mode, Season, SlotMode, VetoProcedure } from "../data/schema";
import type { Rng } from "../rng";
import { TUNING } from "./tuning";
import { other, type Side, type SimTeam } from "./types";

export interface VetoRequest {
  action: "ban" | "pick" | "side";
  team: Side;
  mode: Mode;
  /** Map slot being picked or sided (1-based); absent for bans. */
  slot?: number;
  /** For side choices: the map being played. */
  mapName?: string;
  options: string[];
}
export type Chooser = (req: VetoRequest) => string;

export type VetoRecord =
  | { action: "ban"; team: Side; mode: Mode; map: string }
  | { action: "skip-ban"; team: Side; mode: Mode }
  | { action: "pick"; team: Side; mode: Mode; map: string; slot: number }
  | { action: "remaining"; mode: Mode; map: string; slot: number }
  | { action: "side"; team: Side; slot: number; side: string };

export interface VetoMap {
  slot: number;
  mode: Mode;
  map: string;
  side?: { team: Side; choice: string };
}

export interface VetoResult {
  /** Which series side acted as veto Team A. */
  teamA: Side;
  records: VetoRecord[];
  /** Every slot of the format, in order (later ones may go unplayed). */
  maps: VetoMap[];
}

export const sideOptions = (mode: Mode) =>
  mode === "snd" || mode === "control" ? ["attack", "defense"] : ["spawn 1", "spawn 2"];

export interface VetoSetup {
  proc: VetoProcedure;
  season: Season;
  pool: MapPool;
  teamA: Side;
}

/**
 * The veto as a generator: yields each decision and receives the answer. Records are
 * appended to `records` as they happen so an interactive UI can show progress.
 */
function* vetoSteps(opts: VetoSetup, records: VetoRecord[]): Generator<VetoRequest, VetoResult, string> {
  const { proc, season, pool, teamA } = opts;
  const order: SlotMode[] = season.seriesFormats[`bo${proc.bestOf}` as "bo5" | "bo7" | "bo9"];
  const modeOf = (slot: SlotMode): Mode => (slot === "third" ? season.thirdMode : slot);
  const remaining: Record<SlotMode, string[]> = { hp: [...pool.hp], snd: [...pool.snd], third: [...pool.third] };
  const assigned = new Map<number, VetoMap>();
  const who = (t: "A" | "B"): Side => (t === "A" ? teamA : other(teamA));
  const stillNeeded = (m: SlotMode) => order.filter((s, i) => s === m && !assigned.has(i + 1)).length;

  for (const step of proc.steps) {
    switch (step.action) {
      case "ban": {
        const team = who(step.team);
        const mode = modeOf(step.mode);
        if (proc.skipBanIfInsufficient && remaining[step.mode].length - 1 < stillNeeded(step.mode)) {
          records.push({ action: "skip-ban", team, mode });
          break;
        }
        const map = yield { action: "ban", team, mode, options: [...remaining[step.mode]] };
        remaining[step.mode] = remaining[step.mode].filter((m) => m !== map);
        records.push({ action: "ban", team, mode, map });
        break;
      }
      case "pick": {
        const team = who(step.team);
        const mode = modeOf(step.mode);
        const opts = remaining[step.mode];
        if (opts.length === 0) throw new Error(`veto: no ${mode} maps left for map ${step.map}`);
        const map = yield { action: "pick", team, mode, slot: step.map, options: [...opts] };
        remaining[step.mode] = opts.filter((m) => m !== map);
        assigned.set(step.map, { slot: step.map, mode, map });
        records.push({ action: "pick", team, mode, map, slot: step.map });
        break;
      }
      case "remaining": {
        const mode = modeOf(step.mode);
        const opts = remaining[step.mode];
        if (opts.length !== 1) throw new Error(`veto: expected 1 ${mode} map left for map ${step.map}, have ${opts.length}`);
        const map = opts[0]!;
        remaining[step.mode] = [];
        assigned.set(step.map, { slot: step.map, mode, map });
        records.push({ action: "remaining", mode, map, slot: step.map });
        break;
      }
      case "side": {
        const team = who(step.team);
        const vm = assigned.get(step.map);
        if (!vm) throw new Error(`veto: side chosen for map ${step.map} before it was picked`);
        const choice = yield { action: "side", team, mode: vm.mode, slot: step.map, mapName: vm.map, options: sideOptions(vm.mode) };
        vm.side = { team, choice };
        records.push({ action: "side", team, slot: step.map, side: choice });
        break;
      }
    }
  }

  const maps = order.map((_, i) => {
    const m = assigned.get(i + 1);
    if (!m) throw new Error(`veto: map ${i + 1} never assigned`);
    return m;
  });
  return { teamA, records, maps };
}

/**
 * A veto in progress. Sides with a chooser answer automatically; a side with `null`
 * waits for `answer()` (the user in GM mode).
 */
export class VetoSession {
  readonly records: VetoRecord[] = [];
  private gen: Generator<VetoRequest, VetoResult, string>;
  private cur: IteratorResult<VetoRequest, VetoResult>;

  constructor(setup: VetoSetup, private choosers: [Chooser | null, Chooser | null]) {
    this.gen = vetoSteps(setup, this.records);
    this.cur = this.gen.next();
    this.pump();
  }

  private pump() {
    while (!this.cur.done) {
      const c = this.choosers[this.cur.value.team];
      if (!c) return;
      this.cur = this.gen.next(this.check(this.cur.value, c(this.cur.value)));
    }
  }

  private check(req: VetoRequest, c: string): string {
    if (!req.options.includes(c)) throw new Error(`invalid veto choice "${c}" (options: ${req.options.join(", ")})`);
    return c;
  }

  /** The decision waiting on an interactive side, or null when the veto is complete. */
  get pending(): VetoRequest | null {
    return this.cur.done ? null : this.cur.value;
  }

  answer(choice: string): void {
    if (this.cur.done) throw new Error("veto already complete");
    this.cur = this.gen.next(this.check(this.cur.value, choice));
    this.pump();
  }

  result(): VetoResult {
    if (!this.cur.done) throw new Error("veto not complete");
    return this.cur.value;
  }
}

export function runVeto(opts: VetoSetup & { choosers: [Chooser, Chooser] }): VetoResult {
  return new VetoSession(opts, opts.choosers).result();
}

/** Plays back recorded answers in order (GM decisions stored with a series). */
export function scriptedChooser(answers: string[]): Chooser {
  let i = 0;
  return () => {
    const a = answers[i++];
    if (a === undefined) throw new Error("scripted veto ran out of answers");
    return a;
  };
}

/** How good a team is on a map, in skill units: lineup average for the mode + map modifier. */
export function mapValue(team: SimTeam, mode: Mode, map: string): number {
  const [ws, wm] = TUNING.weights[mode];
  const stat = (r: SimTeam["players"][number]["ratings"]) =>
    mode === "hp" ? r.hp_obj : mode === "snd" ? r.snd_iq : r.third_mode;
  const avg = team.players.reduce((s, p) => s + (ws * p.ratings.slaying + wm * stat(p.ratings)) / 100, 0) / team.players.length;
  return avg + (team.mapMods?.[`${mode}:${map}`] ?? 0);
}

/** AI: ban where the opponent is relatively strongest, pick where we are, plus a little noise. */
export function aiChooser(teams: [SimTeam, SimTeam], me: Side, rng: Rng): Chooser {
  const opp = other(me);
  return (req) => {
    if (req.action === "side") {
      if (req.mode === "snd") return rng.chance(0.6) ? "defense" : "attack";
      return rng.pick(req.options);
    }
    const edge = (map: string) => mapValue(teams[me], req.mode, map) - mapValue(teams[opp], req.mode, map);
    const score = (map: string) => (req.action === "pick" ? edge(map) : -edge(map)) + rng.normal(0, TUNING.vetoNoise);
    let best = req.options[0]!;
    let bestScore = -Infinity;
    for (const m of req.options) {
      const s = score(m);
      if (s > bestScore) [best, bestScore] = [m, s];
    }
    return best;
  };
}
