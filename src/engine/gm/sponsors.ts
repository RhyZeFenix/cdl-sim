// Sponsors: pick one deal a season. What it pays goes on top of the staff budget (coach,
// analyst and academy). Earnings are worked out from results as they happen, so they
// never need storing, and they can leave out unwatched results.
import type { SeasonState } from "../season/season";
import { STAFF_BUDGET } from "./staff";

export type SponsorDeal = "steady" | "results" | "fans";

export const SPONSORS: Record<SponsorDeal, { name: string; blurb: string }> = {
  steady: { name: "Steady partner", blurb: "$60k up front, nothing more" },
  results: { name: "Performance partner", blurb: "$15k up front, $20k for each Major top 4, $40k for a Champs top 3" },
  fans: { name: "Fan-engagement partner", blurb: "$20k up front, $3k for every series you win" },
};

/** A sponsor can be signed or switched until your first series is played. */
export function sponsorOpen(state: SeasonState): boolean {
  const gm = state.gm;
  return !!gm && !Object.values(state.series).some((r) => r.teams.includes(gm.team));
}

export function gmSetSponsor(state: SeasonState, deal: SponsorDeal): void {
  const gm = state.gm;
  if (!gm) throw new Error("not in GM mode");
  if (!sponsorOpen(state)) throw new Error("Sponsor deals are signed before your first match.");
  gm.sponsor = deal;
}

/** What the season's deal has paid so far ($k), leaving out `hidden` series. */
export function sponsorEarned(state: SeasonState, hidden: Set<string> = new Set()): number {
  const gm = state.gm;
  if (!gm?.sponsor) return 0;
  const seen = (ids: string[]) => ids.every((id) => !hidden.has(id));
  switch (gm.sponsor) {
    case "steady":
      return 60;
    case "results": {
      let k = 15;
      for (const e of state.events) {
        if (!seen(e.matches.map((m) => m.seriesId))) continue;
        const place = e.placements[gm.team]?.[0];
        if (place === undefined) continue;
        if (e.kind === "major" && place <= 4) k += 20;
        if (e.kind === "championship" && place <= 3) k += 40;
      }
      return k;
    }
    case "fans":
      return 20 + 3 * Object.values(state.series).filter((r) => r.winner === gm.team && !hidden.has(r.id)).length;
  }
}

/** The staff budget with sponsor money on top. */
export const staffBudget = (state: SeasonState) => STAFF_BUDGET + sponsorEarned(state);
