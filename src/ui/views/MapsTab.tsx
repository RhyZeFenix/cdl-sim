// The Maps tab: kill and death heatmaps for any map this season, and the map editor.
import { useMemo, useState } from "react";
import type { Mode } from "../../engine";
import { HEAT_N, type Heatmap } from "../heatmap";
import { directory } from "../names";
import { layoutFor } from "../replay/layouts";
import { allBlocks } from "../replay/shapes";
import { DEFAULT_THEME } from "../replay/themes";
import type { SeasonStore } from "../useSeason";
import { Seg } from "./common";
import { MapEditor } from "./MapEditor";

export function MapsTab({ store }: { store: SeasonStore }) {
  const [view, setView] = useState<"heat" | "edit">("heat");
  return (
    <div>
      <div className="row" style={{ marginBottom: 12 }}>
        <Seg
          label="Maps view"
          value={view}
          onChange={setView}
          options={[
            { value: "heat", label: "Heatmaps" },
            { value: "edit", label: "Map editor" },
          ]}
        />
      </div>
      {view === "heat" ? <Heatmaps store={store} /> : <MapEditor />}
    </div>
  );
}

function Heatmaps({ store }: { store: SeasonStore }) {
  const { state, data, spoil, version } = store;
  const dir = directory(data);
  // Map + mode combinations played this season (watched ones).
  const played = useMemo(() => {
    const seen = new Map<string, { map: string; mode: Mode; n: number }>();
    for (const r of Object.values(state.series)) {
      if (spoil.isHidden(r.id)) continue;
      for (const m of r.maps) {
        const k = `${m.mode}:${m.map}`;
        const e = seen.get(k) ?? { map: m.map, mode: m.mode, n: 0 };
        e.n++;
        seen.set(k, e);
      }
    }
    return [...seen.values()].sort((a, b) => a.map.localeCompare(b.map) || a.mode.localeCompare(b.mode));
  }, [state, version]);
  const [pick, setPick] = useState(0);
  const [kind, setKind] = useState<"deaths" | "kills">("deaths");
  const [team, setTeam] = useState("");
  const [heat, setHeat] = useState<Heatmap | null>(null);
  const [progress, setProgress] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const cur = played[Math.min(pick, played.length - 1)];

  const run = async () => {
    if (!cur) return;
    setErr(null);
    setProgress("Starting…");
    try {
      const h = await store.heatmap({ map: cur.map, mode: cur.mode, kind, team: team || undefined, hidden: [...spoil.hidden] }, (d, t) => setProgress(`Rebuilding replays… ${d}/${t} series`));
      setHeat(h);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setProgress(null);
    }
  };

  if (!played.length) return <div className="card muted">Play some matches first: heatmaps come from the season's replays.</div>;
  const L = layoutFor(cur!.map, 5);
  const th = L.theme ?? DEFAULT_THEME;
  const cell = 100 / HEAT_N;

  return (
    <div className="card">
      <div className="card-head">
        <h3>Heatmaps</h3>
        <select
          className="plain"
          value={pick}
          onChange={(e) => {
            setPick(Number(e.target.value));
            setHeat(null);
          }}
          aria-label="Map"
        >
          {played.map((p, i) => (
            <option key={`${p.mode}:${p.map}`} value={i}>
              {p.map} {p.mode.toUpperCase()} ({p.n} maps)
            </option>
          ))}
        </select>
        <Seg
          label="What to show"
          value={kind}
          onChange={(k) => {
            setKind(k);
            setHeat(null);
          }}
          options={[
            { value: "deaths", label: "Where players die" },
            { value: "kills", label: "Where kills come from" },
          ]}
        />
        <select
          className="plain"
          value={team}
          onChange={(e) => {
            setTeam(e.target.value);
            setHeat(null);
          }}
          aria-label="Team"
        >
          <option value="">All teams</option>
          {data.season.teams.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
        <button className="btn primary" disabled={!!progress} onClick={run}>
          {progress ?? (heat ? "Rebuild" : "Build heatmap")}
        </button>
      </div>
      <div className="sub" style={{ marginBottom: 8 }}>
        Built from the replays of every {cur!.map} {cur!.mode.toUpperCase()} map this season{team ? ` involving ${dir.team(team).abbr}` : ""}. Positions come from
        the replay movement model, so this shows where fights cluster rather than exact real spots. Unwatched results are left out.
      </div>
      {err && <div className="sub" style={{ color: "var(--ban)" }}>{err}</div>}
      <svg viewBox="0 0 100 100" className="replay2d heat" role="img" aria-label={`${cur!.map} heatmap`}>
        <rect x={0} y={0} width={100} height={100} fill={th.ground} />
        {L.floor.map(([x0, y0, x1, y1], i) => (
          <rect key={i} x={x0} y={y0} width={x1 - x0} height={y1 - y0} fill={th.floor} />
        ))}
        {allBlocks(L).map((b, i) => (
          <rect
            key={`b${i}`}
            x={b.r[0]}
            y={b.r[1]}
            width={b.r[2] - b.r[0]}
            height={b.r[3] - b.r[1]}
            fill={b.water ? "#1f4a7a" : th.block}
            transform={b.rot ? `rotate(${b.rot} ${(b.r[0] + b.r[2]) / 2} ${(b.r[1] + b.r[3]) / 2})` : undefined}
          />
        ))}
        {heat &&
          heat.cells.map((c, i) =>
            c ? (
              <rect
                key={`h${i}`}
                x={(i % HEAT_N) * cell}
                y={Math.floor(i / HEAT_N) * cell}
                width={cell}
                height={cell}
                fill={kind === "deaths" ? "#ff3b30" : "#ffcc00"}
                opacity={0.15 + 0.75 * Math.sqrt(c / heat.max)}
              />
            ) : null,
          )}
      </svg>
      {heat && (
        <div className="sub" style={{ marginTop: 6 }}>
          {heat.events} {kind === "deaths" ? "deaths" : "kills"} over {heat.maps} maps. Brighter = more.
        </div>
      )}
    </div>
  );
}
