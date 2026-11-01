// Office › This week: the scouting report, weekly prep and the practice planner.
import { useMemo, useState } from "react";
import { FATIGUE, MAX_SCRIMS, PREP_BONUS, SCRIM_EDGE, gmSetScrims, isRival, PREP_MORALE, gmSetPrep, mapPoolFor, modeName, nextGmFixtures, nextStep, scoutReport, slotToMode, type Mode, type Prep } from "../../../engine";
import { stepLabel, type Nav } from "../../App";
import { directory } from "../../names";
import type { SeasonStore } from "../../useSeason";
import { PlayerLink } from "../common";
import { nextPhase, Meter, fmtMod } from "./shared";

export function Scouting({ store, nav }: { store: SeasonStore; nav: Nav }) {
  const { state, data, spoil, version } = store;
  const dir = directory(data);
  const fixtures = useMemo(() => nextGmFixtures(state, data), [state, data, version]);
  const [pick, setPick] = useState(0);
  const fx = fixtures[Math.min(pick, fixtures.length - 1)];
  const report = useMemo(() => (fx ? scoutReport(state, data, fx.opponent, fx.phase, spoil.hidden) : null), [fx, state, data, version]);
  const step = nextStep(state);

  if (!fx || !report) {
    return (
      <div className="card">
        <h3 style={{ marginBottom: 6 }}>Scouting</h3>
        <div className="muted">
          {step && step.kind !== "week" ? `${stepLabel(data.season, step)}: opponents are set by the bracket. A report appears when your match is up.` : "No match coming up."}
        </div>
      </div>
    );
  }
  return (
    <div className="card">
      <div className="card-head">
        <h3>
          Scouting: {dir.team(fx.opponent).name}
          {isRival(state, fx.opponent) && <span className="next-tag" style={{ marginLeft: 6 }}>Rival</span>}
        </h3>
        {fixtures.length > 1 && (
          <select className="plain" value={pick} onChange={(e) => setPick(Number(e.target.value))} aria-label="Opponent">
            {fixtures.map((f, i) => (
              <option key={i} value={i}>
                vs {dir.team(f.opponent).abbr}
              </option>
            ))}
          </select>
        )}
      </div>
      <div className="sub" style={{ marginBottom: 8 }}>
        {fx.label} · {report.record[0]}-{report.record[1]} this season · form{" "}
        {report.recent.length ? report.recent.map((r) => (r.won ? "W" : "L")).join(" ") : "—"} · roster edge{" "}
        <b style={{ color: report.edge >= 0 ? "var(--pick)" : "var(--ban)" }}>
          {report.edge >= 0 ? "+" : ""}
          {report.edge}
        </b>{" "}
        overall
      </div>
      <table className="tbl">
        <thead>
          <tr>
            <th className="left">Their lineup</th>
            <th>OVR</th>
            <th>K/D</th>
            <th>Maps</th>
          </tr>
        </thead>
        <tbody>
          {report.lineup.map((p) => (
            <tr key={p.id}>
              <td className="left">
                <PlayerLink id={p.id} name={p.handle} nav={nav} />
                {report.hottest?.id === p.id && <span className="next-tag" style={{ marginLeft: 6 }}>Hot</span>}
              </td>
              <td>{p.ovr}</td>
              <td>{p.kd !== undefined ? p.kd.toFixed(2) : "—"}</td>
              <td>{p.maps}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <h4 style={{ margin: "10px 0 4px" }}>Maps this week</h4>
      <table className="tbl">
        <thead>
          <tr>
            <th className="left">Map</th>
            <th title="Their map preference">Them</th>
            <th title="Your map preference">You</th>
            <th className="left">Read</th>
          </tr>
        </thead>
        <tbody>
          {report.maps.map((m) => (
            <tr key={`${m.mode}:${m.map}`}>
              <td className="left">
                {m.map} <span className="muted">{m.mode.toUpperCase()}</span>
              </td>
              <td>{report.intel === "full" ? fmtMod(m.theirs) : "?"}</td>
              <td>{fmtMod(m.yours)}</td>
              <td className="left">
                {report.intel === "basic" ? "" : m.likely === "pick" ? <span style={{ color: "var(--ban)" }}>Likely their pick</span> : m.likely === "ban" ? <span className="muted">Likely their ban</span> : ""}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="sub" style={{ marginTop: 6 }}>
        {report.intel === "full"
          ? `Full intel${report.familiar ? " from your scrims" : " from your analyst"}. `
          : report.intel === "reads"
            ? "Your analyst can read their likely picks and bans; hire a 3★ analyst or scrim them for their map numbers. "
            : "No analyst: you only know your own map numbers. Hire one (Staff) or scrim them (This week). "}
        Map preferences come from each team's real map win rates (±5 is a strong lean). Unwatched results are left out.
      </div>
    </div>
  );
}

export function PrepCard({ store }: { store: SeasonStore }) {
  const { state, data, mutate } = store;
  const gm = state.gm!;
  const phase = nextPhase(state);
  const pool = phase ? mapPoolFor(data.season, phase) : null;
  const maps = pool
    ? (["hp", "snd", "third"] as const).flatMap((slot) => pool[slot].map((map) => ({ mode: slotToMode(data.season, slot), map })))
    : [];
  const modes: Mode[] = ["hp", "snd", slotToMode(data.season, "third")];
  const cur = gm.prep ?? { kind: "balanced" };
  const [msg, setMsg] = useState<string | null>(null);
  const set = (p: Prep) => setMsg(mutate((s) => gmSetPrep(s, p)));
  const locked = !!state.pending;
  const firstMap = maps[0];

  const options: { kind: Prep["kind"]; title: string; text: string }[] = [
    { kind: "balanced", title: "Balanced", text: "No focus. No bonus, no morale cost." },
    { kind: "map", title: "Map focus", text: `Drill one map: +${Math.round(PREP_BONUS.map * 100)} on it (a map preference swing).` },
    { kind: "mode", title: "Mode focus", text: `+${Math.round(PREP_BONUS.mode * 100)} on every map of one mode.` },
    { kind: "rest", title: "Rest", text: `No bonus, but +${PREP_MORALE.rest} morale for everyone.` },
    { kind: "grind", title: "Grind scrims", text: `+${Math.round(PREP_BONUS.grind * 100)} on every map, but ${PREP_MORALE.grind} morale.` },
  ];

  return (
    <div className="card">
      <div className="card-head">
        <h3>This week's prep</h3>
        <span className="sub">{locked ? "Locked while your match is waiting." : "Applies to every match in the next sim step."}</span>
      </div>
      {msg && <div className="sub" style={{ color: "var(--ban)" }}>{msg}</div>}
      <div className="prep">
        {options.map((o) => (
          <label key={o.kind} className={`prep-opt ${cur.kind === o.kind ? "on" : ""}`}>
            <input
              type="radio"
              name="prep"
              disabled={locked || ((o.kind === "map" || o.kind === "mode") && !firstMap)}
              checked={cur.kind === o.kind}
              onChange={() => {
                if (o.kind === "map") set({ kind: "map", mode: firstMap!.mode, map: firstMap!.map });
                else if (o.kind === "mode") set({ kind: "mode", mode: modes[0]! });
                else set({ kind: o.kind } as Prep);
              }}
            />
            <span>
              <b>{o.title}</b> <span className="muted">{o.text}</span>
              {o.kind === "map" && cur.kind === "map" && (
                <select
                  className="plain"
                  disabled={locked}
                  value={`${cur.mode}:${cur.map}`}
                  onChange={(e) => {
                    const [mode, map] = e.target.value.split(":") as [Mode, string];
                    set({ kind: "map", mode, map });
                  }}
                  aria-label="Map to drill"
                  style={{ marginLeft: 8 }}
                >
                  {maps.map((m) => (
                    <option key={`${m.mode}:${m.map}`} value={`${m.mode}:${m.map}`}>
                      {m.map} {modeName(m.mode)}
                    </option>
                  ))}
                </select>
              )}
              {o.kind === "mode" && cur.kind === "mode" && (
                <select className="plain" disabled={locked} value={cur.mode} onChange={(e) => set({ kind: "mode", mode: e.target.value as Mode })} aria-label="Mode" style={{ marginLeft: 8 }}>
                  {modes.map((m) => (
                    <option key={m} value={m}>
                      {modeName(m)}
                    </option>
                  ))}
                </select>
              )}
            </span>
          </label>
        ))}
      </div>
      <div className="sub" style={{ marginTop: 6 }}>
        Prep is hidden from opponents: it doesn't change their veto, only how the maps play.
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ inbox and owner

export function Practice({ store }: { store: SeasonStore }) {
  const { state, data, mutate } = store;
  const gm = state.gm!;
  const dir = directory(data);
  const scrims = gm.scrims ?? [];
  const [err, setErr] = useState<string | null>(null);
  const locked = !!state.pending;
  const toggle = (t: string) => {
    const next = scrims.includes(t) ? scrims.filter((x) => x !== t) : [...scrims, t];
    setErr(mutate((s, d) => gmSetScrims(s, d, next)));
  };
  const fatigue = gm.fatigue ?? 0;
  const nextFatigue = Math.max(0, Math.min(100, fatigue + FATIGUE[gm.prep?.kind ?? "balanced"] + scrims.length * FATIGUE.scrim));
  return (
    <div className="card">
      <div className="card-head">
        <h3>Practice planner</h3>
        <span className="sub">Scrim up to {MAX_SCRIMS} teams a week.</span>
      </div>
      <div className="sub" style={{ marginBottom: 8 }}>
        A scrim gives full scouting intel on that team and a +{Math.round(SCRIM_EDGE * 1000) / 10} edge when you play them in the next two steps, but adds {FATIGUE.scrim} fatigue.
        Fatigue over 50 costs form on every map. Rest clears it fastest.
      </div>
      {err && <div className="sub" style={{ color: "var(--ban)" }}>{err}</div>}
      <div className="chips">
        {data.season.teams
          .filter((t) => t.id !== gm.team)
          .map((t) => {
            const on = scrims.includes(t.id);
            const familiar = (gm.familiarity?.[t.id] ?? -1) > state.next;
            return (
              <button key={t.id} className={`chip ${on ? "on" : ""}`} aria-pressed={on} disabled={locked || (!on && scrims.length >= MAX_SCRIMS)} onClick={() => toggle(t.id)} title={t.name}>
                {t.abbr}
                {familiar && !on ? " ·" : ""}
                {isRival(state, t.id) ? " 🔥" : ""}
              </button>
            );
          })}
      </div>
      <div style={{ marginTop: 8 }}>
        Fatigue now <b>{fatigue}</b> → after this step <b style={{ color: nextFatigue > 50 ? "var(--ban)" : undefined }}>{nextFatigue}</b>
        <Meter value={nextFatigue} warn={nextFatigue > 50} />
      </div>
      <div className="sub" style={{ marginTop: 6 }}>
        {scrims.length ? `Scrimming ${scrims.map((t) => dir.team(t).abbr).join(" and ")} this week.` : "No scrims planned."} A dot marks teams you're still familiar with; 🔥 marks rivals.
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ calendar
