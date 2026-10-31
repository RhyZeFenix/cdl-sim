import { useEffect, useRef, useState } from "react";
import { SEASON_IDS, loadSeasonData, type Season, type SeasonId, type Step } from "../engine";
import { randomSeed, useSeason, type SeasonConfig, type SimKind } from "./useSeason";
import { Standings } from "./views/Standings";
import { Schedule } from "./views/Schedule";
import { Brackets } from "./views/Brackets";
import { MatchView } from "./views/MatchView";
import { Summary } from "./views/Summary";
import { MyTeam } from "./views/MyTeam";
import { VetoScreen } from "./views/VetoScreen";
import { BetweenMaps } from "./views/BetweenMaps";
import { MatchDayBanner } from "./views/MatchDay";

type Tab = "myteam" | "schedule" | "standings" | "brackets" | "summary";
export type Speed = "instant" | "watch";

export interface Nav {
  openMatch(id: string, opts?: { watch?: boolean }): void;
  openBracket(eventIndex: number): void;
}

export function stepLabel(season: Season, step: Step | undefined): string {
  if (!step) return "Season complete";
  switch (step.kind) {
    case "week":
      return `Stage ${step.stage} Qualifiers · Week ${step.week}`;
    case "minor":
    case "major":
      return season.stages[step.stage - 1]![step.kind]!.name;
    case "championship":
      return "Championship";
  }
}

const SEASON_LABEL: Record<SeasonId, string> = { "2024": "2024 · MWIII", "2025": "2025 · BO6", "2026": "2026 · BO7" };

export function App() {
  const store = useSeason({ seasonId: "2026", seed: randomSeed(), ratingMode: "historical" });
  const { state, data, busy, done } = store;
  const [draft, setDraft] = useState<SeasonConfig>(store.config);
  const [tab, setTab] = useState<Tab>("schedule");
  const [match, setMatch] = useState<{ id: string; watch: boolean } | null>(null);
  const [bracketEvent, setBracketEvent] = useState<number | null>(null);
  const [speed, setSpeed] = useState<Speed>("instant");
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const lastKind = useRef<SimKind>("step");
  const draftData = loadSeasonData(draft.seasonId);

  useEffect(() => setDraft(store.config), [store.config]);
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (state.next > 0) e.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [state]);

  const nav: Nav = {
    openMatch: (id, opts) => setMatch({ id, watch: !!opts?.watch }),
    openBracket: (i) => {
      setBracketEvent(i);
      setMatch(null);
      setTab("brackets");
    },
  };

  const dirty =
    draft.seasonId !== store.config.seasonId ||
    draft.seed !== store.config.seed ||
    draft.ratingMode !== store.config.ratingMode ||
    draft.gmTeam !== store.config.gmTeam ||
    !!draft.champsOnly !== !!store.config.champsOnly ||
    !!draft.chaos !== !!store.config.chaos;
  const startNew = () => {
    if (state.next > 0 && !confirm("Start a new season? Unsaved progress on this one will be lost.")) return;
    store.start(draft);
    setMatch(null);
    setBracketEvent(null);
    setTab(draft.gmTeam ? "myteam" : "schedule");
  };

  const runSim = async (kind: SimKind) => {
    lastKind.current = kind;
    const out = await store.sim(kind);
    if (afterMatchDay(out.matchDay)) return;
    if (out.paused) {
      setMatch(null);
      return;
    }
    if (speed === "watch" && out.newSeries.length) {
      // Watch the headline series of what just ran: an event's final, else the week's first match.
      const last = out.steps[out.steps.length - 1];
      const id = last && last.kind !== "week" ? out.newSeries[out.newSeries.length - 1]! : out.newSeries[0]!;
      setMatch({ id, watch: true });
    }
  };

  const onImport = async (f: File | undefined) => {
    if (!f) return;
    try {
      store.importJson(await f.text());
      setMatch(null);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
    if (fileRef.current) fileRef.current.value = "";
  };

  /** After the GM submits a veto: keep running the sim the user started. */
  const resume = async (gmSeriesId: string) => {
    const out = await store.sim(lastKind.current);
    if (afterMatchDay(out.matchDay)) return;
    if (!out.paused && speed === "watch") setMatch({ id: gmSeriesId, watch: true });
  };

  /**
   * Spoiler-free match day: when your result is ready, show the match day banner (or,
   * in Watch speed, go straight to watching it live). Returns true if it handled things.
   */
  function afterMatchDay(unwatched: string[]): boolean {
    if (!unwatched.length) return false;
    setMatch(speed === "watch" ? { id: unwatched[0]!, watch: true } : null);
    return true;
  }

  const next = state.steps[state.next];
  const spoil = store.spoil;
  // Your result comes first: a waiting veto shows once the match day is dealt with.
  const paused = !!state.pending && !spoil.active;
  const blocked = paused || spoil.active;
  // While a worker sim runs, show its live progress.
  const shownNext = store.progress?.next ?? state.next;
  const pct = Math.round((100 * shownNext) / state.steps.length);

  return (
    <div className="app">
      <header className="topbar">
        <div className="row">
          <div className="brand">
            CDL <span>Season Sim</span>
          </div>
          <label className="field">
            Season
            <select
              value={draft.seasonId}
              onChange={(e) => {
                const seasonId = e.target.value as SeasonId;
                const teams = loadSeasonData(seasonId).season.teams;
                const gmTeam = draft.gmTeam && !teams.some((t) => t.id === draft.gmTeam) ? teams[0]!.id : draft.gmTeam;
                setDraft({ ...draft, seasonId, gmTeam });
              }}
            >
              {SEASON_IDS.map((id) => (
                <option key={id} value={id}>
                  {SEASON_LABEL[id]}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            Seed
            <input value={draft.seed} onChange={(e) => setDraft({ ...draft, seed: e.target.value.trim() })} spellCheck={false} />
          </label>
          <button className="btn icon" title="Random seed" aria-label="Random seed" onClick={() => setDraft({ ...draft, seed: randomSeed() })}>
            ⟳
          </button>
          <div className="seg" role="group" aria-label="Ratings">
            {(["historical", "randomized"] as const).map((m) => (
              <button key={m} aria-pressed={draft.ratingMode === m} onClick={() => setDraft({ ...draft, ratingMode: m })}>
                {m === "historical" ? "Historical" : "Randomized"}
              </button>
            ))}
          </div>
          <label className="field" title="Hot and cold weekends: each team's form swings per event, so upsets and surprise runs are far more common">
            <input type="checkbox" checked={!!draft.chaos} onChange={(e) => setDraft({ ...draft, chaos: e.target.checked })} style={{ width: "auto" }} />
            Chaos
          </label>
          <div className="seg" role="group" aria-label="Season length">
            <button aria-pressed={!draft.champsOnly} onClick={() => setDraft({ ...draft, champsOnly: false })}>
              Full season
            </button>
            <button
              aria-pressed={!!draft.champsOnly}
              title="Skip the regular season and play Champs from the real seeds"
              onClick={() => setDraft({ ...draft, champsOnly: true })}
            >
              Champs only
            </button>
          </div>
          <div className="seg" role="group" aria-label="Mode">
            <button aria-pressed={!draft.gmTeam} onClick={() => setDraft({ ...draft, gmTeam: undefined })}>
              Commissioner
            </button>
            <button aria-pressed={!!draft.gmTeam} onClick={() => setDraft({ ...draft, gmTeam: draft.gmTeam ?? draftData.season.teams[0]!.id })}>
              GM
            </button>
          </div>
          {draft.gmTeam && (
            <select className="plain" aria-label="GM team" value={draft.gmTeam} onChange={(e) => setDraft({ ...draft, gmTeam: e.target.value })}>
              {draftData.season.teams.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          )}
          <button className={`btn ${dirty ? "primary" : ""}`} onClick={startNew} disabled={!draft.seed}>
            New season
          </button>
          <div className="spacer" />
          <button className="btn" onClick={store.exportJson}>
            Export
          </button>
          <button className="btn" onClick={() => fileRef.current?.click()}>
            Import
          </button>
          <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={(e) => onImport(e.target.files?.[0])} />
        </div>
        <div className="row">
          <span className="status">
            {data.season.label} · seed <b>{state.options.seed}</b> · {state.options.ratingMode}
            {state.options.chaos ? <> · <b>Chaos</b></> : null}
            {state.options.champsOnly ? <> · <b>Champs only</b> (real seeds)</> : null}
            {state.gm ? <> · GM: <b>{data.season.teams.find((t) => t.id === state.gm!.team)?.abbr}</b></> : null}
            {state.gm && state.options.champsOnly && !data.season.historical?.champsSeeds?.includes(state.gm.team) ? (
              <span className="muted"> (didn't make the real Champs)</span>
            ) : null}{" "}
            —{" "}
            {done && !spoil.active ? (
              <b>Season complete</b>
            ) : spoil.active ? (
              <b>Match day — your result is ready</b>
            ) : paused ? (
              <b>{state.pending!.between ? "Waiting for your lineup" : "Waiting for your veto"}</b>
            ) : (
              <>
                Next: <b>{stepLabel(data.season, next)}</b>
              </>
            )}
          </span>
          <div className="progress" title={`${state.next} of ${state.steps.length} steps`}>
            <div style={{ width: `${pct}%` }} />
          </div>
          <div className="spacer" />
          <button className="btn primary" disabled={busy || done || blocked} onClick={() => runSim("step")}>
            {next && next.kind !== "week" ? `Sim ${stepLabel(data.season, next)}` : "Sim week"}
          </button>
          <button className="btn" disabled={busy || done || blocked} onClick={() => runSim("stage")}>
            Sim stage
          </button>
          <button className="btn" disabled={busy || done || blocked} onClick={() => runSim("season")}>
            Sim season
          </button>
          <div className="seg" role="group" aria-label="Speed">
            {(["instant", "watch"] as const).map((s) => (
              <button key={s} aria-pressed={speed === s} onClick={() => setSpeed(s)} title={s === "watch" ? "After each sim, open the headline match and play it back" : "Just show results"}>
                {s === "instant" ? "Instant" : "Watch"}
              </button>
            ))}
          </div>
        </div>
        {error && <div className="sub" style={{ color: "var(--ban)" }}>Import failed: {error}</div>}
      </header>

      <main className={busy ? "busy" : ""} key={`${state.seasonId}-${state.options.seed}-${store.config.ratingMode}-${state.gm?.team ?? ""}`}>
        {paused && state.pending!.between ? (
          <BetweenMaps key={`${state.pending!.spec.id}-${state.pending!.between.nextSlot}`} store={store} onPlayed={resume} />
        ) : paused ? (
          <VetoScreen key={state.pending!.spec.id} store={store} onPlayed={resume} />
        ) : match ? (
          <MatchView store={store} seriesId={match.id} autoWatch={match.watch} onBack={() => setMatch(null)} nav={nav} />
        ) : (
          <>
            {spoil.active && <MatchDayBanner store={store} onWatch={(id) => setMatch({ id, watch: true })} />}
            <nav className="tabs" role="tablist">
              {(["myteam", "schedule", "standings", "brackets", "summary"] as const)
                .filter((t) => t !== "myteam" || state.gm)
                .map((t) => (
                  <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)}>
                    {t === "myteam" ? "My Team" : t[0]!.toUpperCase() + t.slice(1)}
                  </button>
                ))}
            </nav>
            {tab === "myteam" && state.gm && <MyTeam store={store} nav={nav} />}
            {tab === "schedule" && <Schedule store={store} nav={nav} />}
            {tab === "standings" && <Standings store={store} />}
            {tab === "brackets" && <Brackets store={store} nav={nav} selected={bracketEvent} onSelect={setBracketEvent} />}
            {tab === "summary" && <Summary store={store} nav={nav} />}
          </>
        )}
      </main>
    </div>
  );
}

// Keep the bundled data warm so the first season switch is instant.
for (const id of SEASON_IDS) loadSeasonData(id);
