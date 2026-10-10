import type { Vow } from "./chain";
import { hash01, type Phase, phaseOf } from "./format";

type Lamp = {
  id: number; keeper: string;
  x: number; y: number; tx: number; ty: number;
  r: number; state: number; deadline: number; seed: number;
};
type Spark = { x: number; y: number; vx: number; vy: number; life: number; kind: number; size: number };
type Drift = { x: number; y: number; v: number; s: number };

const frac = (n: number) => n - Math.floor(n);
const TONES: Record<number, [number, number, number]> = {
  0: [255, 180, 84],
  1: [255, 232, 160],
  2: [190, 78, 52],
  3: [150, 144, 196],
};

export type SkyEvents = {
  onPick: (id: number | null) => void;
  onHover: (id: number | null, x: number, y: number) => void;
};

export function createSky(canvas: HTMLCanvasElement, ev: SkyEvents) {
  const ctx = canvas.getContext("2d")!;
  const calm = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const stars = Array.from({ length: 260 }, (_, i) => ({
    x: frac(i * 0.7548776662),
    y: frac(i * 0.569840291) ** 1.5 * 0.86,
    s: 0.4 + frac(i * 0.318) * 1.2,
    p: frac(i * 0.123) * 6.28,
  }));
  let w = 0, h = 0, raf = 0;
  let lamps: Lamp[] = [];
  let sparks: Spark[] = [];
  let drift: Drift[] = [];
  let selected: number | null = null;
  let hover: number | null = null;
  let filter: Phase | "all" = "all";
  let owner: string | null = null;
  let shoot: { x: number; y: number; vx: number; vy: number; life: number } | null = null;
  let clock = () => Math.floor(Date.now() / 1000);
  let lastVows: Vow[] = [];
  const t0 = performance.now();

  function resize() {
    const dpr = Math.min(devicePixelRatio || 1, 2);
    w = canvas.clientWidth;
    h = canvas.clientHeight;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (lastVows.length) lamps = layout(lastVows, new Map(lamps.map((l) => [l.id, l])));
  }

  function burst(px: number, py: number, kind: number) {
    if (calm) return;
    const n = kind === 1 ? 46 : 28;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * 6.283;
      const sp = 0.4 + Math.random() * (kind === 1 ? 2.4 : 1.4);
      sparks.push({
        x: px, y: py, kind, size: 1.2 + Math.random() * 1.8, life: 1,
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp + (kind === 1 ? -0.6 : 0.5),
      });
    }
  }

  // Kept lanterns rise, open ones hover mid-sky, spent ones sink toward the water.
  // Targets are laid out in pixels inside safe margins, then nudged apart.
  function layout(vows: Vow[], prev: Map<number, Lamp>) {
    const narrow = w < 720;
    const top = narrow ? 225 : 110;
    const bottom = narrow ? 170 : 120;
    const span = Math.max(120, h - top - bottom);
    const scale = narrow ? 0.72 : 1;
    const pts = vows.map((v) => {
      const cx = 0.1 + hash01(v.keeper.toLowerCase(), 9) * 0.8;
      const fx = Math.min(0.94, Math.max(0.06, cx + (frac(v.id * 0.61803398875) - 0.5) * 0.15));
      const band =
        v.state === 1 ? frac(v.id * 0.29) * 0.28
        : v.state === 0 || v.state === 4 ? 0.36 + frac(v.id * 0.37) * 0.32
        : 0.78 + frac(v.id * 0.41) * 0.22;
      const pool = Number((BigInt(v.stake) + BigInt(v.faith) + BigInt(v.doubt)) / 10n ** 16n);
      return { v, x: fx * w, y: top + band * span, r: (15 + Math.min(20, Math.log10(1 + pool) * 7)) * scale };
    });
    for (let it = 0; it < 40; it++) {
      for (let i = 0; i < pts.length; i++) {
        for (let j = i + 1; j < pts.length; j++) {
          const a = pts[i], b = pts[j];
          const dx = b.x - a.x, dy = b.y - a.y;
          const d = Math.hypot(dx, dy) || 0.01;
          const need = (a.r + b.r) * 1.9;
          if (d < need) {
            const push = (need - d) / 2;
            const ux = dx / d, uy = dy / d;
            a.x -= ux * push; a.y -= uy * push * 0.6;
            b.x += ux * push; b.y += uy * push * 0.6;
          }
        }
      }
      for (const p of pts) {
        p.x = Math.min(w - 30, Math.max(30, p.x));
        p.y = Math.min(h - bottom + 40, Math.max(top, p.y));
      }
    }
    return pts.map(({ v, x, y, r }) => {
      const old = prev.get(v.id);
      const lamp: Lamp = {
        id: v.id, keeper: v.keeper.toLowerCase(), tx: x / w, ty: y / h, state: v.state,
        deadline: v.deadline, seed: frac(v.id * 0.777), r,
        x: old?.x ?? x / w, y: old?.y ?? Math.min(0.98, y / h + 0.25),
      };
      if (old && old.state !== v.state) burst(old.x * w, old.y * h, v.state);
      return lamp;
    });
  }

  function setVows(vows: Vow[]) {
    lastVows = vows;
    lamps = layout(vows, new Map(lamps.map((l) => [l.id, l])));
  }

  function setAsh(embers: string) {
    const units = Number(BigInt(embers) / 10n ** 16n);
    const n = calm ? 0 : Math.min(90, Math.floor(Math.log10(1 + units) * 22));
    while (drift.length < n) drift.push({ x: Math.random(), y: Math.random(), v: 0.02 + Math.random() * 0.05, s: 0.6 + Math.random() * 1.2 });
    drift.length = Math.min(drift.length, n);
  }

  function lampAt(px: number, py: number): number | null {
    for (let i = lamps.length - 1; i >= 0; i--) {
      const l = lamps[i];
      if (Math.hypot(px - l.x * w, py - l.y * h) < l.r * 1.5) return l.id;
    }
    return null;
  }

  const matches = (l: Lamp) =>
    (filter === "all" || phaseOf(l.state, l.deadline, clock()) === filter) && (owner === null || l.keeper === owner);

  function constellations(t: number) {
    const byKeeper = new Map<string, Lamp[]>();
    for (const l of lamps) (byKeeper.get(l.keeper) ?? byKeeper.set(l.keeper, []).get(l.keeper)!).push(l);
    ctx.lineWidth = 1;
    for (const all of byKeeper.values()) {
      const group = all.filter((l) => l.state === 1).sort((a, b) => a.id - b.id);
      if (group.length < 2) continue;
      for (let i = 1; i < group.length; i++) {
        const a = group[i - 1], b = group[i];
        if (a.state !== 1 || b.state !== 1) continue;
        ctx.strokeStyle = `rgba(255,226,154,${0.3 + 0.08 * Math.sin(t)})`;
        ctx.beginPath();
        ctx.moveTo(a.x * w, a.y * h);
        ctx.lineTo(b.x * w, b.y * h);
        ctx.stroke();
      }
    }
  }

  function draw(now: number) {
    const t = (now - t0) / 1000;
    const nowS = clock();

    const sky = ctx.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, "#060716");
    sky.addColorStop(0.55, "#17123a");
    sky.addColorStop(1, "#3a1f3f");
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, w, h);

    const moon = ctx.createRadialGradient(w * 0.84, h * 0.16, 0, w * 0.84, h * 0.16, Math.min(w, h) * 0.34);
    moon.addColorStop(0, "rgba(243,233,210,0.55)");
    moon.addColorStop(0.1, "rgba(243,233,210,0.18)");
    moon.addColorStop(1, "rgba(243,233,210,0)");
    ctx.fillStyle = moon;
    ctx.fillRect(0, 0, w, h);

    for (const s of stars) {
      ctx.globalAlpha = calm ? 0.6 : 0.3 + 0.5 * Math.sin(t * 1.2 + s.p) ** 2;
      ctx.fillStyle = "#f3e9d2";
      ctx.fillRect(s.x * w, s.y * h, s.s, s.s);
    }
    ctx.globalAlpha = 1;

    // now and then a shooting star crosses the upper sky
    if (!calm) {
      if (shoot === null && Math.random() < 0.0012) {
        shoot = { x: w * (0.25 + Math.random() * 0.7), y: h * (0.03 + Math.random() * 0.22), vx: -(6 + Math.random() * 3), vy: 2.4 + Math.random() * 1.6, life: 1 };
      }
      const star = shoot;
      if (star !== null) {
        const trail = ctx.createLinearGradient(star.x, star.y, star.x - star.vx * 9, star.y - star.vy * 9);
        trail.addColorStop(0, `rgba(243,233,210,${0.85 * star.life})`);
        trail.addColorStop(1, "rgba(243,233,210,0)");
        ctx.strokeStyle = trail;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(star.x, star.y);
        ctx.lineTo(star.x - star.vx * 9, star.y - star.vy * 9);
        ctx.stroke();
        star.x += star.vx;
        star.y += star.vy;
        star.life -= 0.016;
        if (star.life <= 0 || star.x < -40 || star.y > h) shoot = null;
      }
    }

    // dark water with a warm reflection along the bottom
    const water = ctx.createLinearGradient(0, h * 0.9, 0, h);
    water.addColorStop(0, "rgba(255,120,60,0)");
    water.addColorStop(1, "rgba(255,120,60,0.18)");
    ctx.fillStyle = water;
    ctx.fillRect(0, h * 0.9, w, h * 0.1);

    ctx.globalCompositeOperation = "lighter";
    constellations(t);

    for (const l of lamps) {
      l.x += (l.tx - l.x) * 0.02;
      l.y += (l.ty - l.y) * 0.012;
      const bob = calm ? 0 : Math.sin(t * 0.8 + l.seed * 6.28) * 6;
      const px = l.x * w, py = l.y * h + bob;
      const [r, g, b] = TONES[l.state] ?? TONES[0];
      const due = l.state === 0 && nowS >= l.deadline;
      const flick = calm ? 1 : 0.85 + 0.15 * Math.sin(t * 7 + l.seed * 20) * Math.sin(t * 3.1 + l.seed);
      const fade = matches(l) ? 1 : 0.16;
      const power = (l.state === 2 ? 0.3 : l.state === 3 ? 0.42 : l.state === 1 ? 0.9 : 0.8) * flick * fade;
      const boost = l.id === selected || l.id === hover ? 1.25 : 1;

      const glow = ctx.createRadialGradient(px, py, 0, px, py, l.r * 3.6 * boost);
      glow.addColorStop(0, `rgba(${r},${g},${b},${0.55 * power})`);
      glow.addColorStop(1, `rgba(${r},${g},${b},0)`);
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(px, py, l.r * 3.6 * boost, 0, 6.283);
      ctx.fill();

      const bw = l.r * 1.5, bh = l.r * 2;
      ctx.beginPath();
      ctx.roundRect(px - bw / 2, py - bh / 2, bw, bh, l.r * 0.55);
      const body = ctx.createLinearGradient(px, py - bh / 2, px, py + bh / 2);
      body.addColorStop(0, `rgba(${r},${g},${b},${0.55 * power})`);
      body.addColorStop(0.5, `rgba(${Math.min(255, r + 40)},${Math.min(255, g + 40)},${Math.min(255, b + 40)},${0.9 * power})`);
      body.addColorStop(1, `rgba(${r},${g},${b},${0.5 * power})`);
      ctx.fillStyle = body;
      ctx.fill();

      // paper ribs
      ctx.strokeStyle = `rgba(${r},${g},${b},${0.38 * power})`;
      ctx.lineWidth = 1;
      for (const k of [-0.3, 0.3]) {
        ctx.beginPath();
        ctx.moveTo(px + k * bw, py - bh / 2 + 3);
        ctx.quadraticCurveTo(px + k * bw * 1.3, py, px + k * bw, py + bh / 2 - 3);
        ctx.stroke();
      }

      if (due) {
        ctx.strokeStyle = `rgba(150,190,255,${(0.35 + 0.3 * Math.sin(t * 2.4)) * fade})`;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(px, py, l.r * (1.9 + (calm ? 0 : 0.15 * Math.sin(t * 2.4))), 0, 6.283);
        ctx.stroke();
      }
      if (l.id === selected) {
        ctx.strokeStyle = "rgba(243,233,210,0.8)";
        ctx.lineWidth = 1;
        ctx.setLineDash([3, 5]);
        ctx.beginPath();
        ctx.arc(px, py, l.r * 1.75, 0, 6.283);
        ctx.stroke();
        ctx.setLineDash([]);
      }
      if (!calm && fade === 1 && sparks.length < 320 && Math.random() < (l.state === 1 ? 0.35 : l.state === 2 ? 0.08 : 0.04)) {
        const up = l.state === 1;
        sparks.push({
          x: px + (Math.random() - 0.5) * l.r, y: py + bh / 2, kind: l.state, size: 1.6,
          vx: (Math.random() - 0.5) * 0.25, vy: up ? -0.3 - Math.random() * 0.4 : 0.15 + Math.random() * 0.3, life: 1,
        });
      }
    }

    sparks = sparks.filter((s) => s.life > 0);
    for (const s of sparks) {
      s.x += s.vx * 2; s.y += s.vy * 2; s.vy += 0.004; s.life -= 0.008;
      const [r, g, b] = TONES[s.kind] ?? TONES[0];
      ctx.fillStyle = `rgba(${r},${g},${b},${Math.max(0, s.life) * 0.85})`;
      ctx.fillRect(s.x, s.y, s.size, s.size);
    }

    // ash from burned stakes drifts down through the whole sky
    ctx.fillStyle = "rgba(255,150,100,0.35)";
    for (const d of drift) {
      d.y += d.v / 60;
      if (d.y > 1) { d.y = -0.02; d.x = Math.random(); }
      ctx.fillRect(d.x * w + Math.sin(t * 0.6 + d.x * 9) * 8, d.y * h, d.s, d.s);
    }
    ctx.globalCompositeOperation = "source-over";
    raf = requestAnimationFrame(draw);
  }

  const move = (e: PointerEvent) => {
    const r = canvas.getBoundingClientRect();
    const x = e.clientX - r.left, y = e.clientY - r.top;
    const id = lampAt(x, y);
    if (id !== hover) { hover = id; ev.onHover(id, x, y); }
    canvas.style.cursor = id === null ? "default" : "pointer";
  };
  const leave = () => { hover = null; ev.onHover(null, 0, 0); };
  const click = (e: MouseEvent) => {
    const r = canvas.getBoundingClientRect();
    ev.onPick(lampAt(e.clientX - r.left, e.clientY - r.top));
  };
  canvas.addEventListener("pointermove", move);
  canvas.addEventListener("pointerleave", leave);
  canvas.addEventListener("click", click);
  addEventListener("resize", resize);
  resize();
  raf = requestAnimationFrame(draw);

  return {
    setVows,
    setAsh,
    setSelected: (id: number | null) => { selected = id; },
    setFilter: (f: Phase | "all") => { filter = f; },
    setOwner: (a: string | null) => { owner = a === null ? null : a.toLowerCase(); },
    setClock: (fn: () => number) => { clock = fn; },
    positionOf(id: number) {
      const l = lamps.find((x) => x.id === id);
      return l ? { x: l.x * w, y: l.y * h, r: l.r } : null;
    },
    destroy() {
      cancelAnimationFrame(raf);
      canvas.removeEventListener("pointermove", move);
      canvas.removeEventListener("pointerleave", leave);
      canvas.removeEventListener("click", click);
      removeEventListener("resize", resize);
    },
  };
}
