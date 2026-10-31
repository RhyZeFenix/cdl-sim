// The GM's veto for a paused series: lock in a lineup (and Team A/B as the higher seed),
// then answer each of your decisions while the opponent's AI answers instantly.
import { useMemo, useRef, useState } from "react";
import {
  aiChooser,
  createRng,
  gmSetPauseBetweenMaps,
  gmVetoSession,
  mapValue,
  playerInfo,
  submitGmVeto,
  type GmVetoContext,
  type Mode,
  type Side,
  type VetoRecord,
} from "../../engine";
import { directory } from "../names";
import type { SeasonStore } from "../useSeason";

const MODE_NAME: Record<Mode, string> = { hp: "Hardpoint", snd: "Search & Destroy", control: "Control", overload: "Overload" };

function Chips({ records, abbr }: { records: VetoRecord[]; abbr: [string, string] }) {
  if (!records.length) return <div className="muted">No decisions yet.</div>;
  return (
    <div className="veto">
      {records.map((v, i) =>
        v.action === "side" ? (
          <span key={i} className="vchip">
            <span className="k">SIDE</span> {abbr[v.team]} · Map {v.slot}: {v.side}
          </span>
        ) : v.action === "skip-ban" ? (
          <span key={i} className="vchip skip">
            <span className="k">NO BAN</span> {abbr[v.team]} · {v.mode.toUpperCase()}
          </span>
        ) : (
          <span key={i} className={`vchip ${v.action}`}>
            <span className="k">{v.action === "remaining" ? "LEFT" : v.action.toUpperCase()}</span>
            {"team" in v ? `${abbr[v.team]} · ` : ""}
            {"slot" in v ? `Map ${v.slot}: ` : ""}
            {v.map} {v.mode.toUpperCase()}
          </span>
        ),
      )}
    </div>
  );
}

export function VetoScreen({ store, onPlayed }: { store: SeasonStore; onPlayed: (seriesId: string) => void }) {
  const { state, data, mutate } = store;
  const gm = state.gm!;
  const pending = state.pending!;
  const dir = directory(data);
  const idx = { get: (id: string) => playerInfo(state, data, id) };
  const { spec, gmSide } = pending;
  const oppSide: Side = gmSide === 0 ? 1 : 0;
  const abbr: [string, string] = [dir.team(spec.teams[0]).abbr, dir.team(spec.teams[1]).abbr];

  const [lineup, setLineup] = useState<string[]>(gm.starters);
  const [teamA, setTeamA] = useState<Side>(0);
  const ctxRef = useRef<GmVetoContext | null>(null);
  const answers = useRef<string[]>([]);
  const [, setTick] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const tick = () => setTick((t) => t + 1);
  const ctx = ctxRef.current;

  const start = () => {
    try {
      ctxRef.current = gmVetoSession(state, data, lineup, gmSide === 0 ? teamA : undefined);
      answers.current = [];
      setError(null);
      tick();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };
  const answer = (c: string) => {
    ctx!.session.answer(c);
    answers.current.push(c);
    tick();
  };
  const autoFinish = () => {
    const ai = aiChooser(ctx!.teams, gmSide, createRng(`${state.options.seed}/gm-auto/${spec.id}`));
    while (ctx!.session.pending) answer(ai(ctx!.session.pending));
  };
  const play = () => {
    const err = mutate((s) =>
      submitGmVeto(s, { teamA: gmSide === 0 ? ctx!.teamA : undefined, answers: answers.current, lineup }),
    );
    if (err) setError(err);
    else onPlayed(spec.id);
  };

  // Mode strength (lineup average, 0-100) for each side, to inform picks and bans.
  const strengths = useMemo(() => {
    if (!ctx) return null;
    const modes: Mode[] = ["hp", "snd", data.season.thirdMode];
    return modes.map((m) => ({ m, v: ctx.teams.map((t) => mapValue(t, m, "") * 100) as [number, number] }));
  }, [ctx, data]);

  const req = ctx?.session.pending ?? null;

  return (
    <div>
      <div className="card">
        <div className="pill">Your match · Bo{spec.bestOf}</div>
        <h2 style={{ margin: "2px 0 4px" }}>
          {dir.team(spec.teams[gmSide]).name} vs {dir.team(spec.teams[oppSide]).name}
        </h2>
        <div className="sub">
          {spec.label} · {spec.date}
        </div>
        {error && <div className="sub" style={{ color: "var(--ban)", marginTop: 6 }}>{error}</div>}
      </div>

      {!ctx ? (
        <div className="card">
          <h3 style={{ marginBottom: 8 }}>1 · Lock in your lineup</h3>
          <div className="veto" style={{ marginBottom: 12 }}>
            {gm.roster.map((id) => {
              const on = lineup.includes(id);
              return (
                <button
                  key={id}
                  className="btn"
                  aria-pressed={on}
                  style={on ? { borderColor: "var(--text)", fontWeight: 600 } : undefined}
                  onClick={() => setLineup(on ? lineup.filter((p) => p !== id) : [...lineup, id])}
                >
                  {on ? "✓ " : ""}
                  {idx.get(id)?.handle ?? id}
                </button>
              );
            })}
          </div>
          {gmSide === 0 && (
            <div className="row" style={{ marginBottom: 12 }}>
              <span className="sub">You're the higher seed — act as:</span>
              <div className="seg" role="group" aria-label="Team A or B">
                {([0, 1] as const).map((a) => (
                  <button key={a} aria-pressed={teamA === a} onClick={() => setTeamA(a)}>
                    {a === 0 ? "Team A (first HP ban, picks Map 1)" : "Team B (first SnD ban, picks Map 2)"}
                  </button>
                ))}
              </div>
            </div>
          )}
          <button className="btn primary" disabled={lineup.length !== 4} onClick={start}>
            {lineup.length === 4 ? "Start veto" : `Pick 4 players (${lineup.length})`}
          </button>
        </div>
      ) : (
        <>
          <div className="card">
            <div className="card-head">
              <h3>2 · Veto</h3>
              <span className="sub">
                Team A: {abbr[ctx.teamA]}
                {gmSide !== 0 ? " (opponent's choice as higher seed)" : ""}
              </span>
              <div className="spacer" />
              {req && (
                <button className="btn small" onClick={autoFinish} title="Let the AI make your remaining decisions">
                  AI finish
                </button>
              )}
              <button className="btn small" onClick={() => ((ctxRef.current = null), tick())}>
                Restart
              </button>
            </div>
            {strengths && (
              <div className="sub" style={{ marginBottom: 10 }}>
                Lineup strength —{" "}
                {strengths.map(({ m, v }) => (
                  <span key={m} style={{ marginRight: 12 }}>
                    {MODE_NAME[m]}: <b>{v[gmSide].toFixed(1)}</b> vs {v[oppSide].toFixed(1)}
                  </span>
                ))}
              </div>
            )}
            <Chips records={ctx.session.records} abbr={abbr} />
            {req && (
              <div style={{ marginTop: 14 }}>
                <div style={{ fontWeight: 700, marginBottom: 6 }}>
                  {req.action === "ban"
                    ? `Your ban — ${MODE_NAME[req.mode]}`
                    : req.action === "pick"
                      ? `Your pick — Map ${req.slot} (${MODE_NAME[req.mode]})`
                      : `Your side — Map ${req.slot}: ${req.mapName} ${req.mode.toUpperCase()}`}
                </div>
                <div className="veto">
                  {req.options.map((o) => (
                    <button key={o} className="btn" onClick={() => answer(o)}>
                      {o}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {!req && (
            <div className="card">
              <h3 style={{ marginBottom: 8 }}>3 · Maps</h3>
              <div className="maps" style={{ marginBottom: 12 }}>
                {ctx.session.result().maps.map((m) => (
                  <div key={m.slot} className="mapcard" style={{ cursor: "default" }}>
                    <span className="pill">
                      Map {m.slot} · {MODE_NAME[m.mode]}
                    </span>
                    <b>{m.map}</b>
                    {m.side && (
                      <span className="sub">
                        {abbr[m.side.team]} chose {m.side.choice}
                      </span>
                    )}
                  </div>
                ))}
              </div>
              <div className="row">
                <button className="btn primary" onClick={play}>
                  Play series
                </button>
                <label className="field" title="Stop after each map to sub players in or out">
                  <input
                    type="checkbox"
                    checked={!!gm.pauseBetweenMaps}
                    onChange={(e) => mutate((s) => gmSetPauseBetweenMaps(s, e.target.checked))}
                    style={{ width: "auto" }}
                  />
                  Pause between maps for subs
                </label>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
