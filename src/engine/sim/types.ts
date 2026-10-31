import type { Mode, Ratings } from "../data/schema";

/** 0 = first team in the series (higher seed), 1 = second. */
export type Side = 0 | 1;
export const other = (s: Side): Side => (s === 0 ? 1 : 0);
export type Pair = [number, number];

export interface SimPlayer {
  id: string;
  handle: string;
  ratings: Ratings;
}

export interface SimTeam {
  id: string;
  name: string;
  abbr: string;
  /** Exactly four starters. */
  players: SimPlayer[];
  /** Map preference modifiers keyed "mode:Map", in skill units (~±0.05). Missing = neutral. */
  mapMods?: Record<string, number>;
}

/**
 * Map events. Player references are indexes into the map's lineup:
 * 0-3 are side 0's players, 4-7 side 1's. `t` is seconds since map start.
 */
export type MapEvent =
  | { k: "kill"; t: number; by: number; on: number; dmg: number; vdmg: number; fb?: true }
  | { k: "hold"; t: number; hill: number; team: Side; secs: number; on: number[] }
  | { k: "hill"; t: number; n: number; label: string; pts: Pair; score: Pair }
  | { k: "plant"; t: number; by: number; site: "A" | "B" }
  | { k: "defuse"; t: number; by: number }
  | { k: "clutch"; t: number; by: number; vs: number }
  | { k: "zone"; t: number; team: Side; zone: "A" | "B"; by: number }
  | { k: "pickup"; t: number; by: number }
  | { k: "drop"; t: number; by: number }
  | { k: "ocap"; t: number; by: number; team: Side; score: Pair }
  | { k: "half"; t: number; n: number; score: Pair }
  | { k: "sudden"; t: number }
  | {
      k: "round";
      t: number;
      n: number;
      atk: Side;
      winner: Side;
      how: "elim" | "detonate" | "defuse" | "time" | "capture" | "lives";
      score: Pair;
      lives?: Pair;
    };

export interface PlayerLine {
  kills: number;
  deaths: number;
  damage: number;
  /** HP: this player's share of their team's scoring seconds (team shares sum to the team score). */
  hillTime: number;
  firstBloods: number;
  plants: number;
  defuses: number;
  clutches: number;
  zoneCaps: number;
  pickups: number;
  oCaps: number;
}

export interface MapResult {
  /** 1-based position in the series. */
  slot: number;
  mode: Mode;
  map: string;
  score: Pair;
  winner: Side;
  durationSec: number;
  /** Player ids in event-index order (0-7). */
  lineup: string[];
  events: MapEvent[];
  box: PlayerLine[];
}
