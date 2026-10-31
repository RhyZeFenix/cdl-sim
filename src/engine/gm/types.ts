// Types for the GM sim-game layer: weekly prep, morale, the inbox, owner goals,
// contracts, trades and dynasty. All of it is plain JSON stored on the season state.
import type { Mode, Player } from "../data/schema";

/** The GM's focus for the next step (a qualifier week or an event). */
export type Prep =
  | { kind: "balanced" }
  | { kind: "map"; mode: Mode; map: string }
  | { kind: "mode"; mode: Mode }
  | { kind: "rest" }
  | { kind: "grind" };

/**
 * What the GM's prep and morale add to one series. Stored on the series record so a
 * replay rebuilds exactly the teams that played.
 */
export interface GmBoost {
  /** Extra skill on maps, keyed "mode:Map". */
  prep?: Record<string, number>;
  /** Extra team skill on every map. */
  form?: number;
  /** Extra skill per player (morale). */
  players?: Record<string, number>;
}

/** A change to morale, and the GM series it came from (hidden while those are unwatched). */
export interface MoraleChange {
  refs: string[];
  why: string;
  deltas: Record<string, number>;
}

export interface InboxItem {
  id: string;
  date: string;
  kind: "welcome" | "recap" | "roundup" | "event" | "owner" | "morale" | "contract" | "trade" | "scout";
  title: string;
  body: string;
  /** Series whose results this item gives away: it stays hidden while any is unwatched. */
  refs?: string[];
  read?: boolean;
}

export type OwnerGoal =
  | { kind: "pointsRank"; max: number }
  | { kind: "makeChamps" }
  | { kind: "winEvent"; event: "major" | "any" }
  | { kind: "eventTop"; max: number }
  | { kind: "champsTop"; max: number };

export interface Contract {
  /** $k per season. */
  salary: number;
  /** Seasons left, counting this one. */
  years: number;
}

export interface TradeRecord {
  date: string;
  team: string;
  gave: string[];
  got: string[];
}

export interface SeasonRecap {
  year: number;
  label: string;
  team: string;
  teamName: string;
  points: number;
  rank: number;
  record: [number, number];
  champsPlace?: [number, number];
  eventsWon: string[];
  goalsMet: number;
  goalsTotal: number;
  verdict: OwnerVerdict;
}

export type OwnerVerdict = "extended" | "satisfied" | "on notice" | "fired";

export interface DynastyInfo {
  /** 1 for the first season of the save. */
  year: number;
  /** "CDL 2027" etc. once the real seasons run out. */
  label: string;
  history: SeasonRecap[];
}

/** Players carried over from an earlier season of a dynasty, with their progressed ratings. */
export type CarriedPlayers = Record<string, Player>;
