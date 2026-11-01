// The map editor: open a map's layout, lay your own reference image under it (it stays
// on your computer), and move or add walls, buildings, raised floors, hills, bomb sites,
// Control zones, Overload goals, spawns, hold spots and callouts. Validate it, save it
// to this browser (replays use it straight away), or export the JSON to share.
import { useEffect, useMemo, useRef, useState } from "react";
import { layoutFor, TRACED_MAPS, tracedLayout, hasOverride } from "../replay/layouts";
import { allBlocks, type Opening, type Pt, type Traced } from "../replay/shapes";
import { buildGrid, snap } from "../replay/timeline";
import { saveLayoutOverride } from "../layoutStore";

type Sel =
  | { kind: "floor" | "block" | "building" | "platform"; i: number }
  | { kind: "hill"; i: number }
  | { kind: "spawn"; side: 0 | 1; i: number }
  | { kind: "hold" | "callout"; i: number }
  | { kind: "point"; key: PointKey };

type PointKey = "snd.atk" | "snd.def" | "snd.A" | "snd.B" | "control.A" | "control.B" | "control.atk" | "control.def" | "overload.device" | "overload.goal0" | "overload.goal1";
const POINT_LABEL: Record<PointKey, string> = {
  "snd.atk": "SnD attack spawn",
  "snd.def": "SnD defense spawn",
  "snd.A": "Bomb site A",
  "snd.B": "Bomb site B",
  "control.A": "Control zone A",
  "control.B": "Control zone B",
  "control.atk": "Control attack spawn",
  "control.def": "Control defense spawn",
  "overload.device": "Overload device",
  "overload.goal0": "Overload goal (side 1 end)",
  "overload.goal1": "Overload goal (side 2 end)",
};

type Tool = "select" | "block" | "floor" | "building" | "platform" | "hold" | "callout";
const TOOLS: { id: Tool; label: string; hint: string }[] = [
  { id: "select", label: "Select / move", hint: "Drag anything to move it; drag the corner square to resize" },
  { id: "block", label: "+ Wall/cover", hint: "Drag to draw a solid block" },
  { id: "building", label: "+ Building", hint: "Drag to draw a building, then add doors and windows" },
  { id: "platform", label: "+ Upper floor", hint: "Drag to draw a raised floor players can stand on" },
  { id: "floor", label: "+ Floor", hint: "Drag to add walkable ground" },
  { id: "hold", label: "+ Hold spot", hint: "Click to mark a power position" },
  { id: "callout", label: "+ Callout", hint: "Click to place an area name" },
];

const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x)) as T;
const r1 = (x: number) => Math.round(x * 10) / 10;

function getPoint(t: Traced, key: PointKey): Pt {
  const control = t.control ?? { atk: t.snd.atk, def: t.snd.def, A: t.hills[2] ?? t.hills[0]!, B: t.hills[1] ?? t.hills[0]! };
  switch (key) {
    case "snd.atk": return t.snd.atk;
    case "snd.def": return t.snd.def;
    case "snd.A": return t.snd.A;
    case "snd.B": return t.snd.B;
    case "control.A": return control.A;
    case "control.B": return control.B;
    case "control.atk": return control.atk;
    case "control.def": return control.def;
    case "overload.device": return t.overload.device;
    case "overload.goal0": return t.overload.goals[0];
    case "overload.goal1": return t.overload.goals[1];
  }
}

function setPoint(t: Traced, key: PointKey, p: Pt): void {
  const q = { x: r1(p.x), y: r1(p.y) };
  if (key.startsWith("control.")) {
    t.control = clone(t.control ?? { atk: t.snd.atk, def: t.snd.def, A: { x: t.hills[2]?.x ?? 50, y: t.hills[2]?.y ?? 50 }, B: { x: t.hills[1]?.x ?? 50, y: t.hills[1]?.y ?? 50 } });
  }
  switch (key) {
    case "snd.atk": t.snd.atk = q; break;
    case "snd.def": t.snd.def = q; break;
    case "snd.A": t.snd.A = q; break;
    case "snd.B": t.snd.B = q; break;
    case "control.A": t.control!.A = q; break;
    case "control.B": t.control!.B = q; break;
    case "control.atk": t.control!.atk = q; break;
    case "control.def": t.control!.def = q; break;
    case "overload.device": t.overload.device = q; break;
    case "overload.goal0": t.overload.goals[0] = q; break;
    case "overload.goal1": t.overload.goals[1] = q; break;
  }
}

/** Problems: spawns and objectives in walls, off the map, or unreachable. */
function validate(map: string, t: Traced): string[] {
  const L = { ...layoutFor(map, 1), ...t, kind: "edited" as const, map, control: t.control ?? layoutFor(map, 1).control };
  const g = buildGrid(L);
  const N = 100;
  const seen = new Uint8Array(N * N);
  const s0 = snap(g, L.spawns[0][0] ?? { x: 50, y: 50 });
  const q = [Math.floor(s0.y) * N + Math.floor(s0.x)];
  seen[q[0]!] = 1;
  while (q.length) {
    const c = q.pop()!;
    for (const d of [-1, 1, -N, N]) {
      const n = c + d;
      if (n >= 0 && n < N * N && !seen[n] && g.walk[n] && Math.abs((n % N) - (c % N)) <= 1) {
        seen[n] = 1;
        q.push(n);
      }
    }
  }
  const pts: [string, Pt][] = [
    ...L.spawns.flatMap((s, k) => s.map((p, i) => [`Spawn ${k + 1}.${i + 1}`, p] as [string, Pt])),
    ...L.hills.map((h, i) => [`Hill ${i + 1}`, h] as [string, Pt]),
    ...(Object.keys(POINT_LABEL) as PointKey[]).map((k) => [POINT_LABEL[k], getPoint(t, k)] as [string, Pt]),
  ];
  const out: string[] = [];
  for (const [what, p] of pts) {
    const s = snap(g, p);
    if (Math.hypot(s.x - p.x, s.y - p.y) >= 3) out.push(`${what} is inside a wall or off the map`);
    else if (!seen[Math.floor(s.y) * N + Math.floor(s.x)]) out.push(`${what} can't be reached from spawn 1.1`);
  }
  return out;
}

export function MapEditor() {
  const maps = useMemo(() => [...TRACED_MAPS].sort(), []);
  const [map, setMap] = useState(maps.includes("Den") ? "Den" : maps[0]!);
  const [t, setT] = useState<Traced>(() => clone(layoutFor(map, 1) as unknown as Traced));
  const [sel, setSel] = useState<Sel | null>(null);
  const [tool, setTool] = useState<Tool>("select");
  const [img, setImg] = useState<string | null>(null);
  const [imgOpacity, setImgOpacity] = useState(0.6);
  const [imgFit, setImgFit] = useState({ x: 0, y: 0, s: 100 });
  const [problems, setProblems] = useState<string[] | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [json, setJson] = useState<string | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const drag = useRef<{ start: Pt; orig: Traced; sel: Sel | null; mode: "move" | "resize" | "draw"; drawTool?: Tool } | null>(null);
  const [draft, setDraft] = useState<[number, number, number, number] | null>(null);

  // Load the map's current layout (edited or traced) when switching maps.
  useEffect(() => {
    const L = layoutFor(map, 1);
    const { map: _m, kind: _k, theme: _th, ...rest } = L;
    void _m;
    void _k;
    void _th;
    setT(clone(rest as Traced));
    setSel(null);
    setProblems(null);
    setJson(null);
  }, [map]);

  const toMap = (e: React.PointerEvent): Pt => {
    const svg = svgRef.current!;
    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const p = pt.matrixTransform(svg.getScreenCTM()!.inverse());
    return { x: Math.max(0, Math.min(100, p.x)), y: Math.max(0, Math.min(100, p.y)) };
  };

  const update = (fn: (x: Traced) => void) =>
    setT((cur) => {
      const n = clone(cur);
      fn(n);
      return n;
    });

  const rectOf = (x: Traced, s: Sel): [number, number, number, number] | null => {
    if (s.kind === "floor") return x.floor[s.i] ?? null;
    if (s.kind === "block") return x.blocks[s.i]?.r ?? null;
    if (s.kind === "building") return x.buildings?.[s.i]?.r ?? null;
    if (s.kind === "platform") return x.platforms?.[s.i]?.r ?? null;
    return null;
  };
  const setRect = (x: Traced, s: Sel, r: [number, number, number, number]) => {
    const n = r.map(r1) as [number, number, number, number];
    if (s.kind === "floor") x.floor[s.i] = n;
    if (s.kind === "block") x.blocks[s.i]!.r = n;
    if (s.kind === "building") x.buildings![s.i]!.r = n;
    if (s.kind === "platform") x.platforms![s.i]!.r = n;
  };
  const pointOf = (x: Traced, s: Sel): Pt | null => {
    if (s.kind === "hill") return x.hills[s.i] ?? null;
    if (s.kind === "spawn") return x.spawns[s.side][s.i] ?? null;
    if (s.kind === "hold") return x.holds?.[s.i] ?? null;
    if (s.kind === "callout") return x.callouts?.[s.i] ?? null;
    if (s.kind === "point") return getPoint(x, s.key);
    return null;
  };
  const movePoint = (x: Traced, s: Sel, p: Pt) => {
    const q = { x: r1(p.x), y: r1(p.y) };
    if (s.kind === "hill") Object.assign(x.hills[s.i]!, q);
    if (s.kind === "spawn") x.spawns[s.side][s.i] = q;
    if (s.kind === "hold") x.holds![s.i] = q;
    if (s.kind === "callout") Object.assign(x.callouts![s.i]!, q);
    if (s.kind === "point") setPoint(x, s.key, q);
  };

  const onDown = (e: React.PointerEvent, s: Sel | null, mode: "move" | "resize" = "move") => {
    e.stopPropagation();
    const p = toMap(e);
    (e.target as Element).setPointerCapture?.(e.pointerId);
    if (tool !== "select" && !s) {
      if (tool === "hold" || tool === "callout") {
        update((x) => {
          if (tool === "hold") x.holds = [...(x.holds ?? []), { x: r1(p.x), y: r1(p.y) }];
          else x.callouts = [...(x.callouts ?? []), { x: r1(p.x), y: r1(p.y), text: "Callout" }];
        });
        return;
      }
      drag.current = { start: p, orig: t, sel: null, mode: "draw", drawTool: tool };
      setDraft([p.x, p.y, p.x, p.y]);
      return;
    }
    if (s) setSel(s);
    drag.current = { start: p, orig: clone(t), sel: s, mode };
  };
  const onMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const p = toMap(e);
    if (d.mode === "draw") {
      setDraft([Math.min(d.start.x, p.x), Math.min(d.start.y, p.y), Math.max(d.start.x, p.x), Math.max(d.start.y, p.y)]);
      return;
    }
    if (!d.sel) return;
    const dx = p.x - d.start.x;
    const dy = p.y - d.start.y;
    const n = clone(d.orig);
    const r = rectOf(d.orig, d.sel);
    if (r) {
      if (d.mode === "resize") setRect(n, d.sel, [r[0], r[1], Math.max(r[0] + 0.5, r[2] + dx), Math.max(r[1] + 0.5, r[3] + dy)]);
      else setRect(n, d.sel, [r[0] + dx, r[1] + dy, r[2] + dx, r[3] + dy]);
    } else {
      const pt = pointOf(d.orig, d.sel);
      if (pt) movePoint(n, d.sel, { x: pt.x + dx, y: pt.y + dy });
    }
    setT(n);
  };
  const onUp = () => {
    const d = drag.current;
    drag.current = null;
    if (d?.mode === "draw" && draft) {
      const [x0, y0, x1, y1] = draft.map(r1) as [number, number, number, number];
      setDraft(null);
      if (x1 - x0 < 0.8 || y1 - y0 < 0.8) return;
      const r: [number, number, number, number] = [x0, y0, x1, y1];
      update((x) => {
        if (d.drawTool === "block") x.blocks.push({ r, h: 3 });
        if (d.drawTool === "floor") x.floor.push(r);
        if (d.drawTool === "building") x.buildings = [...(x.buildings ?? []), { r, h: 4, doors: [{ side: "s", at: 0.5, w: 3 }] }];
        if (d.drawTool === "platform") x.platforms = [...(x.platforms ?? []), { r, h: 2.5 }];
      });
      setTool("select");
    }
  };

  const del = () => {
    if (!sel) return;
    update((x) => {
      if (sel.kind === "floor") x.floor.splice(sel.i, 1);
      if (sel.kind === "block") x.blocks.splice(sel.i, 1);
      if (sel.kind === "building") x.buildings!.splice(sel.i, 1);
      if (sel.kind === "platform") x.platforms!.splice(sel.i, 1);
      if (sel.kind === "hold") x.holds!.splice(sel.i, 1);
      if (sel.kind === "callout") x.callouts!.splice(sel.i, 1);
    });
    setSel(null);
  };

  const save = () => {
    const p = validate(map, t);
    setProblems(p);
    saveLayoutOverride(map, t);
    setMsg(p.length ? `Saved with ${p.length} problem${p.length > 1 ? "s" : ""} (see below). Replays now use your version.` : "Saved. Replays of this map now use your version.");
  };
  const revert = () => {
    if (!confirm(`Throw away your edits to ${map} and go back to the traced layout?`)) return;
    saveLayoutOverride(map, null);
    const base = tracedLayout(map);
    if (base) setT(clone(base));
    setMsg("Back to the traced layout.");
  };
  const exportJson = () => setJson(JSON.stringify({ map, layout: t }, null, 1));
  const importJson = () => {
    const text = prompt("Paste the layout JSON (from Export):");
    if (!text) return;
    try {
      const parsed = JSON.parse(text) as { map?: string; layout?: Traced };
      const lay = parsed.layout ?? (parsed as unknown as Traced);
      if (!Array.isArray(lay.floor) || !Array.isArray(lay.blocks)) throw new Error("That isn't a layout.");
      if (parsed.map && parsed.map !== map && maps.includes(parsed.map)) setMap(parsed.map);
      setT(clone(lay));
      setMsg("Imported. Save to use it in replays.");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e));
    }
  };

  const isSel = (s: Sel) => !!sel && JSON.stringify(sel) === JSON.stringify(s);

  // Keyboard: [ and ] pick the previous/next item, arrows move it (Shift: 5 units,
  // Alt: resize), Delete removes it, Escape lets go.
  const allSels = (): Sel[] => [
    ...t.floor.map((_, i) => ({ kind: "floor" as const, i })),
    ...t.blocks.map((_, i) => ({ kind: "block" as const, i })),
    ...(t.buildings ?? []).map((_, i) => ({ kind: "building" as const, i })),
    ...(t.platforms ?? []).map((_, i) => ({ kind: "platform" as const, i })),
    ...t.hills.map((_, i) => ({ kind: "hill" as const, i })),
    ...([0, 1] as const).flatMap((side) => t.spawns[side].map((_, i) => ({ kind: "spawn" as const, side, i }))),
    ...(t.holds ?? []).map((_, i) => ({ kind: "hold" as const, i })),
    ...(t.callouts ?? []).map((_, i) => ({ kind: "callout" as const, i })),
    ...(Object.keys(POINT_LABEL) as PointKey[]).filter((key) => getPoint(t, key)).map((key) => ({ kind: "point" as const, key })),
  ];
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "[" || e.key === "]") {
      const list = allSels();
      if (!list.length) return;
      const at = sel ? list.findIndex((s) => JSON.stringify(s) === JSON.stringify(sel)) : -1;
      setSel(list[(at + (e.key === "]" ? 1 : -1) + list.length) % list.length]!);
      e.preventDefault();
      return;
    }
    if (!sel) return;
    if (e.key === "Escape") return setSel(null);
    if (e.key === "Delete" || e.key === "Backspace") {
      e.preventDefault();
      return del();
    }
    const step = e.shiftKey ? 5 : 1;
    const d = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key];
    if (!d) return;
    e.preventDefault();
    const [dx, dy] = d as [number, number];
    update((x) => {
      const r = rectOf(x, sel);
      if (r) {
        if (e.altKey) setRect(x, sel, [r[0], r[1], Math.max(r[0] + 0.5, r[2] + dx), Math.max(r[1] + 0.5, r[3] + dy)]);
        else setRect(x, sel, [r[0] + dx, r[1] + dy, r[2] + dx, r[3] + dy]);
      } else {
        const p = pointOf(x, sel);
        if (p) movePoint(x, sel, { x: Math.max(0, Math.min(100, p.x + dx)), y: Math.max(0, Math.min(100, p.y + dy)) });
      }
    });
  };
  const selName = sel ? (sel.kind === "point" ? POINT_LABEL[sel.key] : `${sel.kind} ${"i" in sel ? sel.i + 1 : ""}`) : "nothing";
  const blocks = t.blocks;
  const walls = allBlocks({ ...(layoutFor(map, 1) as object), ...t, blocks: [] } as never);

  const selRect = sel ? rectOf(t, sel) : null;
  const selPt = sel ? pointOf(t, sel) : null;

  return (
    <div>
      <div className="card">
        <div className="card-head">
          <h3>Map editor</h3>
          <select className="plain" value={map} onChange={(e) => setMap(e.target.value)} aria-label="Map">
            {maps.map((m) => (
              <option key={m} value={m}>
                {m}
                {hasOverride(m) ? " (edited)" : ""}
              </option>
            ))}
          </select>
          <span className="sub">Coordinates run 0–100 across the minimap. Your reference image never leaves this computer.</span>
        </div>
        <div className="row" style={{ marginBottom: 8 }}>
          <div className="seg" role="group" aria-label="Tool">
            {TOOLS.map((x) => (
              <button key={x.id} aria-pressed={tool === x.id} title={x.hint} onClick={() => setTool(x.id)}>
                {x.label}
              </button>
            ))}
          </div>
          <label className="field">
            Reference image
            <input
              type="file"
              accept="image/*"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) setImg(URL.createObjectURL(f));
              }}
            />
          </label>
          {img && (
            <>
              <label className="field">
                Opacity
                <input type="range" min={0.1} max={1} step={0.05} value={imgOpacity} onChange={(e) => setImgOpacity(Number(e.target.value))} style={{ width: 90 }} />
              </label>
              <label className="field" title="Shift and scale the image so it lines up with the 0-100 grid">
                Align x
                <input type="number" step={0.5} value={imgFit.x} onChange={(e) => setImgFit({ ...imgFit, x: Number(e.target.value) })} style={{ width: 60 }} />y
                <input type="number" step={0.5} value={imgFit.y} onChange={(e) => setImgFit({ ...imgFit, y: Number(e.target.value) })} style={{ width: 60 }} />
                size
                <input type="number" step={1} value={imgFit.s} onChange={(e) => setImgFit({ ...imgFit, s: Number(e.target.value) })} style={{ width: 60 }} />
              </label>
            </>
          )}
        </div>
        <div className="editor">
          <svg
            ref={svgRef}
            viewBox="-2 -2 104 104"
            className={`editor-canvas tool-${tool}`}
            onPointerDown={(e) => onDown(e, null)}
            onPointerMove={onMove}
            onPointerUp={onUp}
            role="application"
            aria-label={`${map} layout editor. Selected: ${selName}. Press ] or [ to pick items, arrows to move (Shift for 5, Alt to resize), Delete to remove.`}
            tabIndex={0}
            onKeyDown={onKey}
          >
            <rect x={0} y={0} width={100} height={100} fill="#101216" />
            {img && <image href={img} x={imgFit.x} y={imgFit.y} width={imgFit.s} height={imgFit.s} opacity={imgOpacity} preserveAspectRatio="none" />}
            {Array.from({ length: 11 }, (_, i) => (
              <g key={i} className="grid">
                <line x1={i * 10} y1={0} x2={i * 10} y2={100} />
                <line x1={0} y1={i * 10} x2={100} y2={i * 10} />
                <text x={i * 10 + 0.5} y={2}>
                  {i * 10}
                </text>
              </g>
            ))}
            {t.floor.map((r, i) => (
              <rect key={`f${i}`} className={`ed floor ${isSel({ kind: "floor", i }) ? "sel" : ""}`} x={r[0]} y={r[1]} width={r[2] - r[0]} height={r[3] - r[1]} onPointerDown={(e) => tool === "select" && onDown(e, { kind: "floor", i })} />
            ))}
            {(t.platforms ?? []).map((p, i) => (
              <rect key={`p${i}`} className={`ed platform ${isSel({ kind: "platform", i }) ? "sel" : ""}`} x={p.r[0]} y={p.r[1]} width={p.r[2] - p.r[0]} height={p.r[3] - p.r[1]} onPointerDown={(e) => tool === "select" && onDown(e, { kind: "platform", i })} />
            ))}
            {blocks.map((b, i) => {
              const [x0, y0, x1, y1] = b.r;
              return (
                <rect
                  key={`b${i}`}
                  className={`ed block ${b.water ? "water" : b.h < 2 ? "low" : ""} ${isSel({ kind: "block", i }) ? "sel" : ""}`}
                  x={x0}
                  y={y0}
                  width={x1 - x0}
                  height={y1 - y0}
                  transform={b.rot ? `rotate(${b.rot} ${(x0 + x1) / 2} ${(y0 + y1) / 2})` : undefined}
                  onPointerDown={(e) => tool === "select" && onDown(e, { kind: "block", i })}
                />
              );
            })}
            {(t.buildings ?? []).map((bd, i) => (
              <rect key={`bd${i}`} className={`ed building ${isSel({ kind: "building", i }) ? "sel" : ""}`} x={bd.r[0]} y={bd.r[1]} width={bd.r[2] - bd.r[0]} height={bd.r[3] - bd.r[1]} onPointerDown={(e) => tool === "select" && onDown(e, { kind: "building", i })} />
            ))}
            {walls.map((w, i) => (
              <rect key={`w${i}`} className={`wall ${w.window ? "window" : ""}`} x={w.r[0]} y={w.r[1]} width={w.r[2] - w.r[0]} height={w.r[3] - w.r[1]} pointerEvents="none" />
            ))}
            {t.hills.map((h, i) => (
              <g key={`h${i}`} onPointerDown={(e) => tool === "select" && onDown(e, { kind: "hill", i })} className={`ed hill ${isSel({ kind: "hill", i }) ? "sel" : ""}`}>
                <rect x={h.x - h.w / 2} y={h.y - h.d / 2} width={h.w} height={h.d} />
                <text x={h.x} y={h.y + 1}>P{i + 1}</text>
              </g>
            ))}
            {t.spawns.map((side, k) =>
              side.map((p, i) => (
                <circle key={`s${k}${i}`} className={`ed spawn s${k} ${isSel({ kind: "spawn", side: k as 0 | 1, i }) ? "sel" : ""}`} cx={p.x} cy={p.y} r={1.3} onPointerDown={(e) => tool === "select" && onDown(e, { kind: "spawn", side: k as 0 | 1, i })} />
              )),
            )}
            {(Object.keys(POINT_LABEL) as PointKey[]).map((k) => {
              const p = getPoint(t, k);
              const short = k === "snd.A" ? "A" : k === "snd.B" ? "B" : k === "control.A" ? "ZA" : k === "control.B" ? "ZB" : k === "overload.device" ? "D" : k.startsWith("overload.goal") ? "G" : k.endsWith("atk") ? "atk" : "def";
              return (
                <g key={k} className={`ed point p-${k.split(".")[0]} ${isSel({ kind: "point", key: k }) ? "sel" : ""}`} onPointerDown={(e) => tool === "select" && onDown(e, { kind: "point", key: k })}>
                  <title>{POINT_LABEL[k]}</title>
                  <circle cx={p.x} cy={p.y} r={1.8} />
                  <text x={p.x} y={p.y + 0.8}>{short}</text>
                </g>
              );
            })}
            {(t.holds ?? []).map((p, i) => (
              <rect key={`hd${i}`} className={`ed hold ${isSel({ kind: "hold", i }) ? "sel" : ""}`} x={p.x - 0.8} y={p.y - 0.8} width={1.6} height={1.6} transform={`rotate(45 ${p.x} ${p.y})`} onPointerDown={(e) => tool === "select" && onDown(e, { kind: "hold", i })} />
            ))}
            {(t.callouts ?? []).map((c, i) => (
              <text key={`co${i}`} className={`ed callout ${isSel({ kind: "callout", i }) ? "sel" : ""}`} x={c.x} y={c.y} onPointerDown={(e) => tool === "select" && onDown(e, { kind: "callout", i })}>
                {c.text}
              </text>
            ))}
            {selRect && <rect className="handle" x={selRect[2] - 0.9} y={selRect[3] - 0.9} width={1.8} height={1.8} onPointerDown={(e) => onDown(e, sel, "resize")} />}
            {draft && <rect className="draft" x={draft[0]} y={draft[1]} width={draft[2] - draft[0]} height={draft[3] - draft[1]} />}
          </svg>

          <div className="editor-side">
            <h4 style={{ margin: "0 0 6px" }}>Selected</h4>
            {!sel && <div className="muted">Click something on the map. Points: blue/orange = spawns, gold = bomb sites, green = Control, yellow = Overload, ◆ = hold spots.</div>}
            {sel && selRect && (
              <RectFields
                r={selRect}
                h={sel.kind === "block" ? t.blocks[sel.i]!.h : sel.kind === "building" ? t.buildings![sel.i]!.h : sel.kind === "platform" ? t.platforms![sel.i]!.h : undefined}
                rot={sel.kind === "block" ? t.blocks[sel.i]!.rot : undefined}
                onRect={(r) => update((x) => setRect(x, sel, r))}
                onH={(h) =>
                  update((x) => {
                    if (sel.kind === "block") x.blocks[sel.i]!.h = h;
                    if (sel.kind === "building") x.buildings![sel.i]!.h = h;
                    if (sel.kind === "platform") x.platforms![sel.i]!.h = h;
                  })
                }
                onRot={sel.kind === "block" ? (rot) => update((x) => void (x.blocks[sel.i]!.rot = rot || undefined)) : undefined}
                kind={sel.kind}
              />
            )}
            {sel?.kind === "block" && (
              <label className="field">
                <input type="checkbox" checked={!!t.blocks[sel.i]!.water} onChange={(e) => update((x) => void (x.blocks[sel.i]!.water = e.target.checked || undefined))} style={{ width: "auto" }} />
                Water
              </label>
            )}
            {sel?.kind === "building" && <Openings b={t.buildings![sel.i]!} onChange={(doors, windows) => update((x) => Object.assign(x.buildings![sel.i]!, { doors, windows }))} />}
            {sel && selPt && (
              <div className="ed-fields">
                <b>
                  {sel.kind === "point" ? POINT_LABEL[sel.key] : sel.kind === "hill" ? `Hill P${sel.i + 1}` : sel.kind === "spawn" ? `Spawn ${sel.side + 1}.${sel.i + 1}` : sel.kind === "hold" ? "Hold spot" : "Callout"}
                </b>
                <label>
                  x <input type="number" step={0.5} value={selPt.x} onChange={(e) => update((x) => movePoint(x, sel, { x: Number(e.target.value), y: selPt.y }))} />
                </label>
                <label>
                  y <input type="number" step={0.5} value={selPt.y} onChange={(e) => update((x) => movePoint(x, sel, { x: selPt.x, y: Number(e.target.value) }))} />
                </label>
                {sel.kind === "hill" && (
                  <>
                    <label>
                      w <input type="number" step={0.5} value={t.hills[sel.i]!.w} onChange={(e) => update((x) => void (x.hills[sel.i]!.w = Number(e.target.value)))} />
                    </label>
                    <label>
                      d <input type="number" step={0.5} value={t.hills[sel.i]!.d} onChange={(e) => update((x) => void (x.hills[sel.i]!.d = Number(e.target.value)))} />
                    </label>
                  </>
                )}
                {sel.kind === "callout" && (
                  <label>
                    text <input value={t.callouts![sel.i]!.text} onChange={(e) => update((x) => void (x.callouts![sel.i]!.text = e.target.value))} />
                  </label>
                )}
              </div>
            )}
            {sel && ["floor", "block", "building", "platform", "hold", "callout"].includes(sel.kind) && (
              <button className="btn small" onClick={del} style={{ marginTop: 6 }}>
                Delete
              </button>
            )}

            <h4 style={{ margin: "14px 0 6px" }}>Layout</h4>
            <div className="row" style={{ gap: 6 }}>
              <button className="btn primary small" onClick={save}>
                Save to this browser
              </button>
              <button className="btn small" onClick={() => setProblems(validate(map, t))}>
                Check
              </button>
              <button className="btn small" onClick={exportJson}>
                Export JSON
              </button>
              <button className="btn small" onClick={importJson}>
                Import JSON
              </button>
              <button className="btn small" onClick={revert} disabled={!hasOverride(map)}>
                Revert to traced
              </button>
            </div>
            {msg && <div className="sub" style={{ marginTop: 6 }}>{msg}</div>}
            {problems && (
              <div style={{ marginTop: 6 }}>
                {problems.length === 0 ? (
                  <span style={{ color: "var(--pick)" }}>✓ Everything is on open ground and reachable.</span>
                ) : (
                  <ul className="plain-list" style={{ color: "var(--ban)" }}>
                    {problems.map((p) => (
                      <li key={p}>{p}</li>
                    ))}
                  </ul>
                )}
              </div>
            )}
            {json && (
              <>
                <textarea className="json" readOnly value={json} rows={8} onFocus={(e) => e.target.select()} />
                <div className="sub">Copy this and send it over to build it into the site for everyone.</div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function RectFields({
  r,
  h,
  rot,
  onRect,
  onH,
  onRot,
  kind,
}: {
  r: [number, number, number, number];
  h?: number;
  rot?: number;
  onRect: (r: [number, number, number, number]) => void;
  onH: (h: number) => void;
  onRot?: (rot: number) => void;
  kind: string;
}) {
  const f = (i: number, label: string) => (
    <label>
      {label}{" "}
      <input
        type="number"
        step={0.5}
        value={r[i]}
        onChange={(e) => {
          const n = [...r] as [number, number, number, number];
          n[i] = Number(e.target.value);
          onRect(n);
        }}
      />
    </label>
  );
  return (
    <div className="ed-fields">
      <b>{kind === "block" ? "Wall / cover" : kind === "building" ? "Building" : kind === "platform" ? "Upper floor" : "Floor"}</b>
      {f(0, "x0")}
      {f(1, "y0")}
      {f(2, "x1")}
      {f(3, "y1")}
      {h !== undefined && (
        <label>
          {kind === "platform" ? "floor height" : "height"} <input type="number" step={0.5} value={h} onChange={(e) => onH(Number(e.target.value))} />
        </label>
      )}
      {onRot && (
        <label>
          rotate° <input type="number" step={5} value={rot ?? 0} onChange={(e) => onRot(Number(e.target.value))} />
        </label>
      )}
    </div>
  );
}

function Openings({ b, onChange }: { b: { doors?: Opening[]; windows?: Opening[] }; onChange: (doors: Opening[], windows: Opening[]) => void }) {
  const doors = b.doors ?? [];
  const windows = b.windows ?? [];
  const row = (o: Opening, i: number, list: Opening[], isDoor: boolean) => {
    const set = (patch: Partial<Opening>) => {
      const next = list.map((x, j) => (j === i ? { ...x, ...patch } : x));
      onChange(isDoor ? next : doors, isDoor ? windows : next);
    };
    return (
      <div key={`${isDoor}-${i}`} className="row" style={{ gap: 4 }}>
        <span style={{ width: 52 }}>{isDoor ? "Door" : "Window"}</span>
        <select className="plain" value={o.side} onChange={(e) => set({ side: e.target.value as Opening["side"] })}>
          {(["n", "e", "s", "w"] as const).map((s) => (
            <option key={s} value={s}>
              {{ n: "north", e: "east", s: "south", w: "west" }[s]}
            </option>
          ))}
        </select>
        <input type="number" step={0.05} min={0} max={1} value={o.at} onChange={(e) => set({ at: Number(e.target.value) })} title="Position along the wall (0-1)" style={{ width: 58 }} />
        <input type="number" step={0.5} min={1} value={o.w} onChange={(e) => set({ w: Number(e.target.value) })} title="Width" style={{ width: 52 }} />
        <button className="btn small" onClick={() => onChange(isDoor ? doors.filter((_, j) => j !== i) : doors, isDoor ? windows : windows.filter((_, j) => j !== i))}>
          ✕
        </button>
      </div>
    );
  };
  return (
    <div className="ed-fields">
      {doors.map((o, i) => row(o, i, doors, true))}
      {windows.map((o, i) => row(o, i, windows, false))}
      <div className="row" style={{ gap: 4 }}>
        <button className="btn small" onClick={() => onChange([...doors, { side: "s", at: 0.5, w: 3 }], windows)}>
          + Door
        </button>
        <button className="btn small" onClick={() => onChange(doors, [...windows, { side: "n", at: 0.5, w: 3 }])}>
          + Window
        </button>
      </div>
    </div>
  );
}
