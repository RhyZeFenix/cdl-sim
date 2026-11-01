// Compare: two players or two teams side by side, with the better number in each row
// marked. Ratings respect scouting fog in GM mode; results leave out unwatched series.
import { useMemo, useState } from "react";
import { fogText, fogWidth, modeName, overall, playerIndex, playerProfile, pointsTable, type Mode } from "../../engine";
import type { Nav } from "../App";
import { directory } from "../names";
import { headToHead, teamProfile } from "../stats";
import type { SeasonStore } from "../useSeason";
import { PlayerLink, Seg } from "./common";

type Row = { label: string; a: number | undefined; b: number | undefined; fmt?: (x: number) => string; text?: [string, string]; lowerBetter?: boolean };

function Table({ heads, rows }: { heads: [React.ReactNode, React.ReactNode]; rows: Row[] }) {
  return (
    <table className="tbl compare">
      <thead>
        <tr>
          <th className="left">
            <span className="sr-only">Stat</span>
          </th>
          <th>{heads[0]}</th>
          <th>{heads[1]}</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => {
          const ok = r.a !== undefined && r.b !== undefined && r.a !== r.b;
          const aWins = ok && (r.lowerBetter ? r.a! < r.b! : r.a! > r.b!);
          const show = (x: number | undefined, i: 0 | 1) => r.text?.[i] ?? (x === undefined ? "—" : r.fmt ? r.fmt(x) : String(Math.round(x)));
          return (
            <tr key={r.label}>
              <td className="left">{r.label}</td>
              <td className={ok && aWins ? "better" : undefined}>{show(r.a, 0)}</td>
              <td className={ok && !aWins ? "better" : undefined}>{show(r.b, 1)}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

const kd = (k: number, d: number) => k / Math.max(1, d);
const f2 = (x: number) => x.toFixed(2);
const pctF = (x: number) => `${Math.round(x * 100)}%`;
const MODES: Mode[] = ["hp", "snd", "control", "overload"];

export function Compare({ store, nav }: { store: SeasonStore; nav: Nav }) {
  const [kind, setKind] = useState<"players" | "teams">("players");
  return (
    <div>
      <div className="row" style={{ marginBottom: 12 }}>
        <Seg
          label="Compare"
          value={kind}
          onChange={setKind}
          options={[
            { value: "players", label: "Players" },
            { value: "teams", label: "Teams" },
          ]}
        />
      </div>
      {kind === "players" ? <Players store={store} nav={nav} /> : <Teams store={store} nav={nav} />}
    </div>
  );
}

function Players({ store, nav }: { store: SeasonStore; nav: Nav }) {
  const { state, data, spoil, version } = store;
  const all = useMemo(
    () => [...playerIndex(data).values()].map((p) => ({ id: p.id, handle: p.handle })).sort((a, b) => a.handle.localeCompare(b.handle)),
    [data],
  );
  const [ids, setIds] = useState<[string, string]>([all[0]?.id ?? "", all[1]?.id ?? ""]);
  const profs = useMemo(() => ids.map((id) => playerProfile(state, data, id, spoil.hidden)), [ids, state, data, version]);
  const third = data.season.thirdMode;
  const val = (i: 0 | 1, key: "slaying" | "hp_obj" | "snd_iq" | "third_mode" | "clutch" | "consistency" | "ovr") => {
    const p = profs[i]!.info;
    if (!p) return undefined;
    return key === "ovr" ? overall(p.ratings) : p.ratings[key];
  };
  const fogged = ids.map((id) => fogWidth(state, data, id));
  const ratingRow = (key: Parameters<typeof val>[1], label: string): Row => {
    const a = val(0, key);
    const b = val(1, key);
    const anyFog = fogged[0]! > 0 || fogged[1]! > 0;
    return {
      label,
      a,
      b,
      text: anyFog ? [a === undefined ? "—" : fogText(a, fogged[0]!, `${ids[0]}/${key}`), b === undefined ? "—" : fogText(b, fogged[1]!, `${ids[1]}/${key}`)] : undefined,
    };
  };
  const modeKd = (i: 0 | 1, m: Mode) => {
    const line = profs[i]!.modes.find((x) => x.mode === m);
    return line && line.maps ? kd(line.kills, line.deaths) : undefined;
  };
  const rows: Row[] = [
    ratingRow("ovr", "Overall"),
    ratingRow("slaying", "Slaying"),
    ratingRow("hp_obj", "Hardpoint"),
    ratingRow("snd_iq", "SnD"),
    ratingRow("third_mode", third === "control" ? "Control" : "Overload"),
    ratingRow("clutch", "Clutch"),
    ratingRow("consistency", "Consistency"),
    { label: "Maps played", a: profs[0]!.total.maps, b: profs[1]!.total.maps },
    { label: "Season K/D", a: profs[0]!.total.maps ? kd(profs[0]!.total.kills, profs[0]!.total.deaths) : undefined, b: profs[1]!.total.maps ? kd(profs[1]!.total.kills, profs[1]!.total.deaths) : undefined, fmt: f2 },
    ...MODES.filter((m) => m === "hp" || m === "snd" || m === third).map((m) => ({ label: `${modeName(m)} K/D`, a: modeKd(0, m), b: modeKd(1, m), fmt: f2 })),
    { label: "Series win rate", a: rate(profs[0]!.series), b: rate(profs[1]!.series), fmt: pctF },
    { label: "Age", a: profs[0]!.age, b: profs[1]!.age, lowerBetter: true },
  ];
  const pick = (i: 0 | 1) => (
    <select className="plain" value={ids[i]} onChange={(e) => setIds(i === 0 ? [e.target.value, ids[1]] : [ids[0], e.target.value])} aria-label={`Player ${i + 1}`}>
      {all.map((p) => (
        <option key={p.id} value={p.id}>
          {p.handle}
        </option>
      ))}
    </select>
  );
  return (
    <div className="card">
      <div className="card-head">
        <h3>Players</h3>
        <span className="row" style={{ gap: 6 }}>
          {pick(0)} <span className="muted">vs</span> {pick(1)}
        </span>
      </div>
      <Table
        heads={[
          <PlayerLink key="a" id={ids[0]} name={profs[0]!.info?.handle ?? ids[0]} nav={nav} />,
          <PlayerLink key="b" id={ids[1]} name={profs[1]!.info?.handle ?? ids[1]} nav={nav} />,
        ]}
        rows={rows}
      />
      {(fogged[0]! > 0 || fogged[1]! > 0) && <div className="sub" style={{ marginTop: 6 }}>Ranges are scouting estimates; a better analyst, scrims and playing them narrow them.</div>}
    </div>
  );
}

const rate = (series: { won: boolean }[]) => (series.length ? series.filter((s) => s.won).length / series.length : undefined);

function Teams({ store, nav }: { store: SeasonStore; nav: Nav }) {
  const { state, data, spoil, version } = store;
  const dir = directory(data);
  const teams = data.season.teams;
  const [ids, setIds] = useState<[string, string]>([teams[0]!.id, teams[1]!.id]);
  const profs = useMemo(() => ids.map((id) => teamProfile(state, data, id, spoil.hidden)), [ids, state, data, version]);
  const table = useMemo(() => pointsTable(state, data, spoil.points, spoil.hidden), [state, data, version]);
  const h2h = useMemo(() => headToHead(state, ids[0], ids[1], spoil.hidden), [state, ids, version]);
  const pts = (id: string) => table.find((r) => r.team === id)?.points;
  const rank = (id: string) => {
    const i = table.findIndex((r) => r.team === id);
    return i < 0 ? undefined : i + 1;
  };
  const modeRate = (i: 0 | 1, m: Mode) => {
    const ls = profs[i]!.byMap.filter((x) => x.mode === m);
    const w = ls.reduce((s, x) => s + x.w, 0);
    const l = ls.reduce((s, x) => s + x.l, 0);
    return w + l ? w / (w + l) : undefined;
  };
  const third = data.season.thirdMode;
  const strength = (i: 0 | 1) => profs[i]!.strength[profs[i]!.strength.length - 1]?.ovr;
  const sr = (i: 0 | 1) => (profs[i]!.series.length ? profs[i]!.wins / profs[i]!.series.length : undefined);
  const mr = (i: 0 | 1) => {
    const [w, l] = profs[i]!.maps;
    return w + l ? w / (w + l) : undefined;
  };
  const h2hWins = (id: string) => h2h.filter((r) => r.winner === id).length;
  const rows: Row[] = [
    { label: "CDL points", a: pts(ids[0]), b: pts(ids[1]) },
    { label: "Points rank", a: rank(ids[0]), b: rank(ids[1]), lowerBetter: true },
    { label: "Series won", a: profs[0]!.wins, b: profs[1]!.wins },
    { label: "Series win rate", a: sr(0), b: sr(1), fmt: pctF },
    { label: "Map win rate", a: mr(0), b: mr(1), fmt: pctF },
    ...MODES.filter((m) => m === "hp" || m === "snd" || m === third).map((m) => ({ label: `${modeName(m)} win rate`, a: modeRate(0, m), b: modeRate(1, m), fmt: pctF })),
    { label: "Lineup overall (Champs)", a: strength(0), b: strength(1), fmt: (x: number) => x.toFixed(1) },
    { label: "Head to head", a: h2hWins(ids[0]), b: h2hWins(ids[1]) },
  ];
  const pick = (i: 0 | 1) => (
    <select className="plain" value={ids[i]} onChange={(e) => setIds(i === 0 ? [e.target.value, ids[1]] : [ids[0], e.target.value])} aria-label={`Team ${i + 1}`}>
      {teams.map((t) => (
        <option key={t.id} value={t.id}>
          {t.name}
        </option>
      ))}
    </select>
  );
  return (
    <div className="card">
      <div className="card-head">
        <h3>Teams</h3>
        <span className="row" style={{ gap: 6 }}>
          {pick(0)} <span className="muted">vs</span> {pick(1)}
        </span>
      </div>
      <Table
        heads={[
          <button key="a" className="linklike" onClick={() => nav.openTeam(ids[0])}>
            {dir.team(ids[0]).abbr}
          </button>,
          <button key="b" className="linklike" onClick={() => nav.openTeam(ids[1])}>
            {dir.team(ids[1]).abbr}
          </button>,
        ]}
        rows={rows}
      />
      {h2h.length > 0 && (
        <div className="sub" style={{ marginTop: 6 }}>
          Meetings:{" "}
          {h2h.map((r, i) => (
            <span key={r.id}>
              {i > 0 && " · "}
              <button className="linklike" onClick={() => nav.openMatch(r.id)}>
                {r.label}: {dir.team(r.winner).abbr} {Math.max(...r.score)}–{Math.min(...r.score)}
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
