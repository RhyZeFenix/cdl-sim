// Map pool lookup by (season, stage, phase). Mid-season pool changes live in the
// data (each qualifier week and LAN event names its pool), so this is a plain lookup.
import type { MapPool, Mode, Season, SlotMode } from "./schema";

export type PoolPhase =
  | { kind: "qualifiers"; stage: number; week: number }
  | { kind: "minor"; stage: number }
  | { kind: "major"; stage: number }
  | { kind: "championship" };

export function poolIdFor(season: Season, phase: PoolPhase): string {
  if (phase.kind === "championship") return season.championship.mapPool;
  const stage = season.stages.find((s) => s.stage === phase.stage);
  if (!stage) throw new Error(`${season.id}: no stage ${phase.stage}`);
  if (phase.kind === "major") return stage.major.mapPool;
  if (phase.kind === "minor") {
    if (!stage.minor) throw new Error(`${season.id}: stage ${phase.stage} has no Minor`);
    return stage.minor.mapPool;
  }
  const week = stage.qualifiers.weeks.find((w) => w.week === phase.week);
  if (!week) throw new Error(`${season.id}: stage ${phase.stage} has no qualifier week ${phase.week}`);
  return week.mapPool;
}

export function mapPoolFor(season: Season, phase: PoolPhase): MapPool {
  const id = poolIdFor(season, phase);
  const pool = season.mapPools.find((p) => p.id === id);
  if (!pool) throw new Error(`${season.id}: unknown map pool ${id}`);
  return pool;
}

/** Resolves a series slot ("third") to the concrete mode for this season. */
export function slotToMode(season: Season, slot: SlotMode): Mode {
  return slot === "third" ? season.thirdMode : slot;
}
