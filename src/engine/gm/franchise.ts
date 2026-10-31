// Ties the GM sim-game layer into the season: set up a new GM season, and turn each
// GM series and each finished step into morale changes, owner trust and news.
import type { SeasonData } from "../data/registry";
import {
  gmCanMakeMoves,
  isDone,
  playerIndex,
  playerInfo,
  pointsTable,
  type EventRecord,
  type SeasonState,
  type SeriesRecord,
  type Step,
} from "../season/season";
import { initialContracts, payroll } from "./contracts";
import { pushInbox } from "./inbox";
import { addMorale, MORALE_START, seriesMorale, stepMorale } from "./morale";
import { goalsFor, goalText, ordinal, ownerVerdict, strengthRanking, verdictText } from "./owner";
import { FATIGUE, PREP_MORALE } from "./weekly";
import { SALARY_CAP } from "./values";
import { initialStaff, coachMoraleShield } from "./staff";
import { initialRivals, storyAfterSeries } from "./story";
import { marketWindow } from "./market";
import { developProspects, prospectPool } from "./academy";
import { awardSeason } from "./awards";

export { gmBoostFor } from "./weekly";

const teamName = (data: SeasonData, id: string) => data.season.teams.find((t) => t.id === id)?.name ?? id;
const abbr = (data: SeasonData, id: string) =>
  data.season.teams.find((t) => t.id === id)?.abbr ??
  data.season.stages.flatMap((s) => (s.major.format.type === "proam-gsl" ? s.major.format.guests : [])).find((g) => g.id === id)?.abbr ??
  id;

/** A new GM season: contracts, morale, owner goals and a welcome note. */
export function initFranchise(state: SeasonState, data: SeasonData): void {
  const gm = state.gm!;
  const date = data.season.stages[0]!.qualifiers.start;
  gm.prep = gm.prep ?? { kind: "balanced" };
  gm.morale = gm.morale ?? Object.fromEntries(gm.roster.map((id) => [id, MORALE_START]));
  gm.moraleLog = gm.moraleLog ?? [];
  gm.contracts = gm.contracts ?? initialContracts(state, data, gm.roster, data.season.id);
  gm.deadCap = gm.deadCap ?? 0;
  gm.trust = gm.trust ?? 60;
  gm.processed = gm.processed ?? [];
  gm.trades = gm.trades ?? [];
  const ranking = strengthRanking(state, data, date);
  gm.expectedRank = ranking.findIndex((r) => r.team === gm.team) + 1;
  gm.goals = goalsFor(gm.expectedRank, data);
  gm.inbox = gm.inbox ?? [];
  gm.staff = gm.staff ?? initialStaff(state);
  gm.fatigue = gm.fatigue ?? 0;
  gm.scrims = gm.scrims ?? [];
  gm.familiarity = gm.familiarity ?? {};
  gm.rivals = gm.rivals ?? initialRivals(state, data);
  gm.streak = gm.streak ?? 0;
  gm.tradeBlock = gm.tradeBlock ?? [];
  gm.academy = gm.academy ?? [];
  if (!gm.prospects) {
    const taken = new Set([...playerIndex(data).values()].map((p) => p.handle.toLowerCase()));
    gm.prospects = prospectPool(state, taken);
  }
  pushInbox(state, {
    date,
    kind: "welcome",
    title: `Welcome to ${teamName(data, gm.team)}`,
    body:
      `The front office rates this roster ${ordinal(gm.expectedRank)} of ${data.season.teams.length} going into the season. ` +
      `The owner's goals: ${gm.goals.map(goalText).join("; ")}. ` +
      `Payroll is $${payroll(state)}k against a $${SALARY_CAP}k cap. Set a prep focus each week in the Office.`,
  });
  marketWindow(state, data);
}

/** After a GM series: morale changes and a recap (both hidden until the series is watched). */
export function onGmSeries(state: SeasonState, data: SeasonData, rec: SeriesRecord): void {
  const gm = state.gm!;
  if (gm.processed?.includes(rec.id)) return;
  gm.processed = [...(gm.processed ?? []), rec.id];
  const side = rec.teams[0] === gm.team ? 0 : 1;
  const won = rec.winner === gm.team;
  const opp = rec.teams[1 - side]!;
  // A better coach takes the sting out of losses.
  const shield = coachMoraleShield(state);
  const deltas = Object.fromEntries(Object.entries(seriesMorale(state, rec)).map(([id, d]) => [id, d < 0 ? Math.round(d * shield) : d]));
  addMorale(state, { refs: [rec.id], why: `${won ? "Win" : "Loss"} vs ${abbr(data, opp)}`, deltas });

  // Top fragger for the recap.
  const lines = new Map<string, [number, number]>();
  for (const m of rec.maps) {
    for (let i = side * 4; i < side * 4 + 4; i++) {
      const [k, d] = lines.get(m.lineup[i]!) ?? [0, 0];
      lines.set(m.lineup[i]!, [k + m.box[i]!.kills, d + m.box[i]!.deaths]);
    }
  }
  const [star, [k, d]] = [...lines.entries()].sort((a, b) => b[1][0] - b[1][1] - (a[1][0] - a[1][1]))[0]!;
  const score = `${rec.score[side]}–${rec.score[1 - side]}`;
  const maps = rec.maps.map((m) => `${m.map} ${m.score[side]}–${m.score[1 - side]}`).join(", ");
  pushInbox(state, {
    date: rec.date,
    kind: "recap",
    title: `${won ? "Win" : "Loss"} ${score} vs ${teamName(data, opp)}`,
    body: `${rec.label}. Maps: ${maps}. ${playerInfo(state, data, star)?.handle ?? star} led the way at ${k}-${d}.`,
    refs: [rec.id],
  });
  storyAfterSeries(state, data, rec);
}

/** After a whole step: prep and drift on morale, league news, and the owner's reaction to events. */
export function onStepComplete(state: SeasonState, data: SeasonData, step: Step): void {
  const gm = state.gm!;
  const mine = Object.values(state.series).filter((r) => r.teams.includes(gm.team) && inStep(r, step)).map((r) => r.id);
  const prepDelta = gm.prep?.kind === "rest" ? PREP_MORALE.rest : gm.prep?.kind === "grind" ? PREP_MORALE.grind : 0;
  addMorale(state, { refs: mine, why: prepDelta ? `Prep: ${gm.prep!.kind}` : "Settling", deltas: stepMorale(state, prepDelta) });

  // Practice: fatigue from prep and scrims; scrim partners become familiar for two steps.
  const scrims = gm.scrims ?? [];
  const prepFatigue = FATIGUE[gm.prep?.kind ?? "balanced"];
  gm.fatigue = Math.max(0, Math.min(100, (gm.fatigue ?? 0) + prepFatigue + scrims.length * FATIGUE.scrim));
  if (scrims.length) gm.familiarity = { ...(gm.familiarity ?? {}), ...Object.fromEntries(scrims.map((t) => [t, state.next + 2])) };
  developProspects(state);

  const date = state.pointsHistory[state.pointsHistory.length - 1]?.date ?? "";
  // Anyone unhappy says so.
  for (const id of gm.roster) {
    const m = gm.morale?.[id] ?? MORALE_START;
    if (m < 40) {
      const benched = !gm.starters.includes(id);
      pushInbox(state, {
        date,
        kind: "morale",
        title: `${playerInfo(state, data, id)?.handle ?? id} is unhappy`,
        body: benched ? "Wants to play. Morale this low costs form: start them or move them on." : "Results have them down. Consider rest in your weekly prep.",
        refs: mine,
      });
    }
  }

  if (step.kind === "week") {
    const others = Object.values(state.series).filter((r) => inStep(r, step) && !r.teams.includes(gm.team));
    const sweeps = others.filter((r) => Math.min(...r.score) === 0);
    const lines = others.slice(0, 6).map((r) => `${abbr(data, r.winner)} beat ${abbr(data, r.winner === r.teams[0] ? r.teams[1] : r.teams[0])} ${Math.max(...r.score)}–${Math.min(...r.score)}`);
    pushInbox(state, {
      date,
      kind: "roundup",
      title: `Around the league: Stage ${step.stage} Week ${step.week}`,
      body: `${lines.join(" · ")}${sweeps.length ? `. ${sweeps.length} sweep${sweeps.length > 1 ? "s" : ""} this week.` : "."}`,
    });
  } else {
    const ev = state.events[state.events.length - 1]!;
    eventNews(state, data, ev, mine);
    if (step.kind === "championship") {
      awardSeason(state, data, ev.matches.map((m) => m.seriesId), (id) => playerInfo(state, data, id)?.handle ?? id);
    }
  }
  if (gmCanMakeMoves(state)) marketWindow(state, data);
}

function inStep(r: SeriesRecord, step: Step): boolean {
  const p = r.phase;
  if (step.kind === "week") return p.kind === "qualifiers" && p.stage === step.stage && p.week === step.week;
  if (step.kind === "championship") return p.kind === "championship";
  return p.kind === step.kind && "stage" in p && p.stage === step.stage;
}

function eventNews(state: SeasonState, data: SeasonData, ev: EventRecord, mine: string[]): void {
  const gm = state.gm!;
  const refs = ev.matches.map((m) => m.seriesId);
  const final = ev.matches[ev.matches.length - 1]!;
  const runnerUp = final.winner === final.teams[0] ? final.teams[1] : final.teams[0];
  const date = state.pointsHistory[state.pointsHistory.length - 1]?.date ?? "";
  pushInbox(state, {
    date,
    kind: "event",
    title: `${teamName(data, final.winner)} win ${ev.name}`,
    body: `${teamName(data, final.winner)} beat ${teamName(data, runnerUp)} ${Math.max(...final.score)}–${Math.min(...final.score)} in the final.`,
    refs,
  });
  if (ev.kind === "minor") return;

  // The owner judges Majors and Champs against where the roster was expected to finish.
  const place = ev.placements[gm.team]?.[0];
  const expected = gm.expectedRank ?? 6;
  const delta = place === undefined ? -8 : Math.max(-10, Math.min(10, 2 * (expected - place)));
  gm.trust = Math.max(0, Math.min(100, (gm.trust ?? 60) + delta));
  const mood = delta >= 4 ? "thrilled" : delta > 0 ? "pleased" : delta === 0 ? "content" : delta > -6 ? "concerned" : "unhappy";
  pushInbox(state, {
    date,
    kind: "owner",
    title: `The owner is ${mood}`,
    body:
      place === undefined
        ? `Not even qualifying for ${ev.name} hurt. Owner trust: ${gm.trust}/100.`
        : `${ordinal(place)} at ${ev.name}, against a preseason expectation of ${ordinal(expected)}. Owner trust: ${gm.trust}/100.`,
    refs: [...refs, ...mine],
  });

  if (isDone(state)) {
    const v = ownerVerdict(state, data);
    gm.trust = Math.max(0, Math.min(100, gm.trust + (v.verdict === "extended" ? 10 : v.verdict === "satisfied" ? 3 : -10)));
    const rank = pointsTable(state, data).findIndex((r) => r.team === gm.team) + 1;
    pushInbox(state, {
      date,
      kind: "owner",
      title: "End-of-season review",
      body: `${v.met} of ${v.total} goals met, ${ordinal(rank)} in CDL points. ${verdictText[v.verdict]}`,
      refs,
    });
  }
}
