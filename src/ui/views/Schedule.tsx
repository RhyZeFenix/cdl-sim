import { useState } from "react";
import { weekDate, type SeriesRecord, type Step } from "../../engine";
import type { Nav } from "../App";
import { directory, type Directory } from "../names";
import type { SeasonStore } from "../useSeason";
import { Seg } from "./common";

function FixtureCard({
  teams,
  rec,
  hidden,
  dir,
  onOpen,
}: {
  teams: [string, string];
  rec?: SeriesRecord;
  /** Played, but the result is hidden until the GM watches their match. */
  hidden: boolean;
  dir: Directory;
  onOpen: () => void;
}) {
  const shown = rec && !hidden ? rec : undefined;
  return (
    <button className="fixture" disabled={!rec} onClick={onOpen} title={hidden ? "Unwatched — open to watch" : rec ? "Open match" : "Not played yet"}>
      {teams.map((t, i) => {
        const lost = shown && shown.winner !== t;
        return (
          <div key={t} className={`fx-row ${lost ? "lost" : ""}`}>
            <span className="abbr">{dir.team(t).abbr}</span>
            <span className="tname">{dir.team(t).name}</span>
            <span className="score">{shown ? shown.score[i] : ""}</span>
          </div>
        );
      })}
      {hidden && <span className="next-tag">Unwatched</span>}
    </button>
  );
}

export function Schedule({ store, nav }: { store: SeasonStore; nav: Nav }) {
  const { state, data } = store;
  const dir = directory(data);
  const { season } = data;
  const current = state.steps[state.next];
  const currentStage = current ? ("stage" in current ? current.stage : 5) : 5;
  const [stage, setStage] = useState<number>(Math.min(currentStage, 5));

  const isNext = (s: Step) => current && JSON.stringify(current) === JSON.stringify(s);
  const eventIndex = (kind: string, st?: number) => state.events.findIndex((e) => e.kind === kind && e.stage === st);

  const EventRow = ({ step }: { step: Step }) => {
    const kind = step.kind === "week" ? null : step.kind;
    if (!kind) return null;
    const st = "stage" in step ? step.stage : undefined;
    const ev = kind === "championship" ? season.championship : season.stages[st! - 1]![kind]!;
    const idx = eventIndex(kind, st);
    const rec = idx >= 0 ? state.events[idx]! : null;
    const evHidden = !!rec && store.spoil.eventHidden(rec);
    const gf = evHidden ? undefined : rec?.matches[rec.matches.length - 1];
    return (
      <div className="event-row">
        <div>
          <div className="pill">{kind === "minor" ? "Minor" : kind === "major" ? "Major · LAN" : "Championship · LAN"}</div>
          <h3>{ev.name}</h3>
          <div className="sub">
            {ev.start} – {ev.end}
            {ev.city ? ` · ${ev.city}` : ""}
            {ev.venue ? ` · ${ev.venue}` : ""}
          </div>
        </div>
        <div className="spacer" />
        {isNext(step) && <span className="next-tag">Up next</span>}
        {gf && (
          <span className="sub">
            <b>{dir.team(gf.winner).name}</b> def. {dir.team(gf.winner === gf.teams[0] ? gf.teams[1] : gf.teams[0]).abbr}{" "}
            {Math.max(...gf.score)}-{Math.min(...gf.score)}
          </span>
        )}
        {evHidden && <span className="sub">Results hidden until you watch your match</span>}
        {rec && (
          <>
            {gf && (
              <button className="btn small" onClick={() => nav.openMatch(gf.seriesId)}>
                Final
              </button>
            )}
            <button className="btn small" onClick={() => nav.openBracket(idx)}>
              Bracket
            </button>
          </>
        )}
        {ev.realResult && (
          <span className="muted" style={{ fontSize: 12 }}>
            Real: {dir.team(ev.realResult.winner).abbr} over {dir.team(ev.realResult.runnerUp).abbr}
            {ev.realResult.score ? ` ${ev.realResult.score}` : ""}
          </span>
        )}
      </div>
    );
  };

  const steps = state.steps.filter((s) => (stage === 5 ? s.kind === "championship" : "stage" in s && s.stage === stage));

  return (
    <div>
      <div className="row" style={{ marginBottom: 14 }}>
        <Seg
          label="Stage"
          value={stage}
          onChange={setStage}
          options={[...season.stages.map((st) => ({ value: st.stage, label: `Stage ${st.stage}` })), { value: 5, label: "Champs" }]}
        />
        {stage < 5 && (
          <span className="sub">
            Qualifiers {season.stages[stage - 1]!.qualifiers.start} – {season.stages[stage - 1]!.qualifiers.end} ·{" "}
            {season.stages[stage - 1]!.qualifiers.matchesPerTeam} matches per team
          </span>
        )}
      </div>
      {steps.map((step) => {
        if (step.kind !== "week") return <EventRow key={step.kind} step={step} />;
        const fixtures = state.schedule[step.stage - 1]![step.week - 1]!;
        const pool = season.mapPools.find((p) => p.id === season.stages[step.stage - 1]!.qualifiers.weeks[step.week - 1]!.mapPool)!;
        return (
          <section key={`w${step.week}`} className="week">
            <div className="week-head">
              <h3>Week {step.week}</h3>
              <span className="sub">
                {weekDate(season, step.stage, step.week)} · map pool: {pool.label}
              </span>
              {isNext(step) && <span className="next-tag">Up next</span>}
            </div>
            <div className="fixtures">
              {fixtures.map((fx) => (
                <FixtureCard key={fx.id} teams={fx.teams} rec={state.series[fx.id]} hidden={store.spoil.isHidden(fx.id)} dir={dir} onOpen={() => nav.openMatch(fx.id)} />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
