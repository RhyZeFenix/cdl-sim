// The GM's office: a header of key numbers and sub-tabs for the week ahead, the
// calendar, the market, staff, the academy, awards and your career. Each sub-tab lives
// in views/office/. Spoiler-free: anything that would give away an unwatched result
// waits until it's watched.
import { useState } from "react";
import { capLabel, capOf, chemistryOf, roleBalance, isDone, nextStep, payroll, prepLabel, seasonLabel, visibleInbox } from "../../engine";
import { stepLabel, type Nav } from "../App";
import { directory } from "../names";
import type { SeasonStore } from "../useSeason";
import { Help, TeamTag, arrowKeys } from "./common";
import { Career } from "./Career";
import { SeasonReviewCard } from "./Review";
import { Meter } from "./office/shared";
import { Scouting, PrepCard, Practice } from "./office/Week";
import { Inbox, Goals, OffSeason, History, Guide } from "./office/Overview";
import { Offers, Finances, Trades } from "./office/Market";
import { CalendarView } from "./office/CalendarView";
import { StaffView } from "./office/StaffView";
import { AcademyView } from "./office/AcademyView";
import { AwardsView } from "./office/AwardsView";

type OfficeTab = "overview" | "week" | "calendar" | "market" | "staff" | "academy" | "awards" | "career";

const OFFICE_TABS: { id: OfficeTab; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "week", label: "This week" },
  { id: "calendar", label: "Calendar" },
  { id: "market", label: "Market" },
  { id: "staff", label: "Staff" },
  { id: "academy", label: "Academy" },
  { id: "awards", label: "Awards" },
  { id: "career", label: "Career" },
];

export function Office({ store, nav }: { store: SeasonStore; nav: Nav }) {
  const { state, data, spoil } = store;
  const gm = state.gm!;
  const dir = directory(data);
  const done = isDone(state);
  const pay = payroll(state);
  const mine = Object.values(state.series).filter((r) => r.teams.includes(gm.team) && !spoil.isHidden(r.id));
  const wins = mine.filter((r) => r.winner === gm.team).length;
  const [tab, setTab] = useState<OfficeTab>("overview");
  const pendingChoices = visibleInbox(state, spoil.hidden).filter((i) => i.choices && !i.answered).length;
  const fatigue = gm.fatigue ?? 0;
  const streak = gm.streak ?? 0;

  return (
    <div>
      <div className="card">
        <div className="card-head">
          <h2>
            <TeamTag team={dir.team(gm.team)} />
          </h2>
          <span className="sub">
            {seasonLabel(state, data)}
            {state.dynasty ? ` · dynasty year ${state.dynasty.year}` : ""} · {wins}-{mine.length - wins} in series · {spoil.points[gm.team] ?? 0} CDL points
          </span>
        </div>
        <div className="kpis">
          <div className="kpi">
            <span className="l">
              Owner trust
              <Help text="0-100. Moves after every Major and Champs against where your roster was expected to finish. Too low at season's end and you can be fired." />
            </span>
            <span className="v">{spoil.active ? "—" : `${gm.trust ?? 60}/100`}</span>
            <Meter value={spoil.active ? 0 : (gm.trust ?? 60)} />
          </div>
          <div className="kpi">
            <span className="l">
              Payroll
              <Help text="Player salaries plus dead money from releases. Stay under the cap to sign anyone asking more than the minimum. The cap depends on difficulty." />
            </span>
            <span className="v">
              ${pay}k <span className="muted">/ {capLabel(state)}</span>
            </span>
            <Meter value={Number.isFinite(capOf(state)) ? (100 * pay) / capOf(state) : 0} warn={pay > capOf(state)} />
          </div>
          <div className="kpi" title="Chemistry grows with every map your starters play together; roles need an AR and an SMG (flex covers either)">
            <span className="l">
              Chemistry
              <Help text="Grows with every map your starting four play together (50 maps per pair for full). Worth up to ±1 skill point. A lineup without an AR and an SMG player costs a little more." />
            </span>
            <span className="v">
              {chemistryOf(state, gm.starters)}/100
              {!roleBalance(state, data, gm.starters).ok && <span style={{ color: "var(--ban)", fontSize: 12 }}> · {roleBalance(state, data, gm.starters).note}</span>}
            </span>
            <Meter value={chemistryOf(state, gm.starters)} />
          </div>
          <div className="kpi">
            <span className="l">
              Fatigue
              <Help text="Scrims and grinding add fatigue; rest and lighter weeks clear it. Above 50 it costs form on every map." />
            </span>
            <span className="v">{fatigue}/100</span>
            <Meter value={fatigue} warn={fatigue > 50} />
          </div>
          <div className="kpi">
            <span className="l">
              Streak
              <Help text="Your current run of series wins (W) or losses (L). Long streaks make the news and trigger press conferences." />
            </span>
            <span className="v">{spoil.active ? "—" : streak > 0 ? `W${streak}` : streak < 0 ? `L${-streak}` : "—"}</span>
          </div>
          <div className="kpi">
            <span className="l">Prep this week</span>
            <span className="v">{prepLabel(gm.prep)}</span>
          </div>
          <div className="kpi">
            <span className="l">Next</span>
            <span className="v">{done ? "Season over" : stepLabel(data.season, nextStep(state))}</span>
          </div>
        </div>
      </div>

      <nav className="tabs subtabs" role="tablist" aria-label="Office" onKeyDown={arrowKeys}>
        {OFFICE_TABS.map((t) => (
          <button key={t.id} role="tab" aria-selected={tab === t.id} tabIndex={tab === t.id ? 0 : -1} onClick={() => setTab(t.id)}>
            {t.label}
            {t.id === "overview" && pendingChoices > 0 ? <span className="next-tag" style={{ marginLeft: 6 }}>{pendingChoices}</span> : null}
          </button>
        ))}
      </nav>

      {tab === "overview" && (
        <>
          <Guide />
          {done && !spoil.active && <SeasonReviewCard store={store} />}
          {done && !spoil.active && <OffSeason store={store} />}
          <div className="grid2" style={{ marginTop: 12 }}>
            <Inbox store={store} />
            <Goals store={store} />
          </div>
          {state.dynasty && state.dynasty.history.length > 0 && <History state={state} />}
        </>
      )}
      {tab === "week" &&
        (done ? (
          <div className="card muted">The season is over. Plan the off-season on the Overview tab.</div>
        ) : (
          <div className="grid2">
            <Scouting store={store} nav={nav} />
            <div>
              <PrepCard store={store} />
              <Practice store={store} />
            </div>
          </div>
        ))}
      {tab === "calendar" && <CalendarView store={store} nav={nav} />}
      {tab === "market" && (
        <>
          <Offers store={store} />
          <Finances store={store} nav={nav} />
          <Trades store={store} nav={nav} />
        </>
      )}
      {tab === "staff" && <StaffView store={store} />}
      {tab === "academy" && <AcademyView store={store} nav={nav} />}
      {tab === "awards" && <AwardsView store={store} nav={nav} />}
      {tab === "career" && <Career store={store} />}
    </div>
  );
}

