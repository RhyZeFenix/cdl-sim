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

/** Something the GM can answer from the inbox. */
export type InboxAction =
  | { type: "press"; seriesId: string; opponent: string; won: boolean }
  | { type: "tradeOffer"; team: string; give: string[]; get: string[]; window: number }
  | { type: "raise"; player: string; salary: number }
  | { type: "tradeRequest"; player: string };

export interface InboxChoice {
  id: string;
  label: string;
  hint: string;
}

export interface InboxItem {
  id: string;
  date: string;
  kind: "welcome" | "recap" | "roundup" | "event" | "owner" | "morale" | "contract" | "trade" | "scout" | "press" | "offer" | "demand" | "story" | "staff" | "academy" | "award";
  title: string;
  body: string;
  /** Series whose results this item gives away: it stays hidden while any is unwatched. */
  refs?: string[];
  read?: boolean;
  action?: InboxAction;
  choices?: InboxChoice[];
  /** The choice made (or "expired"). */
  answered?: string;
}

export interface StaffMember {
  id: string;
  name: string;
  role: "coach" | "analyst";
  /** 1-5 stars. */
  rating: number;
  /** $k a season, from the staff budget. */
  salary: number;
}

export interface Prospect {
  player: Player;
  /** Overall the prospect could grow into. */
  potential: number;
  age: number;
  team: string;
}

export interface SeasonAwards {
  mvp?: string;
  rookie?: string;
  champsMvp?: string;
  /** First and second All-CDL teams, four players each. */
  allCdl: [string[], string[]];
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
  /** The team may add one more season at the same salary when it ends. */
  option?: boolean;
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
  /** Your best new arrivals that season (signed, traded for or promoted). */
  signings?: { player: string; handle: string; kd: number; maps: number }[];
  /** Awards your players won. */
  awards?: string[];
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
