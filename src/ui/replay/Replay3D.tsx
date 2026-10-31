// 3D playback of one map, drawn from the replay timeline. Loaded lazily (three.js is
// big), and driven entirely by the `time` prop, so the parent's clock, scrubber and
// speed controls work the same as the text feed. It only ever draws up to `time`.
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { MapResult } from "../../engine";
import { layoutFor, type Layout, type Pt } from "./layouts";
import { buildTimeline, hillIndex, objAt, positionAt, type Timeline } from "./timeline";

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
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(220, 220), new THREE.MeshStandardMaterial({ color: 0x121419, roughness: 1 }));
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.32;
  scene.add(ground);
  for (const [x0, y0, x1, y1] of L.floor) {
    const f = box(x1 - x0, 0.3, y1 - y0, 0x2b2f37);
    f.position.set((x0 + x1) / 2 - 50, -0.15, (y0 + y1) / 2 - 50);
    scene.add(f);
  }
  const grid = new THREE.GridHelper(100, 20, 0x3a3f4a, 0x2f333c);
  grid.position.y = 0.01;
  (grid.material as THREE.Material).transparent = true;
  (grid.material as THREE.Material).opacity = 0.35;
  scene.add(grid);
  for (const b of L.blocks) {
    const [x0, y0, x1, y1] = b.r;
    const m = b.water
      ? box(x1 - x0, 0.1, y1 - y0, 0x1f4a7a, { opacity: 0.85 })
      : box(x1 - x0, b.h, y1 - y0, b.h < 2 ? 0x6a7182 : 0x4a505d, { edges: true });
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

const hillCountOf = (m: MapResult) => Math.max(1, ...m.events.map((e) => (e.k === "hill" ? hillIndex(e.label, e.n) + 1 : 0)));

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
  const [follow, setFollow] = useState(true);
  const followRef = useRef(follow);
  followRef.current = follow;
  const resetRef = useRef<() => void>(() => {});
  const [error, setError] = useState<string | null>(null);

  const tl: Timeline = useMemo(() => buildTimeline(map, layoutFor(map.map, hillCountOf(map)), seed), [map, seed]);

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
    // Picking up the camera turns off follow-the-action.
    controls.addEventListener("start", () => setFollow(false));

    const L = tl.layout;
    buildMap(scene, L);

    // Objectives.
    const mode = map.mode;
    const hills = L.hills.map((h) => {
      const fill = box(h.w, 0.08, h.d, 0xffffff, { opacity: 0.12 });
      fill.position.set(h.x - 50, 0.05, h.y - 50);
      const column = box(h.w, 7, h.d, 0xffffff, { opacity: 0.07 });
      column.position.y = 3.5;
      fill.add(column);
      fill.visible = mode === "hp";
      scene.add(fill);
      return fill;
    });
    const hillNames = new Map<number, string>();
    for (const e of map.events) if (e.k === "hill") hillNames.set(hillIndex(e.label, e.n) % L.hills.length, e.label);
    const hillTags = L.hills.map((h, i) => {
      const s = label(hillNames.get(i) ?? `P${i + 1}`, "rgba(20,22,28,0.85)", 1.6);
      s.position.set(h.x - 50, 9.5, h.y - 50);
      s.visible = false;
      scene.add(s);
      return s;
    });

    const pad = (p: Pt, text: string, size = 6) => {
      const m = box(size, 0.08, size, 0xffffff, { opacity: 0.16 });
      m.position.copy(W(p)).setY(0.05);
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
            ring.position.copy(W(p)).setY(0.3);
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
          bomb.position.set(p.x, 0.3, p.z);
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
        r.group.position.set(now.x - 50, 0, now.y - 50);
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

      if (followRef.current) {
        // Glide the camera with its target so the view keeps its angle.
        const before = controls.target.clone();
        controls.target.lerp(focus, 0.05);
        camera.position.add(controls.target.clone().sub(before));
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
        <button className="btn small" aria-pressed={follow} onClick={() => setFollow(!follow)}>
          Follow action
        </button>
        <button
          className="btn small"
          onClick={() => {
            resetRef.current();
            setFollow(true);
          }}
        >
          Reset view
        </button>
      </div>
      <div className="replay-credit">
        {L.kind === "traced" && L.source ? (
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
