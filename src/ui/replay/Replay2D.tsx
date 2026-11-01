// Top-down 2D replay (also used as the minimap inset in 3D): the blockout, objectives
// and the eight players at time t, as SVG. Light and clear on phones.
import type { MapResult } from "../../engine";
import type { Layout } from "./layouts";
import { allBlocks, heightAt } from "./shapes";
import { DEFAULT_THEME } from "./themes";
import { objAt, positionAt, type Timeline } from "./timeline";

const TEAM = ["#3987e5", "#eb6834"];

export function Replay2D({
  tl,
  map,
  time,
  players,
  hillLabels,
  callouts = true,
  mini = false,
  highlight,
}: {
  tl: Timeline;
  map: MapResult;
  time: number;
  players: string[];
  hillLabels: Map<number, string>;
  callouts?: boolean;
  mini?: boolean;
  /** A player to ring (follow cam). */
  highlight?: number;
}) {
  const L: Layout = tl.layout;
  const th = L.theme ?? DEFAULT_THEME;
  const o = objAt(tl, time);
  const mode = map.mode;
  const blocks = allBlocks(L);
  const recent = tl.kills.filter((k) => k.t <= time && k.t > time - 0.6);
  const deaths = tl.kills.filter((k) => k.t <= time && k.t > time - 3);

  return (
    <svg viewBox="0 0 100 100" className={mini ? "replay2d mini" : "replay2d"} role="img" aria-label={`${map.map} top-down replay`}>
      <rect x="0" y="0" width="100" height="100" fill={th.ground} />
      {L.floor.map(([x0, y0, x1, y1], i) => (
        <rect key={`f${i}`} x={x0} y={y0} width={x1 - x0} height={y1 - y0} fill={th.floor} />
      ))}
      {(L.platforms ?? []).map((p, i) => (
        <rect key={`p${i}`} x={p.r[0]} y={p.r[1]} width={p.r[2] - p.r[0]} height={p.r[3] - p.r[1]} fill={th.low} opacity={0.45} stroke={th.low} strokeWidth={0.3} />
      ))}
      {blocks.map((b, i) => {
        const [x0, y0, x1, y1] = b.r;
        const cx = (x0 + x1) / 2;
        const cy = (y0 + y1) / 2;
        return (
          <rect
            key={`b${i}`}
            x={x0}
            y={y0}
            width={x1 - x0}
            height={y1 - y0}
            fill={b.water ? "#1f4a7a" : b.window ? "#7fb2d9" : b.h < 2 ? th.low : th.block}
            opacity={b.window ? 0.6 : 1}
            transform={b.rot ? `rotate(${b.rot} ${cx} ${cy})` : undefined}
          />
        );
      })}

      {/* Objectives */}
      {mode === "hp" &&
        L.hills.map((h, i) => {
          const active = i === o[0];
          const owner = o[1]!;
          return (
            <rect
              key={`h${i}`}
              x={h.x - h.w / 2}
              y={h.y - h.d / 2}
              width={h.w}
              height={h.d}
              fill={active ? (owner >= 0 ? TEAM[owner] : "#ffffff") : "none"}
              fillOpacity={active ? 0.35 : 0}
              stroke={active ? "#ffffff" : "#ffffff55"}
              strokeWidth={active ? 0.5 : 0.25}
              strokeDasharray={active ? undefined : "1 1"}
            />
          );
        })}
      {mode === "snd" &&
        (["A", "B"] as const).map((s) => {
          const p = L.snd[s];
          const planted = o[0] === (s === "A" ? 1 : 2) && (o[1] === 1 || o[1] === 2);
          return (
            <g key={s}>
              <rect x={p.x - 3} y={p.y - 3} width={6} height={6} fill="#c9981e" fillOpacity={0.25} stroke="#c9981e" strokeWidth={0.4} />
              {planted && <circle cx={p.x} cy={p.y} r={1.2} fill={o[1] === 2 ? "#4cc38a" : "#ff4040"} />}
            </g>
          );
        })}
      {mode === "control" &&
        (["A", "B"] as const).map((z, i) => {
          const p = L.control[z];
          return <circle key={z} cx={p.x} cy={p.y} r={4.5} fill={i < o[0]! ? TEAM[o[1]!] : "#ffffff"} fillOpacity={i < o[0]! ? 0.35 : 0.1} stroke="#ffffff" strokeWidth={0.3} />;
        })}
      {mode === "overload" && (
        <>
          {L.overload.goals.map((g, k) => (
            <circle key={k} cx={g.x} cy={g.y} r={3} fill="none" stroke={TEAM[o[3] ? 1 - k : k]} strokeWidth={0.6} />
          ))}
          <polygon points={`${o[0]},${o[1]! - 1.4} ${o[0]! + 1.4},${o[1]} ${o[0]},${o[1]! + 1.4} ${o[0]! - 1.4},${o[1]}`} fill="#ffe066" />
        </>
      )}

      {/* Callouts */}
      {callouts && !mini && (
        <g className="callouts">
          {mode === "hp" &&
            L.hills.map((h, i) =>
              hillLabels.get(i) ? (
                <text key={`c${i}`} x={h.x} y={h.y + h.d / 2 + 2.6} textAnchor="middle">
                  {hillLabels.get(i)!.replace(/^P\d+\s*/, "")}
                </text>
              ) : null,
            )}
          {mode === "snd" &&
            (["A", "B"] as const).map((s) => (
              <text key={s} x={L.snd[s].x} y={L.snd[s].y - 3.8} textAnchor="middle" className="site">
                {s}
              </text>
            ))}
          {(L.callouts ?? []).map((c, i) => (
            <text key={`x${i}`} x={c.x} y={c.y} textAnchor="middle">
              {c.text}
            </text>
          ))}
        </g>
      )}

      {/* Kills */}
      {recent.map((k, i) => (
        <line key={`k${i}`} x1={k.from.x} y1={k.from.y} x2={k.to.x} y2={k.to.y} stroke={TEAM[k.by < 4 ? 0 : 1]} strokeWidth={0.5} opacity={1 - (time - k.t) / 0.6} />
      ))}
      {deaths.map((k, i) => (
        <text key={`d${i}`} x={k.to.x} y={k.to.y + 1} textAnchor="middle" fontSize={3} fill={TEAM[k.on < 4 ? 0 : 1]} opacity={1 - (time - k.t) / 3}>
          ×
        </text>
      ))}

      {/* Players */}
      {players.map((name, p) => {
        const at = positionAt(tl, p, time);
        if (!at.alive) return null;
        const up = heightAt(L, at.x, at.y) > 0;
        return (
          <g key={p}>
            {highlight === p && <circle cx={at.x} cy={at.y} r={2.6} fill="none" stroke="#ffffff" strokeWidth={0.4} />}
            <circle cx={at.x} cy={at.y} r={mini ? 1.6 : 1.3} fill={TEAM[p < 4 ? 0 : 1]} stroke={up ? "#ffffff" : "#000000"} strokeWidth={up ? 0.45 : 0.25} />
            {!mini && (
              <text x={at.x} y={at.y - 2} textAnchor="middle" className="pname">
                {name}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}
