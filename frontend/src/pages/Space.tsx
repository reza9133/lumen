import { useEffect, useRef, useState } from "react";
import { useNow } from "../clock";
import { useVows } from "../context";
import { PHASE_LABEL, alias, gen, phaseOf } from "../format";
import { href } from "../router";
import "./pages.css";

type Handle = ReturnType<typeof import("../space3d").createSpace>;

// The 3D view. three.js is fetched only when this page opens; without WebGL the page says so and points at the sky.
export default function Space() {
  const host = useRef<HTMLDivElement>(null);
  const space = useRef<Handle | null>(null);
  const { vows, loaded } = useVows();
  const now = useNow();
  const [state, setState] = useState<"loading" | "ready" | "nowebgl" | "error">("loading");
  const [tip, setTip] = useState<{ id: number; x: number; y: number } | null>(null);
  const [sel, setSel] = useState<number | null>(null);

  useEffect(() => {
    let dead = false;
    import("../space3d")
      .then((m) => {
        if (dead || !host.current) return;
        if (!m.webglAvailable()) return setState("nowebgl");
        space.current = m.createSpace(host.current, { onHover: (id, x, y) => setTip(id === null ? null : { id, x, y }), onPick: setSel });
        setState("ready");
      })
      .catch(() => !dead && setState("error"));
    return () => {
      dead = true;
      space.current?.destroy();
      space.current = null;
    };
  }, []);
  // Rebuild the scene when the vows change, not every second; the clock only matters when a vow crosses its deadline.
  const phaseKey = vows.map((v) => `${v.id}:${phaseOf(v.state, v.deadline, now)}`).join(",");
  useEffect(() => {
    if (state === "ready") space.current?.setData(vows, now);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, phaseKey, vows]);
  useEffect(() => space.current?.setSelected(sel), [sel]);

  const tipVow = tip ? vows.find((v) => v.id === tip.id) : null;
  const chosen = sel === null ? null : vows.find((v) => v.id === sel) ?? null;

  return (
    <div className="page-in wide">
      <h2 className="page-title">The vows in 3D</h2>
      <p className="lede">Each keeper is a star and each vow orbits it. Kept lanterns rise, broken ones sink, open ones float. Drag to turn, scroll to zoom, click a lantern.</p>
      <div className="space" ref={host}>
        {state === "loading" && <p className="meta overlay" role="status">Loading the 3D scene…</p>}
        {state === "nowebgl" && <p className="meta overlay error" role="alert">This browser cannot draw 3D (WebGL is off). The <a href={href.home}>sky</a> shows the same vows.</p>}
        {state === "error" && <p className="meta overlay error" role="alert">The 3D scene could not be loaded. Check your connection and reload.</p>}
        {state === "ready" && loaded && vows.length === 0 && <p className="meta overlay">No vows yet.</p>}
        {tipVow && tip && (
          <div className="tip" style={{ left: Math.min(tip.x + 16, (host.current?.clientWidth ?? 600) - 260), top: tip.y + 16 }}>
            <strong>{tipVow.text.length > 90 ? `${tipVow.text.slice(0, 90)}…` : tipVow.text}</strong>
            <span>{alias(tipVow.keeper)} · {PHASE_LABEL[phaseOf(tipVow.state, tipVow.deadline, now)]}</span>
          </div>
        )}
      </div>
      <ul className="legend inline" aria-label="Colours">
        {(["burning", "due", "review", "kept", "broken", "unclear", "retracted"] as const).map((p) => <li key={p}><i className={`c-${p}`} />{PHASE_LABEL[p]}</li>)}
      </ul>
      {chosen && (
        <div className="card pick" aria-live="polite">
          <p className="meta"><span className={`pill p-${phaseOf(chosen.state, chosen.deadline, now)}`}>{PHASE_LABEL[phaseOf(chosen.state, chosen.deadline, now)]}</span> {alias(chosen.keeper)} · {gen((BigInt(chosen.stake) + BigInt(chosen.faith) + BigInt(chosen.doubt)).toString())} GEN</p>
          <p className="quote">{chosen.text}</p>
          <p><a href={href.vow(chosen.id)}>Open this vow</a> · <button className="ghost" onClick={() => setSel(null)}>Clear</button></p>
        </div>
      )}
    </div>
  );
}
