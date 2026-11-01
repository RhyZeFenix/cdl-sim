import { useEffect, useRef, useState } from "react";
import { DIFFICULTY, SEASON_IDS, advance, isDone, loadSeasonData, seasonLabel, visibleInbox, type Difficulty, type Season, type SeasonId, type Step } from "../engine";
import { randomSeed, useSeason, type SeasonConfig, type SimKind } from "./useSeason";
import { Standings } from "./views/Standings";
import { Schedule } from "./views/Schedule";
import { Brackets } from "./views/Brackets";
import { MatchView } from "./views/MatchView";
import { Compare } from "./views/Compare";
import { arrowKeys } from "./views/common";
import { Summary } from "./views/Summary";
import { MyTeam } from "./views/MyTeam";
import { VetoScreen } from "./views/VetoScreen";
import { BetweenMaps } from "./views/BetweenMaps";
import { MatchDayBanner } from "./views/MatchDay";
import { Office } from "./views/Office";
import { PlayerPage } from "./views/PlayerPage";
import { SavesPanel } from "./views/SavesPanel";
import { TeamPage } from "./views/TeamPage";
import { Records } from "./views/Records";
import { Odds } from "./views/Odds";
import { About } from "./views/About";
import { MapsTab } from "./views/MapsTab";
import { applyTheme, savedContrast, savedTheme, type Theme } from "./theme";
import { readShare, shareUrl } from "./share";

type Tab = "office" | "myteam" | "schedule" | "standings" | "brackets" | "odds" | "records" | "compare" | "maps" | "summary" | "about";

const TAB_LABEL: Record<Tab, string> = {
  office: "Office",
  myteam: "My Team",
  schedule: "Schedule",
  standings: "Standings",
  brackets: "Brackets",
  odds: "Odds",
  records: "Records",
  compare: "Compare",
  maps: "Maps",
  summary: "Summary",
  about: "About",
};

export interface Nav {
  openMatch(id: string, opts?: { watch?: boolean; party?: string[] }): void;
  /** Watch a run of matches in order (an event's bracket), each revealed map by map. */
  watchParty(ids: string[]): void;
  openBracket(eventIndex: number): void;
  openPlayer(id: string): void;
  openTeam(id: string): void;
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
  const [match, setMatch] = useState<{ id: string; watch: boolean; party?: string[] } | null>(null);
  const [player, setPlayer] = useState<string | null>(null);
  const [teamPage, setTeamPage] = useState<string | null>(null);
  const [theme, setTheme] = useState<Theme>(savedTheme);
  const [contrast, setContrast] = useState(savedContrast);
  useEffect(() => applyTheme(theme, contrast), [theme, contrast]);
  const [bracketEvent, setBracketEvent] = useState<number | null>(null);
  const [setupOpen, setSetupOpen] = useState(false);
  const [savesOpen, setSavesOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const lastKind = useRef<SimKind>("step");
  const draftData = loadSeasonData(draft.seasonId);

  useEffect(() => setDraft(store.config), [store.config]);

  // On open: a shared link wins; otherwise pick up the autosave.
  useEffect(() => {
    const share = readShare();
    if (share) {
      store.start(share.config);
      if (share.step > 0) {
        store.mutate((s, d) => {
          while (s.next < share.step && !isDone(s) && advance(s, d));
        });
      }
      setTab(share.config.gmTeam ? "office" : "schedule");
      setNotice(`Opened a shared season${share.step ? ` at step ${share.step}` : ""}. It's the same season the link was made from.`);
      history.replaceState(null, "", location.pathname + location.search);
      return;
    }
    store
      .load("autosave")
      .then((ok) => {
        if (!ok) return;
        setNotice("Picked up where you left off (autosave). Use New season to start fresh.");
      })
      .catch(() => {});
    // Only on first load.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (store.state.gm) setTab((t) => (t === "schedule" ? "office" : t));
    // When a save loads into GM mode, open the Office.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store.config.gmTeam]);

  const copyShare = async () => {
    const url = shareUrl(store.config, state.gm ? 0 : state.next);
    try {
      await navigator.clipboard.writeText(url);
      setNotice(state.gm ? "Link copied. It starts this GM season from the beginning (your decisions aren't in the link)." : "Link copied: it opens this season at this point.");
    } catch {
      setNotice(url);
    }
  };

  const nav: Nav = {
    openMatch: (id, opts) => {
      setPlayer(null);
      setTeamPage(null);
      setMatch({ id, watch: !!opts?.watch, party: opts?.party });
    },
    watchParty: (ids) => {
      if (!ids.length) return;
      setPlayer(null);
      setTeamPage(null);
      setMatch({ id: ids[0]!, watch: true, party: ids });
    },
    openBracket: (i) => {
      setBracketEvent(i);
      setMatch(null);
      setPlayer(null);
      setTeamPage(null);
      setTab("brackets");
    },
    openPlayer: (id) => {
      setMatch(null);
      setTeamPage(null);
      setPlayer(id);
    },
    openTeam: (id) => {
      setMatch(null);
      setPlayer(null);
      setTeamPage(id);
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
            {state.gm ? (
              <>
                {" "}
                · GM: <b>{data.season.teams.find((t) => t.id === state.gm!.team)?.abbr}</b> · {DIFFICULTY[state.options.difficulty ?? "normal"].label}
              </>
            ) : (
              <> · Commissioner</>
            )}
            {state.gm && state.options.champsOnly && !data.season.historical?.champsSeeds?.includes(state.gm.team) ? (
              <span className="muted"> (didn't make the real Champs)</span>
            ) : null}
          </span>
          <div className="spacer" />
          <button
            className={`btn ${setupOpen ? "primary" : ""}`}
            aria-expanded={setupOpen}
            onClick={() => {
              setSetupOpen(!setupOpen);
              setSavesOpen(false);
            }}
          >
            New season
          </button>
          <button
            className={`btn ${savesOpen ? "primary" : ""}`}
            aria-expanded={savesOpen}
            onClick={() => {
              setSavesOpen(!savesOpen);
              setSetupOpen(false);
            }}
            title="Save slots, autosave and file backups"
          >
            Saves
          </button>
          <button className="btn" onClick={copyShare} title="Copy a link that opens this exact season">
            Share
          </button>
          <button
            className="btn icon"
            onClick={() => setTheme(theme === "auto" ? "light" : theme === "light" ? "dark" : "auto")}
            title={`Theme: ${theme} (click to change)`}
            aria-label={`Theme: ${theme}`}
          >
            {theme === "auto" ? "◐" : theme === "light" ? "☀" : "☾"}
          </button>
          <button className={`btn icon ${contrast ? "primary" : ""}`} aria-pressed={contrast} onClick={() => setContrast(!contrast)} title="High contrast" aria-label="High contrast">
            ◑
          </button>
          <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={(e) => onImport(e.target.files?.[0])} />
        </div>

        {savesOpen && <SavesPanel store={store} onImportFile={() => fileRef.current?.click()} onClose={() => setSavesOpen(false)} />}
        {notice && (
          <div className="notice">
            <span>{notice}</span>
            <button className="btn small" onClick={() => setNotice(null)} aria-label="Dismiss">
              ✕
            </button>
          </div>
        )}

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
            {draft.gmTeam && (
              <div className="field">
                Difficulty
                <span className="seg" role="group" aria-label="Difficulty">
                  {(Object.keys(DIFFICULTY) as Difficulty[]).map((d) => (
                    <button key={d} aria-pressed={(draft.difficulty ?? "normal") === d} title={DIFFICULTY[d].blurb} onClick={() => setDraft({ ...draft, difficulty: d })}>
                      {DIFFICULTY[d].label}
                    </button>
                  ))}
                </span>
              </div>
            )}
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
                <label className="row" style={{ gap: 4 }} title="Players run as hot or cold at each event as they really did (K/D per event from the CoD Esports Wiki). Historical ratings only.">
                  <input type="checkbox" disabled={draft.ratingMode !== "historical"} checked={!!draft.realForm && draft.ratingMode === "historical"} onChange={(e) => setDraft({ ...draft, realForm: e.target.checked })} style={{ width: "auto" }} />
                  Real form
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
          <MatchView key={match.id} store={store} seriesId={match.id} autoWatch={match.watch} party={match.party} onBack={() => setMatch(null)} nav={nav} />
        ) : player ? (
          <PlayerPage store={store} id={player} nav={nav} onBack={() => setPlayer(null)} />
        ) : teamPage ? (
          <TeamPage store={store} team={teamPage} nav={nav} onBack={() => setTeamPage(null)} />
        ) : (
          <>
            {spoil.active && <MatchDayBanner store={store} onWatch={(id) => setMatch({ id, watch: true })} />}
            <nav className="tabs" role="tablist" aria-label="Sections" onKeyDown={arrowKeys}>
              {(["office", "myteam", "schedule", "standings", "brackets", "odds", "records", "compare", "maps", "summary", "about"] as const)
                .filter((t) => (t !== "myteam" && t !== "office") || state.gm)
                .map((t) => (
                  <button key={t} role="tab" aria-selected={tab === t} tabIndex={tab === t ? 0 : -1} onClick={() => setTab(t)}>
                    {TAB_LABEL[t]}
                    {t === "office" && unread > 0 ? <span className="next-tag" style={{ marginLeft: 6 }}>{unread}</span> : null}
                  </button>
                ))}
            </nav>
            {tab === "office" && state.gm && <Office store={store} nav={nav} />}
            {tab === "myteam" && state.gm && <MyTeam store={store} nav={nav} />}
            {tab === "schedule" && <Schedule store={store} nav={nav} />}
            {tab === "standings" && <Standings store={store} nav={nav} />}
            {tab === "brackets" && <Brackets store={store} nav={nav} selected={bracketEvent} onSelect={setBracketEvent} />}
            {tab === "summary" && <Summary store={store} nav={nav} />}
            {tab === "odds" && <Odds store={store} nav={nav} />}
            {tab === "records" && <Records store={store} nav={nav} />}
            {tab === "compare" && <Compare store={store} nav={nav} />}
            {tab === "about" && <About store={store} />}
            {tab === "maps" && <MapsTab store={store} />}
          </>
        )}
      </main>
    </div>
  );
}

// Keep the bundled data warm so the first season switch is instant.
for (const id of SEASON_IDS) loadSeasonData(id);
