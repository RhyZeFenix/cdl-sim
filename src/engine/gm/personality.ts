// Player personalities. Most players have none; some are leaders (they lift the other
// starters' morale), hotheads (bigger morale swings), steady (smaller swings),
// mercenaries (want more money, care less about joining a contender) or loyal (take
// less to stay). Seeded from the player id, so a player is the same in every save.
export type Trait = "leader" | "hothead" | "steady" | "mercenary" | "loyal";

export const TRAIT_TEXT: Record<Trait, string> = {
  leader: "Leader: lifts the other starters' morale every week they start",
  hothead: "Hothead: morale swings half again as far, both ways",
  steady: "Steady: morale moves less after wins and losses",
  mercenary: "Mercenary: asks 10% more and cares less about joining a contender",
  loyal: "Loyal: takes 10% less to re-sign with their own team",
};

export const TRAIT_LABEL: Record<Trait, string> = { leader: "Leader", hothead: "Hothead", steady: "Steady", mercenary: "Mercenary", loyal: "Loyal" };

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** Everyone's trait, or none (about 60% have none). */
export function traitOf(id: string): Trait | undefined {
  if (id.startsWith("repl-")) return undefined;
  const x = hash(`trait/${id}`) % 100;
  return x < 8 ? "leader" : x < 17 ? "hothead" : x < 26 ? "steady" : x < 33 ? "mercenary" : x < 40 ? "loyal" : undefined;
}

/** How far a morale change moves this player. */
export const moraleScale = (id: string) => (traitOf(id) === "hothead" ? 1.5 : traitOf(id) === "steady" ? 0.6 : 1);

/** Weekly morale lift a starting leader gives each other starter. */
export const LEADER_LIFT = 1;
