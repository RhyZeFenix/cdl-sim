// Title odds: simulate the rest of the season many times from where it stands and
// count how often each team makes Champs, wins a Major or wins it all.
import { useState } from "react";
import type { Nav } from "../App";
import { directory } from "../names";
import type { TeamOdds } from "../simWorker";
import type { SeasonStore } from "../useSeason";
import { TeamLink } from "./common";

const RUN_OPTIONS = [50, 100, 250];

export function Odds({ store, nav }: { store: SeasonStore; nav: Nav }) {
  const { state, data, spoil, done } = store;
  const dir = directory(data);
  const [runs, setRuns] = useState(100);
  const [result, setResult] = useState<{ odds: TeamOdds[]; runs: number; at: number } | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const stale = result && result.at !== state.next;
  const pct = (x: number) => (x >= 0.995 ? "100%" : x < 0.005 ? (x > 0 ? "<1%" : "—") : `${Math.round(x * 100)}%`);

  const run = async () => {
    setErr(null);
    setProgress(0);
    try {
      const odds = await store.odds(runs, setProgress);
      setResult({ odds, runs, at: state.next });
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setProgress(null);
    }
  };

  return (
    <div className="card">
      <div className="card-head">
        <h3>Title odds</h3>
        <span className="sub">Simulates the rest of the season from where it stands. Results already played stay as they are.</span>
        <div className="spacer" />
        <div className="seg" role="group" aria-label="Simulations">
          {RUN_OPTIONS.map((n) => (
            <button key={n} aria-pressed={runs === n} onClick={() => setRuns(n)}>
              {n} runs
            </button>
          ))}
        </div>
        <button className="btn primary" disabled={progress !== null || done || spoil.active} onClick={run}>
          {progress !== null ? `Running… ${progress}/${runs}` : result ? "Run again" : "Run"}
        </button>
      </div>
      {spoil.active && <div className="sub">Watch or skip your waiting match first: the odds would give its result away.</div>}
      {done && <div className="sub">The season is over.</div>}
      {err && <div className="sub" style={{ color: "var(--ban)" }}>{err}</div>}
      {progress !== null && (
        <span className="meter" aria-hidden style={{ marginBottom: 8 }}>
          <span style={{ width: `${(100 * progress) / runs}%` }} />
        </span>
      )}
      {result && (
        <>
          {stale && <div className="sub" style={{ marginBottom: 6 }}>The season has moved on since these were run. Run again to update.</div>}
          <table className="tbl">
            <thead>
              <tr>
                <th className="left">Team</th>
                <th>Win Champs</th>
                <th>Make Champs</th>
                <th>Win a Major</th>
                <th>Avg points</th>
                <th>Avg rank</th>
              </tr>
            </thead>
            <tbody>
              {result.odds.map((o) => (
                <tr key={o.team}>
                  <td className="left">
                    <TeamLink team={dir.team(o.team)} nav={nav} />
                  </td>
                  <td>
                    <OddsBar value={o.winChamps} label={pct(o.winChamps)} />
                  </td>
                  <td>{pct(o.makeChamps)}</td>
                  <td>{pct(o.winMajor)}</td>
                  <td>{Math.round(o.avgPoints)}</td>
                  <td>{o.avgRank.toFixed(1)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="sub" style={{ marginTop: 6 }}>
            From {result.runs} simulations. With fewer runs, small odds are rough: 1 run in {result.runs} is {Math.round(1000 / result.runs) / 10}%.
          </div>
        </>
      )}
    </div>
  );
}

function OddsBar({ value, label }: { value: number; label: string }) {
  return (
    <span className="oddsbar" title={label}>
      <span style={{ width: `${Math.min(100, value * 100)}%` }} />
      <b>{label}</b>
    </span>
  );
}
