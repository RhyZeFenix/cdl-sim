import { useEffect, useRef, useState } from "react";
import { SEASON_IDS, loadSeasonData, seasonLabel, visibleInbox, type Season, type SeasonId, type Step } from "../engine";
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
import { Office } from "./views/Office";
import { PlayerPage } from "./views/PlayerPage";

type Tab = "office" | "myteam" | "schedule" | "standings" | "brackets" | "summary";

export interface Nav {
  openMatch(id: string, opts?: { watch?: boolean }): void;
  openBracket(eventIndex: number): void;
  openPlayer(id: string): void;
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
  const [player, setPlayer] = useState<string | null>(null);
  const [bracketEvent, setBracketEvent] = useState<number | null>(null);
  const [setupOpen, setSetupOpen] = useState(false);
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
    openMatch: (id, opts) => {
      setPlayer(null);
      setMatch({ id, watch: !!opts?.watch });
    },
    openBracket: (i) => {
      setBracketEvent(i);
      setMatch(null);
      setPlayer(null);
      setTab("brackets");
    },
    openPlayer: (id) => {
      setMatch(null);
      setPlayer(id);
    },
  };

  const startNew = () => {
    if (state.next > 0 && !confirm("Start a new season? Unsaved progress on this one will be lost.")) return;
    store.start(draft);
    setSetupOpen(false);
    setMatch(null);
    setPlayer(null);
    setBracketEvent(null);
    setTab(draft.gmTeam ? "office" : "schedule");
  };

  const runSim = async (kind: SimKind) => {
    lastKind.current = kind;
    const out = await store.sim(kind);
    if (afterMatchDay(out.matchDay)) return;
    if (out.paused) setMatch(null);
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
  const resume = async () => {
    const out = await store.sim(lastKind.current);
    afterMatchDay(out.matchDay);
  };

  /**
   * Match day: when a match you're watching (or your GM match) is ready, go back to the
   * tabs so the banner offers Watch or Skip. Returns true if it handled things.
   */
  function afterMatchDay(unwatched: string[]): boolean {
    if (!unwatched.length) return false;
    setMatch(null);
    setPlayer(null);
    return true;
  }

  const next = state.steps[state.next];
  const spoil = store.spoil;
  const unread = state.gm ? visibleInbox(state, spoil.hidden).filter((i) => !i.read).length : 0;
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
          <span className="status">
            {seasonLabel(state, data)} · seed <b>{state.options.seed}</b> · {state.options.ratingMode}
            {state.options.chaos ? <> · <b>Chaos</b></> : null}
            {state.options.champsOnly ? <> · <b>Champs only</b> (real seeds)</> : null}
            {state.gm ? <> · GM: <b>{data.season.teams.find((t) => t.id === state.gm!.team)?.abbr}</b></> : <> · Commissioner</>}
            {state.gm && state.options.champsOnly && !data.season.historical?.champsSeeds?.includes(state.gm.team) ? (
              <span className="muted"> (didn't make the real Champs)</span>
            ) : null}
          </span>
          <div className="spacer" />
          <button className={`btn ${setupOpen ? "primary" : ""}`} aria-expanded={setupOpen} onClick={() => setSetupOpen(!setupOpen)}>
            New season
          </button>
          <button className="btn" onClick={store.exportJson} title="Download this season as a JSON file">
            Save
          </button>
          <button className="btn" onClick={() => fileRef.current?.click()} title="Load a saved season">
            Load
          </button>
          <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={(e) => onImport(e.target.files?.[0])} />
        </div>

        {setupOpen && (
          <div className="setup">
            <label className="field">
              Game
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
              <span className="row" style={{ gap: 4 }}>
                <input value={draft.seed} onChange={(e) => setDraft({ ...draft, seed: e.target.value.trim() })} spellCheck={false} />
                <button className="btn icon" title="Random seed" aria-label="Random seed" onClick={() => setDraft({ ...draft, seed: randomSeed() })}>
                  ⟳
                </button>
              </span>
            </label>
            <div className="field">
              Mode
              <span className="row" style={{ gap: 6 }}>
                <span className="seg" role="group" aria-label="Mode">
                  <button aria-pressed={!draft.gmTeam} onClick={() => setDraft({ ...draft, gmTeam: undefined })} title="Watch the whole league; no team of your own">
                    Commissioner
                  </button>
                  <button aria-pressed={!!draft.gmTeam} onClick={() => setDraft({ ...draft, gmTeam: draft.gmTeam ?? draftData.season.teams[0]!.id })} title="Run one team: roster, vetoes, prep, contracts">
                    GM
                  </button>
                </span>
                {draft.gmTeam && (
                  <select className="plain" aria-label="GM team" value={draft.gmTeam} onChange={(e) => setDraft({ ...draft, gmTeam: e.target.value })}>
                    {draftData.season.teams.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                )}
              </span>
            </div>
            <div className="field">
              Ratings
              <span className="seg" role="group" aria-label="Ratings">
                {(["historical", "randomized"] as const).map((m) => (
                  <button key={m} aria-pressed={draft.ratingMode === m} onClick={() => setDraft({ ...draft, ratingMode: m })}>
                    {m === "historical" ? "Historical" : "Randomized"}
                  </button>
                ))}
              </span>
            </div>
            <div className="field">
              Format
              <span className="row" style={{ gap: 8 }}>
                <span className="seg" role="group" aria-label="Season length">
                  <button aria-pressed={!draft.champsOnly} onClick={() => setDraft({ ...draft, champsOnly: false })}>
                    Full season
                  </button>
                  <button aria-pressed={!!draft.champsOnly} title="Skip the regular season and play Champs from the real seeds" onClick={() => setDraft({ ...draft, champsOnly: true })}>
                    Champs only
                  </button>
                </span>
                <label className="row" style={{ gap: 4 }} title="Hot and cold weekends: each team's form swings per event, so upsets and surprise runs are far more common">
                  <input type="checkbox" checked={!!draft.chaos} onChange={(e) => setDraft({ ...draft, chaos: e.target.checked })} style={{ width: "auto" }} />
                  Chaos
                </label>
              </span>
            </div>
            <div className="setup-actions">
              <button className="btn primary" onClick={startNew} disabled={!draft.seed}>
                Start season
              </button>
              <button
                className="btn"
                onClick={() => {
                  setDraft(store.config);
                  setSetupOpen(false);
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        <div className="row">
          <span className="status">
            {done && !spoil.active ? (
              <b>Season complete</b>
            ) : spoil.active ? (
              <b>{spoil.unwatched.some((id) => state.gm && state.series[id]?.teams.includes(state.gm.team)) ? "Match day — your result is ready" : "Ready to watch"}</b>
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
          <span className="sub" title="Pick matches to watch on the Schedule; everything else is simmed instantly">
            {(state.watchlist?.length ?? 0) > 0 ? `${state.watchlist!.length} on your watchlist` : "Tip: hit Watch on any match in the Schedule"}
          </span>
          <button className="btn primary" disabled={busy || done || blocked} onClick={() => runSim("step")}>
            {next && next.kind !== "week" ? `Sim ${stepLabel(data.season, next)}` : "Sim week"}
          </button>
          <button className="btn" disabled={busy || done || blocked} onClick={() => runSim("stage")}>
            Sim stage
          </button>
          <button className="btn" disabled={busy || done || blocked} onClick={() => runSim("season")}>
            Sim season
          </button>
        </div>
        {error && <div className="sub" style={{ color: "var(--ban)" }}>Load failed: {error}</div>}
      </header>

      <main className={busy ? "busy" : ""} key={`${state.seasonId}-${state.options.seed}-${store.config.ratingMode}-${state.gm?.team ?? ""}`}>
        {paused && state.pending!.between ? (
          <BetweenMaps key={`${state.pending!.spec.id}-${state.pending!.between.nextSlot}`} store={store} onPlayed={resume} />
        ) : paused ? (
          <VetoScreen key={state.pending!.spec.id} store={store} onPlayed={resume} />
        ) : match ? (
          <MatchView store={store} seriesId={match.id} autoWatch={match.watch} onBack={() => setMatch(null)} nav={nav} />
        ) : player ? (
          <PlayerPage store={store} id={player} nav={nav} onBack={() => setPlayer(null)} />
        ) : (
          <>
            {spoil.active && <MatchDayBanner store={store} onWatch={(id) => setMatch({ id, watch: true })} />}
            <nav className="tabs" role="tablist">
              {(["office", "myteam", "schedule", "standings", "brackets", "summary"] as const)
                .filter((t) => (t !== "myteam" && t !== "office") || state.gm)
                .map((t) => (
                  <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)}>
                    {t === "myteam" ? "My Team" : t[0]!.toUpperCase() + t.slice(1)}
                    {t === "office" && unread > 0 ? <span className="next-tag" style={{ marginLeft: 6 }}>{unread}</span> : null}
                  </button>
                ))}
            </nav>
            {tab === "office" && state.gm && <Office store={store} nav={nav} />}
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
