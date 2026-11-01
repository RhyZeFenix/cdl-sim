// CDL points over the season. Twelve teams is more than a categorical palette can
// carry, so up to three teams are highlighted in fixed slots (colors stay with the
// team, not its rank) and the rest are muted context lines. The tooltip lists all.
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { PointsSnapshot } from "../../engine";
import type { TeamInfo } from "../names";

const SLOTS = ["var(--series-1)", "var(--series-2)", "var(--series-3)"];
const MAX_HI = SLOTS.length;
const H = 320;
const M = { top: 12, right: 64, bottom: 46, left: 40 };

const shortLabel = (l: string) =>
  l.replace(" (Pro-Am)", "").replace("Championship", "Champs").replace(/^Major /, "M ").replace(/^Minor /, "Mn ");
const isEvent = (l: string) => l !== "Start" && !/^S\d W\d+$/.test(l);

export function PointsRace({ history, teams }: { history: PointsSnapshot[]; teams: TeamInfo[] }) {
  const wrap = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(800);
  const [hover, setHover] = useState<number | null>(null);
  const last = history[history.length - 1]!.points;
  const ranked = useMemo(() => [...teams].sort((a, b) => (last[b.id] ?? 0) - (last[a.id] ?? 0)), [teams, last]);

  // team id -> slot index; slots are kept when other teams toggle.
  const [slots, setSlots] = useState<Map<string, number>>(new Map());
  useEffect(() => {
    setSlots(new Map(ranked.slice(0, MAX_HI).map((t, i) => [t.id, i])));
    // Only reseed when the season (team list) changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teams]);

  useLayoutEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(Math.max(320, e!.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const toggle = (id: string) => {
    setSlots((prev) => {
      const next = new Map(prev);
      if (next.has(id)) {
        next.delete(id);
        return next;
      }
      if (next.size >= MAX_HI) next.delete(next.keys().next().value!);
      const used = new Set(next.values());
      next.set(id, [0, 1, 2].find((s) => !used.has(s))!);
      return next;
    });
  };

  const n = history.length;
  const maxPts = Math.max(100, ...history.flatMap((h) => Object.values(h.points)));
  const yMax = Math.ceil(maxPts / 100) * 100;
  const iw = width - M.left - M.right;
  const ih = H - M.top - M.bottom;
  const x = (i: number) => M.left + (n === 1 ? 0 : (i / (n - 1)) * iw);
  const y = (v: number) => M.top + ih - (v / yMax) * ih;
  const yTicks = Array.from({ length: 5 }, (_, i) => Math.round((yMax / 4) * i));
  const path = (id: string) => history.map((h, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(h.points[id] ?? 0).toFixed(1)}`).join("");

  const highlighted = ranked.filter((t) => slots.has(t.id));
  const muted = ranked.filter((t) => !slots.has(t.id));

  // End labels for highlighted teams, nudged apart so they never overlap.
  const labels = highlighted
    .map((t) => ({ t, y: y(last[t.id] ?? 0) }))
    .sort((a, b) => a.y - b.y);
  for (let i = 1; i < labels.length; i++) labels[i]!.y = Math.max(labels[i]!.y, labels[i - 1]!.y + 14);

  const onMove = (e: React.MouseEvent<SVGRectElement>) => {
    const r = (e.currentTarget as SVGRectElement).getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * iw;
    setHover(Math.max(0, Math.min(n - 1, Math.round((px / iw) * (n - 1)))));
  };

  const hovered = hover !== null ? history[hover]! : null;
  const ttLeft = hover !== null && x(hover) > width / 2;

  return (
    <div>
      <div className="legend" role="group" aria-label="Highlight teams (up to 3)">
        {ranked.map((t) => (
          <button key={t.id} aria-pressed={slots.has(t.id)} onClick={() => toggle(t.id)} title={slots.has(t.id) ? "Remove highlight" : "Highlight"}>
            <span className="swatch" style={{ background: slots.has(t.id) ? SLOTS[slots.get(t.id)!] : "var(--muted-line)" }} />
            {t.abbr}
          </button>
        ))}
      </div>
      <div className="chart" ref={wrap}>
        <svg viewBox={`0 0 ${width} ${H}`} role="img" aria-label={`CDL points over the season. Now: ${ranked.slice(0, 5).map((t) => `${t.abbr} ${last[t.id] ?? 0}`).join(", ")}${ranked.length > 5 ? ", …" : ""}. The Standings tab has the full table.`}>
          <g className="grid">
            {yTicks.map((v) => (
              <line key={v} x1={M.left} x2={width - M.right} y1={y(v)} y2={y(v)} />
            ))}
          </g>
          <g className="axis">
            {yTicks.map((v) => (
              <text key={v} x={M.left - 8} y={y(v) + 4} textAnchor="end">
                {v}
              </text>
            ))}
            {history.map((h, i) =>
              isEvent(h.label) ? (
                <text key={i} x={x(i)} y={H - M.bottom + 16} textAnchor="end" transform={`rotate(-35 ${x(i)} ${H - M.bottom + 16})`}>
                  {shortLabel(h.label)}
                </text>
              ) : null,
            )}
          </g>
          {muted.map((t) => (
            <path key={t.id} d={path(t.id)} fill="none" stroke="var(--muted-line)" strokeWidth={1.25} strokeLinejoin="round" />
          ))}
          {highlighted.map((t) => (
            <path key={t.id} d={path(t.id)} fill="none" stroke={SLOTS[slots.get(t.id)!]} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
          ))}
          {labels.map(({ t, y: ly }) => (
            <text key={t.id} className="endlabel" x={x(n - 1) + 8} y={ly + 4}>
              {t.abbr} {last[t.id] ?? 0}
            </text>
          ))}
          {hover !== null && (
            <>
              <line x1={x(hover)} x2={x(hover)} y1={M.top} y2={M.top + ih} stroke="var(--text-3)" strokeDasharray="3 3" />
              {highlighted.map((t) => (
                <circle key={t.id} cx={x(hover)} cy={y(history[hover]!.points[t.id] ?? 0)} r={4} fill={SLOTS[slots.get(t.id)!]} stroke="var(--surface)" strokeWidth={2} />
              ))}
            </>
          )}
          <rect x={M.left} y={M.top} width={iw} height={ih} fill="transparent" onMouseMove={onMove} onMouseLeave={() => setHover(null)} />
        </svg>
        {hovered && (
          <div
            className="tooltip"
            style={{
              top: M.top,
              ...(ttLeft ? { right: `${((width - x(hover!) + 12) / width) * 100}%` } : { left: `${((x(hover!) + 12) / width) * 100}%` }),
            }}
          >
            <div style={{ fontWeight: 700, marginBottom: 4 }}>
              {hovered.label} <span className="muted">· {hovered.date}</span>
            </div>
            {[...teams]
              .sort((a, b) => (hovered.points[b.id] ?? 0) - (hovered.points[a.id] ?? 0))
              .map((t) => (
                <div key={t.id} className="tt-row">
                  <span className="swatch" style={{ background: slots.has(t.id) ? SLOTS[slots.get(t.id)!] : "var(--muted-line)" }} />
                  <span style={{ fontWeight: slots.has(t.id) ? 600 : 400 }}>{t.abbr}</span>
                  <span className="v">{hovered.points[t.id] ?? 0}</span>
                </div>
              ))}
          </div>
        )}
      </div>
    </div>
  );
}
