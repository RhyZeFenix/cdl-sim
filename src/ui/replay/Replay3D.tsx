// 3D playback of one map, drawn from the replay timeline. Loaded lazily (three.js is
// big), and driven entirely by the `time` prop, so the parent's clock, scrubber and
// speed controls work the same as the text feed. It only ever draws up to `time`.
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { MapResult } from "../../engine";
import type { Layout, Pt } from "./layouts";
import { objAt, positionAt, type Timeline } from "./timeline";
import { allBlocks, heightAt } from "./shapes";
import { DEFAULT_THEME } from "./themes";
import { hillLabelsOf, timelineFor } from "./build";
import { Replay2D } from "./Replay2D";

export type CamMode = "broadcast" | "action" | "player" | "overhead" | "free";
const CAM_LABEL: Record<CamMode, string> = { broadcast: "Broadcast", action: "Auto-cut", player: "Follow player", overhead: "Overhead", free: "Free" };
const hex = (c: string) => new THREE.Color(c).getHex();

const TEAM = [0x3987e5, 0xeb6834];
const TEAM_CSS = ["#3987e5", "#eb6834"];
const W = (p: Pt) => new THREE.Vector3(p.x - 50, 0, p.y - 50);

function label(text: string, bg: string, scale = 1): THREE.Sprite {
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 64;
  const g = c.getContext("2d")!;
  g.font = "600 30px system-ui, sans-serif";
  const w = Math.min(248, g.measureText(text).width + 24);
  g.fillStyle = bg;
  g.beginPath();
  g.roundRect((256 - w) / 2, 8, w, 48, 10);
  g.fill();
  g.fillStyle = "#fff";
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText(text, 128, 33);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
  s.scale.set(6 * scale, 1.5 * scale, 1);
  s.renderOrder = 10;
  return s;
}

function box(w: number, h: number, d: number, color: number, opts: { opacity?: number; edges?: boolean } = {}) {
  const geo = new THREE.BoxGeometry(w, h, d);
  const mat = new THREE.MeshStandardMaterial({
    color,
    roughness: 0.85,
    transparent: opts.opacity !== undefined,
    opacity: opts.opacity ?? 1,
    depthWrite: opts.opacity === undefined,
  });
  const m = new THREE.Mesh(geo, mat);
  if (opts.edges) {
    const e = new THREE.LineSegments(new THREE.EdgesGeometry(geo), new THREE.LineBasicMaterial({ color: 0x9aa3b5, transparent: true, opacity: 0.35 }));
    m.add(e);
  }
  return m;
}

function buildMap(scene: THREE.Scene, L: Layout) {
  const th = L.theme ?? DEFAULT_THEME;
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(220, 220), new THREE.MeshStandardMaterial({ color: hex(th.ground), roughness: 1 }));
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.32;
  scene.add(ground);
  for (const [x0, y0, x1, y1] of L.floor) {
    const f = box(x1 - x0, 0.3, y1 - y0, hex(th.floor));
    f.position.set((x0 + x1) / 2 - 50, -0.15, (y0 + y1) / 2 - 50);
    scene.add(f);
  }
  const grid = new THREE.GridHelper(100, 20, 0x3a3f4a, 0x2f333c);
  grid.position.y = 0.01;
  (grid.material as THREE.Material).transparent = true;
  (grid.material as THREE.Material).opacity = 0.35;
  scene.add(grid);
  for (const p of L.platforms ?? []) {
    const [x0, y0, x1, y1] = p.r;
    const m = box(x1 - x0, p.h, y1 - y0, hex(th.low), { edges: true });
    m.position.set((x0 + x1) / 2 - 50, p.h / 2, (y0 + y1) / 2 - 50);
    scene.add(m);
  }
  for (const b of allBlocks(L)) {
    const [x0, y0, x1, y1] = b.r;
    const m = b.water
      ? box(x1 - x0, 0.1, y1 - y0, 0x1f4a7a, { opacity: 0.85 })
      : b.window
        ? box(x1 - x0, b.h, y1 - y0, 0x7fb2d9, { opacity: 0.5 })
        : box(x1 - x0, b.h, y1 - y0, hex(b.h < 2 ? th.low : th.block), { edges: true });
    m.position.set((x0 + x1) / 2 - 50, b.water ? 0.02 : b.h / 2, (y0 + y1) / 2 - 50);
    if (b.rot) m.rotation.y = (-b.rot * Math.PI) / 180;
    scene.add(m);
  }
}

interface PlayerRig {
  group: THREE.Group;
  facing: number;
}

function playerRig(side: number, name: string): PlayerRig {
  const group = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: TEAM[side], roughness: 0.5, emissive: TEAM[side], emissiveIntensity: 0.25 });
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.5, 1.3, 12), mat);
  body.position.y = 0.65;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.33, 12, 10), mat);
  head.position.y = 1.55;
  const gun = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.16, 0.9), new THREE.MeshStandardMaterial({ color: 0x1b1d22 }));
  gun.position.set(0.25, 1.05, 0.5);
  const tag = label(name, TEAM_CSS[side]!, 0.7);
  tag.position.y = 2.7;
  group.add(body, head, gun, tag);
  // Larger than life so they read at broadcast distance.
  group.scale.setScalar(1.8);
  return { group, facing: 0 };
}


export default function Replay3D({
  map,
  time,
  teams,
  players,
  seed,
}: {
  map: MapResult;
  time: number;
  teams: [string, string];
  players: string[];
  seed: string;
}) {
  const host = useRef<HTMLDivElement>(null);
  const timeRef = useRef(time);
  timeRef.current = time;
  const [cam, setCam] = useState<CamMode>("broadcast");
  const camRef = useRef(cam);
  camRef.current = cam;
  const [target, setTarget] = useState(0);
  const targetRef = useRef(target);
  targetRef.current = target;
  const [callouts, setCallouts] = useState(true);
  const calloutRef = useRef<THREE.Group | null>(null);
  const [mini, setMini] = useState(true);
  const resetRef = useRef<() => void>(() => {});
  const [error, setError] = useState<string | null>(null);

  const tl: Timeline = useMemo(() => timelineFor(map, seed), [map, seed]);
  const hillNames = useMemo(() => hillLabelsOf(map, tl.layout.hills.length), [map, tl]);
  useEffect(() => {
    if (calloutRef.current) calloutRef.current.visible = callouts;
  }, [callouts]);

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true });
    } catch {
      setError("3D needs WebGL, which isn't available in this browser.");
      return;
    }
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
    el.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0d0f13);
    scene.fog = new THREE.Fog(0x0d0f13, 120, 220);
    scene.add(new THREE.HemisphereLight(0xdfe8ff, 0x20242c, 1.1));
    const sun = new THREE.DirectionalLight(0xffffff, 1.4);
    sun.position.set(-40, 80, 30);
    scene.add(sun);

    const camera = new THREE.PerspectiveCamera(45, 1, 0.5, 400);
    const HOME = new THREE.Vector3(0, 56, 46);
    camera.position.copy(HOME);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.maxPolarAngle = Math.PI * 0.47;
    controls.minDistance = 15;
    controls.maxDistance = 160;
    resetRef.current = () => {
      camera.position.copy(HOME);
      controls.target.set(0, 0, 0);
    };
    // Picking up the camera switches to the free camera.
    controls.addEventListener("start", () => setCam("free"));

    const L = tl.layout;
    buildMap(scene, L);

    // Objectives.
    const mode = map.mode;
    const hills = L.hills.map((h) => {
      const fill = box(h.w, 0.08, h.d, 0xffffff, { opacity: 0.12 });
      fill.position.set(h.x - 50, heightAt(L, h.x, h.y) + 0.05, h.y - 50);
      const column = box(h.w, 7, h.d, 0xffffff, { opacity: 0.07 });
      column.position.y = 3.5;
      fill.add(column);
      fill.visible = mode === "hp";
      scene.add(fill);
      return fill;
    });
    // Callouts: area names on the ground (hills, sites, and any the layout lists).
    const calloutGroup = new THREE.Group();
    const callout = (p: Pt, text: string) => {
      const s = label(text, "rgba(0,0,0,0.35)", 0.9);
      s.position.copy(W(p)).setY(1.2 + heightAt(L, p.x, p.y));
      calloutGroup.add(s);
    };
    if (mode === "hp") L.hills.forEach((h, i) => hillNames.get(i) && callout({ x: h.x, y: h.y + h.d / 2 + 2 }, hillNames.get(i)!.replace(/^P\d+\s*/, "")));
    for (const c of L.callouts ?? []) callout(c, c.text);
    calloutGroup.visible = callouts;
    calloutRef.current = calloutGroup;
    scene.add(calloutGroup);
    const hillTags = L.hills.map((h, i) => {
      const s = label(hillNames.get(i) ?? `P${i + 1}`, "rgba(20,22,28,0.85)", 1.6);
      s.position.set(h.x - 50, 9.5 + heightAt(L, h.x, h.y), h.y - 50);
      s.visible = false;
      scene.add(s);
      return s;
    });

    const pad = (p: Pt, text: string, size = 6) => {
      const m = box(size, 0.08, size, 0xffffff, { opacity: 0.16 });
      m.position.copy(W(p)).setY(0.05 + heightAt(L, p.x, p.y));
      const s = label(text, "rgba(201,152,30,0.95)", 2.6);
      s.position.copy(m.position).setY(4.5);
      scene.add(m, s);
      return m;
    };
    const sites = mode === "snd" ? { A: pad(L.snd.A, "A"), B: pad(L.snd.B, "B") } : null;
    const zones = mode === "control" ? [pad(L.control.A, "A", 9), pad(L.control.B, "B", 9)] : null;
    const goals =
      mode === "overload"
        ? L.overload.goals.map((p) => {
            const ring = new THREE.Mesh(new THREE.TorusGeometry(3, 0.25, 8, 32), new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 0.3 }));
            ring.rotation.x = Math.PI / 2;
            ring.position.copy(W(p)).setY(0.3 + heightAt(L, p.x, p.y));
            scene.add(ring);
            return ring;
          })
        : null;
    const bomb = box(0.9, 0.5, 0.6, 0xff4040);
    (bomb.material as THREE.MeshStandardMaterial).emissive = new THREE.Color(0xff2020);
    bomb.visible = false;
    scene.add(bomb);
    const blast = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 14), new THREE.MeshBasicMaterial({ color: 0xffa040, transparent: true, opacity: 0.5 }));
    blast.visible = false;
    scene.add(blast);
    const device = new THREE.Mesh(new THREE.OctahedronGeometry(0.7), new THREE.MeshStandardMaterial({ color: 0xffe066, emissive: 0xffcc33, emissiveIntensity: 0.9 }));
    device.visible = mode === "overload";
    scene.add(device);

    // Players, tracers and death markers.
    const rigs = players.map((n, i) => {
      const r = playerRig(i < 4 ? 0 : 1, n);
      scene.add(r.group);
      return r;
    });
    const tracers = Array.from({ length: 10 }, () => {
      const g = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
      const l = new THREE.Line(g, new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true }));
      l.visible = false;
      scene.add(l);
      return l;
    });
    const marks = Array.from({ length: 10 }, () => {
      const m = new THREE.Mesh(new THREE.RingGeometry(0.7, 1.3, 4), new THREE.MeshBasicMaterial({ transparent: true, side: THREE.DoubleSide }));
      m.rotation.x = -Math.PI / 2;
      m.visible = false;
      scene.add(m);
      return m;
    });

    const focus = new THREE.Vector3();
    const resize = () => {
      const w = el.clientWidth;
      const h = el.clientHeight;
      renderer.setSize(w, h);
      camera.aspect = w / Math.max(1, h);
      camera.updateProjectionMatrix();
    };
    const ro = new ResizeObserver(resize);
    ro.observe(el);
    resize();

    let raf = 0;
    const frame = () => {
      raf = requestAnimationFrame(frame);
      const t = timeRef.current;
      const o = objAt(tl, t);

      // Objectives.
      if (mode === "hp") {
        const idx = o[0]!;
        hills.forEach((h, i) => {
          const active = i === idx;
          const mat = h.material as THREE.MeshStandardMaterial;
          const owner = o[1]!;
          mat.color.setHex(active && owner >= 0 ? TEAM[owner]! : 0xffffff);
          mat.opacity = active ? (owner >= 0 ? 0.45 : 0.25) : 0.06;
          (h.children[0] as THREE.Mesh).visible = active;
          ((h.children[0] as THREE.Mesh).material as THREE.MeshStandardMaterial).color.copy(mat.color);
          hillTags[i]!.visible = active;
        });
        focus.copy(W(L.hills[idx]!));
      }
      if (sites) {
        const [site, state] = [o[0]!, o[1]!];
        bomb.visible = site > 0 && state !== 3;
        if (site > 0) {
          const p = W(site === 1 ? L.snd.A : L.snd.B);
          bomb.position.set(p.x, 0.3 + heightAt(L, p.x + 50, p.z + 50), p.z);
          const m = bomb.material as THREE.MeshStandardMaterial;
          m.color.setHex(state === 2 ? 0x4cc38a : 0xff4040);
          m.emissiveIntensity = state === 1 ? 0.4 + 0.6 * Math.abs(Math.sin(t * 6)) : 0.2;
          focus.copy(p);
        } else {
          focus.lerp(W({ x: (L.snd.A.x + L.snd.B.x) / 2, y: (L.snd.A.y + L.snd.B.y) / 2 }), 0.02);
        }
        blast.visible = state === 3;
        if (state === 3) {
          blast.position.copy(bomb.position);
          blast.scale.setScalar(4 + 6 * Math.abs(Math.sin(t * 2)));
        }
      }
      if (zones) {
        const [taken, atk, cur] = [o[0]!, o[1]!, o[2]!];
        zones.forEach((z, i) => {
          const m = z.material as THREE.MeshStandardMaterial;
          m.color.setHex(i < taken ? TEAM[atk]! : 0xffffff);
          m.opacity = i < taken ? 0.4 : i === cur ? 0.25 : 0.12;
        });
        focus.copy(W(cur === 0 ? L.control.A : L.control.B));
      }
      if (goals) {
        const swapped = o[3]!;
        // goals[k] sits by spawn k; it's defended by the team spawning there.
        goals.forEach((g, k) => {
          const defender = swapped ? 1 - k : k;
          (g.material as THREE.MeshStandardMaterial).color.setHex(TEAM[defender]!);
          (g.material as THREE.MeshStandardMaterial).emissive.setHex(TEAM[defender]!);
        });
        device.position.set(o[0]! - 50, 2.4 + Math.sin(t * 3) * 0.2, o[1]! - 50);
        device.rotation.y = t * 1.5;
        focus.set(o[0]! - 50, 0, o[1]! - 50);
      }

      // Players.
      rigs.forEach((r, p) => {
        const now = positionAt(tl, p, t);
        r.group.visible = now.alive;
        if (!now.alive) return;
        r.group.position.set(now.x - 50, heightAt(L, now.x, now.y), now.y - 50);
        const before = positionAt(tl, p, t - 0.3);
        const dx = now.x - before.x;
        const dy = now.y - before.y;
        if (Math.hypot(dx, dy) > 0.15) r.facing = Math.atan2(dx, dy);
        // Face whoever this player is about to shoot or be shot by.
        const k = tl.kills.find((x) => (x.by === p || x.on === p) && x.t >= t - 0.2 && x.t <= t + 1.2);
        if (k) {
          const other = positionAt(tl, k.by === p ? k.on : k.by, t);
          r.facing = Math.atan2(other.x - now.x, other.y - now.y);
        }
        r.group.rotation.y = r.facing;
      });

      // Kill tracers (fade over half a second) and death markers (three seconds).
      let ti = 0;
      let mi = 0;
      for (let i = tl.kills.length - 1; i >= 0 && tl.kills[i]!.t > t - 3; i--) {
        const k = tl.kills[i]!;
        if (k.t > t) continue;
        const age = t - k.t;
        if (age < 0.5 && ti < tracers.length) {
          const l = tracers[ti++]!;
          const a = W(k.from).setY(1.1);
          const b = W(k.to).setY(1.1);
          (l.geometry as THREE.BufferGeometry).setFromPoints([a, b]);
          const m = l.material as THREE.LineBasicMaterial;
          m.color.setHex(TEAM[k.by < 4 ? 0 : 1]!);
          m.opacity = 1 - age / 0.5;
          l.visible = true;
        }
        if (mi < marks.length) {
          const m = marks[mi++]!;
          m.position.copy(W(k.to)).setY(0.06);
          const mat = m.material as THREE.MeshBasicMaterial;
          mat.color.setHex(TEAM[k.on < 4 ? 0 : 1]!);
          mat.opacity = 0.8 * (1 - age / 3);
          m.visible = true;
        }
      }
      for (; ti < tracers.length; ti++) tracers[ti]!.visible = false;
      for (; mi < marks.length; mi++) marks[mi]!.visible = false;

      const mode2 = camRef.current;
      if (mode2 === "action") {
        // Cut to the latest fight for a couple of seconds, else the objective.
        const k = [...tl.kills].reverse().find((x) => x.t <= t && x.t > t - 2.5);
        if (k) focus.copy(W(k.to));
      }
      if (mode2 === "player") {
        const at = positionAt(tl, targetRef.current, t);
        focus.set(at.x - 50, 0, at.y - 50);
      }
      if (mode2 !== "free") {
        // Glide the camera with its target so the view keeps its angle.
        const before = controls.target.clone();
        controls.target.lerp(focus, mode2 === "player" ? 0.12 : 0.05);
        camera.position.add(controls.target.clone().sub(before));
        if (mode2 === "overhead") camera.position.lerp(controls.target.clone().add(new THREE.Vector3(0, 95, 0.1)), 0.08);
        if (mode2 === "player") {
          const want = controls.target.clone().add(new THREE.Vector3(0, 26, 22));
          camera.position.lerp(want, 0.05);
        }
      }
      controls.update();
      renderer.render(scene, camera);
    };
    frame();

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      controls.dispose();
      scene.traverse((o) => {
        const m = o as THREE.Mesh;
        m.geometry?.dispose();
        const mats = Array.isArray(m.material) ? m.material : m.material ? [m.material] : [];
        for (const mat of mats) {
          (mat as THREE.SpriteMaterial).map?.dispose();
          mat.dispose();
        }
      });
      renderer.dispose();
      renderer.domElement.remove();
    };
    // Players' names and teams don't change while a map is open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tl]);

  if (error) return <div className="replay-msg">{error}</div>;
  const L = tl.layout;
  return (
    <div className="replay">
      <div ref={host} className="replay-canvas" />
      <div className="replay-hud">
        <span className="pill" title={L.note}>
          {L.kind === "traced" ? "Approximate layout" : "Stand-in layout"}
        </span>
        <span className="replay-teams">
          <i style={{ background: TEAM_CSS[0] }} /> {teams[0]} <i style={{ background: TEAM_CSS[1] }} /> {teams[1]}
        </span>
      </div>
      <div className="replay-cam">
        <select className="plain" value={cam} onChange={(e) => setCam(e.target.value as CamMode)} aria-label="Camera">
          {(Object.keys(CAM_LABEL) as CamMode[]).map((c) => (
            <option key={c} value={c}>
              {CAM_LABEL[c]}
            </option>
          ))}
        </select>
        {cam === "player" && (
          <select className="plain" value={target} onChange={(e) => setTarget(Number(e.target.value))} aria-label="Player to follow">
            {players.map((n, i) => (
              <option key={i} value={i}>
                {n}
              </option>
            ))}
          </select>
        )}
        <button className="btn small" aria-pressed={callouts} onClick={() => setCallouts(!callouts)} title="Area names on the map">
          Callouts
        </button>
        <button className="btn small" aria-pressed={mini} onClick={() => setMini(!mini)} title="2D minimap in the corner">
          Minimap
        </button>
        <button
          className="btn small"
          onClick={() => {
            resetRef.current();
            setCam("broadcast");
          }}
        >
          Reset view
        </button>
      </div>
      <KillFeed tl={tl} time={time} players={players} />
      {mini && (
        <div className="replay-mini">
          <Replay2D tl={tl} map={map} time={time} players={players} hillLabels={hillNames} mini highlight={cam === "player" ? target : undefined} />
        </div>
      )}
      <div className="replay-credit">
        {L.kind === "edited" ? (
          "Your edited layout (map editor). Drag to orbit, scroll to zoom."
        ) : L.kind === "traced" && L.source ? (
          <>
            Layout traced by eye from the{" "}
            <a href={L.source} target="_blank" rel="noreferrer">
              GamesAtlas minimap
            </a>
            ; sites and zones approximate. Drag to orbit, scroll to zoom.
          </>
        ) : (
          "No traced layout for this map yet. Drag to orbit, scroll to zoom."
        )}
      </div>
    </div>
  );
}

/** The last few kills, broadcast style. */
function KillFeed({ tl, time, players }: { tl: Timeline; time: number; players: string[] }) {
  const recent = tl.kills.filter((k) => k.t <= time && k.t > time - 8).slice(-5).reverse();
  if (!recent.length) return null;
  return (
    <div className="replay-feed" aria-label="Kill feed">
      {recent.map((k, i) => (
        <div key={`${k.t}-${k.by}-${k.on}-${i}`} style={{ opacity: 1 - (time - k.t) / 9 }}>
          <b style={{ color: TEAM_CSS[k.by < 4 ? 0 : 1] }}>{players[k.by]}</b> <span className="muted">✕</span> <b style={{ color: TEAM_CSS[k.on < 4 ? 0 : 1] }}>{players[k.on]}</b>
        </div>
      ))}
    </div>
  );
}
