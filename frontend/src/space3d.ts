// The vows as a small galaxy. Each keeper is a faint star, and each of their vows orbits it: kept lanterns rise above
// the plane, broken ones sink below it, open ones float in it. This file is the only place that imports three.js, and
// it is loaded on demand when the 3D page opens.
import {
  AdditiveBlending, BufferAttribute, BufferGeometry, Color, Float32BufferAttribute, FogExp2, IcosahedronGeometry, InstancedMesh,
  LineBasicMaterial, LineSegments, Matrix4, MeshBasicMaterial, PerspectiveCamera, Points, Raycaster, Scene, ShaderMaterial, Vector2,
  Vector3, WebGLRenderer,
} from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { Vow } from "./chain";
import { hash01, phaseOf, type Phase } from "./format";

const TONE: Record<Phase, string> = {
  burning: "#ffb454",
  kept: "#ffe8a0",
  broken: "#be4e34",
  unclear: "#9690c4",
  review: "#cdb8ff",
  due: "#a9c8ff",
  retracted: "#a8aab8",
};

export type SpaceEvents = {
  onHover: (id: number | null, x: number, y: number) => void;
  onPick: (id: number | null) => void;
};

type Placed = { id: number; keeper: string; pos: Vector3; r: number; state: number; phase: Phase };

export function webglAvailable(): boolean {
  try {
    const c = document.createElement("canvas");
    return Boolean(c.getContext("webgl2") || c.getContext("webgl"));
  } catch {
    return false;
  }
}

export function createSpace(host: HTMLElement, ev: SpaceEvents) {
  const calm = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const renderer = new WebGLRenderer({ antialias: true, alpha: false, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
  renderer.setClearColor(new Color("#060716"));
  host.appendChild(renderer.domElement);
  renderer.domElement.setAttribute("aria-hidden", "true");

  const scene = new Scene();
  scene.fog = new FogExp2(0x060716, 0.035);
  const camera = new PerspectiveCamera(55, 1, 0.1, 200);
  camera.position.set(0, 7, 14);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.07;
  controls.autoRotate = !calm;
  controls.autoRotateSpeed = 0.35;
  controls.minDistance = 4;
  controls.maxDistance = 60;
  controls.maxPolarAngle = Math.PI * 0.92;

  // distant stars
  const starPos = new Float32Array(1400 * 3);
  for (let i = 0; i < 1400; i++) {
    const r = 55 + hash01(String(i), 3) * 40;
    const th = hash01(String(i), 4) * Math.PI * 2;
    const ph = Math.acos(2 * hash01(String(i), 5) - 1);
    starPos.set([r * Math.sin(ph) * Math.cos(th), r * Math.cos(ph), r * Math.sin(ph) * Math.sin(th)], i * 3);
  }
  const starGeo = new BufferGeometry();
  starGeo.setAttribute("position", new BufferAttribute(starPos, 3));
  const stars = new Points(starGeo, new ShaderMaterial({ ...glow(1.4, 0.55), uniforms: { scale: { value: 1 } } }));
  scene.add(stars);

  let placed: Placed[] = [];
  let mesh: InstancedMesh | null = null;
  let halo: Points | null = null;
  let tethers: LineSegments | null = null;
  let lastVows: Vow[] = [];
  let lastNow = 0;
  let selected: number | null = null;
  let hover: number | null = null;
  let raf = 0;
  let visible = true;
  const dummy = new Matrix4();
  const ray = new Raycaster();
  const pointer = new Vector2();

  function clear() {
    for (const o of [mesh, halo, tethers]) {
      if (!o) continue;
      scene.remove(o);
      (o as any).geometry?.dispose?.();
      (o as any).material?.dispose?.();
    }
    mesh = halo = tethers = null;
  }

  function layout(vows: Vow[], now: number): Placed[] {
    const keepers: string[] = [];
    for (const v of [...vows].sort((a, b) => a.id - b.id)) {
      const k = v.keeper.toLowerCase();
      if (!keepers.includes(k)) keepers.push(k);
    }
    const seen = new Map<string, number>();
    return [...vows].sort((a, b) => a.id - b.id).map((v) => {
      const k = v.keeper.toLowerCase();
      const ki = keepers.indexOf(k);
      const j = seen.get(k) ?? 0;
      seen.set(k, j + 1);
      const a = ki * 2.399963;
      const rr = 3.4 * Math.sqrt(ki + 0.6);
      const cx = Math.cos(a) * rr, cz = Math.sin(a) * rr, cy = (hash01(k, 7) - 0.5) * 1.4;
      const oa = j * 2.1 + hash01(k, 8) * 6.28;
      const orbit = 0.9 + 0.26 * Math.sqrt(j);
      const phase = phaseOf(v.state, v.deadline, now);
      const lift = phase === "kept" ? 1.1 + 0.18 * j : phase === "broken" || phase === "retracted" ? -1.1 - 0.12 * j : phase === "unclear" ? -0.5 : (hash01(String(v.id), 6) - 0.5) * 0.7;
      const pool = Number(BigInt(v.stake) + BigInt(v.faith) + BigInt(v.doubt)) / 1e18;
      return { id: v.id, keeper: k, pos: new Vector3(cx + Math.cos(oa) * orbit, cy + lift, cz + Math.sin(oa) * orbit), r: 0.16 + Math.min(0.34, Math.log10(1 + pool) * 0.26), state: v.state, phase };
    });
  }

  function build() {
    clear();
    placed = layout(lastVows, lastNow);
    const n = placed.length;
    if (n === 0) return;
    mesh = new InstancedMesh(new IcosahedronGeometry(1, 1), new MeshBasicMaterial({ color: 0xffffff }), n);
    const colors = new Float32Array(n * 3);
    const sizes = new Float32Array(n);
    const centers = new Float32Array(n * 3);
    const tmp = new Color();
    placed.forEach((p, i) => {
      dummy.makeScale(p.r, p.r, p.r).setPosition(p.pos);
      mesh!.setMatrixAt(i, dummy);
      tmp.set(TONE[p.phase]);
      mesh!.setColorAt(i, tmp);
      colors.set([tmp.r, tmp.g, tmp.b], i * 3);
      sizes[i] = p.r * 9;
      centers.set([p.pos.x, p.pos.y, p.pos.z], i * 3);
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    scene.add(mesh);

    const g = new BufferGeometry();
    g.setAttribute("position", new Float32BufferAttribute(centers, 3));
    g.setAttribute("color", new Float32BufferAttribute(colors, 3));
    g.setAttribute("size", new Float32BufferAttribute(sizes, 1));
    halo = new Points(g, new ShaderMaterial({ ...glow(0, 0.9), uniforms: { scale: { value: 1 } } }));
    scene.add(halo);

    // the line a keeper draws through their kept vows, as in the sky
    const seg: number[] = [];
    const byKeeper = new Map<string, Placed[]>();
    for (const p of placed) if (p.phase === "kept") (byKeeper.get(p.keeper) ?? byKeeper.set(p.keeper, []).get(p.keeper)!).push(p);
    for (const list of byKeeper.values()) for (let i = 1; i < list.length; i++) seg.push(list[i - 1].pos.x, list[i - 1].pos.y, list[i - 1].pos.z, list[i].pos.x, list[i].pos.y, list[i].pos.z);
    if (seg.length) {
      const lg = new BufferGeometry();
      lg.setAttribute("position", new Float32BufferAttribute(seg, 3));
      tethers = new LineSegments(lg, new LineBasicMaterial({ color: 0xffe29a, transparent: true, opacity: 0.35, blending: AdditiveBlending }));
      scene.add(tethers);
    }
  }

  // Soft round points that add up to a glow. `base` is a fixed size when the geometry has no size attribute.
  function glow(base: number, alpha: number) {
    return {
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      vertexColors: true,
      vertexShader: `
        attribute float size;
        varying vec3 vColor;
        uniform float scale;
        void main() {
          #ifdef USE_COLOR
            vColor = color;
          #else
            vColor = vec3(0.95, 0.91, 0.82);
          #endif
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = ${base > 0 ? base.toFixed(2) : "size"} * scale * (260.0 / -mv.z);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `
        varying vec3 vColor;
        void main() {
          float d = length(gl_PointCoord - 0.5) * 2.0;
          float a = smoothstep(1.0, 0.0, d);
          gl_FragColor = vec4(vColor, a * a * ${alpha.toFixed(2)});
        }`,
    };
  }

  function size() {
    const w = host.clientWidth || 800;
    const h = host.clientHeight || 500;
    renderer.setSize(w, h, false);
    renderer.domElement.style.width = "100%";
    renderer.domElement.style.height = "100%";
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    const s = renderer.getPixelRatio();
    for (const o of [stars, halo]) if (o) ((o.material as ShaderMaterial).uniforms.scale.value = s);
  }

  function frame(t: number) {
    raf = 0;
    controls.update();
    if (!calm && mesh) {
      // a slow bob, one cheap matrix write per lantern
      for (let i = 0; i < placed.length; i++) {
        const p = placed[i];
        const bob = Math.sin(t / 900 + i * 1.3) * 0.05;
        dummy.makeScale(p.r * (p.id === selected ? 1.6 : p.id === hover ? 1.25 : 1), p.r * (p.id === selected ? 1.6 : p.id === hover ? 1.25 : 1), p.r * (p.id === selected ? 1.6 : p.id === hover ? 1.25 : 1)).setPosition(p.pos.x, p.pos.y + bob, p.pos.z);
        mesh.setMatrixAt(i, dummy);
      }
      mesh.instanceMatrix.needsUpdate = true;
    }
    renderer.render(scene, camera);
    if (visible && !document.hidden && (!calm || controls.autoRotate)) raf = requestAnimationFrame(frame);
  }
  const wake = () => {
    if (raf === 0 && visible && !document.hidden) raf = requestAnimationFrame(frame);
  };
  // With reduced motion the scene draws only when something changes.
  controls.addEventListener("change", () => {
    if (calm && raf === 0) raf = requestAnimationFrame(frame);
  });

  const ro = new ResizeObserver(() => { size(); wake(); });
  ro.observe(host);
  const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; if (visible) wake(); });
  io.observe(host);
  const onVis = () => wake();
  document.addEventListener("visibilitychange", onVis);

  function pickAt(clientX: number, clientY: number): number | null {
    if (!mesh) return null;
    const r = renderer.domElement.getBoundingClientRect();
    pointer.set(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(pointer, camera);
    const hit = ray.intersectObject(mesh, false)[0];
    return hit?.instanceId === undefined ? null : placed[hit.instanceId]?.id ?? null;
  }
  const onMove = (e: PointerEvent) => {
    const id = pickAt(e.clientX, e.clientY);
    if (id !== hover) {
      hover = id;
      const r = renderer.domElement.getBoundingClientRect();
      ev.onHover(id, e.clientX - r.left, e.clientY - r.top);
      renderer.domElement.style.cursor = id === null ? "grab" : "pointer";
      if (calm) wake();
    }
  };
  let down = { x: 0, y: 0 };
  const onDown = (e: PointerEvent) => { down = { x: e.clientX, y: e.clientY }; };
  const onUp = (e: PointerEvent) => {
    if (Math.hypot(e.clientX - down.x, e.clientY - down.y) > 5) return; // a drag, not a click
    ev.onPick(pickAt(e.clientX, e.clientY));
  };
  renderer.domElement.addEventListener("pointermove", onMove);
  renderer.domElement.addEventListener("pointerdown", onDown);
  renderer.domElement.addEventListener("pointerup", onUp);
  renderer.domElement.style.cursor = "grab";
  size();
  wake();

  return {
    setData(vows: Vow[], now: number) {
      lastVows = vows;
      lastNow = now;
      build();
      size();
      wake();
    },
    setSelected(id: number | null) {
      selected = id;
      const p = placed.find((x) => x.id === id);
      if (p) controls.target.lerp(p.pos, 0.6);
      wake();
    },
    // Numbers for the tests: how many lanterns are drawn.
    count: () => placed.length,
    destroy() {
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
      document.removeEventListener("visibilitychange", onVis);
      renderer.domElement.removeEventListener("pointermove", onMove);
      renderer.domElement.removeEventListener("pointerdown", onDown);
      renderer.domElement.removeEventListener("pointerup", onUp);
      controls.dispose();
      clear();
      starGeo.dispose();
      (stars.material as ShaderMaterial).dispose();
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}
