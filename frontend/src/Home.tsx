import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Vow } from "./chain";
import { useNow } from "./clock";
import { useActions, useSource, useSync, useVows } from "./context";
import { PHASE_LABEL, alias, gen, type Phase } from "./format";
import Ledger from "./Ledger";
import { createSky } from "./sky";
import VowView from "./VowView";

const FILTERS: (Phase | "all")[] = ["all", "burning", "due", "review", "kept", "broken", "retracted"];

// The home page: the night sky with one lantern per vow, a ledger view, filters and the details drawer.
export default function Home({ routeVow, onLight }: { routeVow: number | null; onLight: () => void }) {
  const source = useSource();
  const sync = useSync();
  const { vows, stats, loaded } = useVows();
  const { me } = useActions();
  const canvas = useRef<HTMLCanvasElement>(null);
  const sky = useRef<ReturnType<typeof createSky> | null>(null);
  const [sel, setSel] = useState<number | null>(routeVow);
  const [view, setView] = useState<"sky" | "ledger">("sky");
  const [filter, setFilter] = useState<Phase | "all">("all");
  const [tip, setTip] = useState<{ id: number; x: number; y: number } | null>(null);
  const [mineOnly, setMineOnly] = useState(false);
  const [far, setFar] = useState<Vow | null>(null);
  const now = useNow();

  // Selecting a vow also writes it to the address bar, so every vow has a link that can be shared.
  const pick = useCallback((id: number | null) => {
    setSel(id);
    try {
      history.replaceState(null, "", id === null ? `${location.pathname}${location.search}` : `#vow=${id}`);
    } catch {
      /* the address bar is optional */
    }
  }, []);
  useEffect(() => setSel(routeVow), [routeVow]);

  useEffect(() => {
    sky.current = createSky(canvas.current!, { onPick: pick, onHover: (id, x, y) => setTip(id === null ? null : { id, x, y }) });
    sky.current.setClock(source.now);
    return () => sky.current?.destroy();
  }, [pick, source]);
  useEffect(() => sky.current?.setVows(vows), [vows]);
  useEffect(() => { if (stats) sky.current?.setAsh(stats.embers); }, [stats]);
  useEffect(() => sky.current?.setSelected(sel), [sel]);
  useEffect(() => sky.current?.setFilter(filter), [filter]);
  useEffect(() => sky.current?.setOwner(mineOnly && me ? me : null), [mineOnly, me]);
  useEffect(() => sky.current?.setPaused(view === "ledger"), [view]);
  useEffect(() => { if (!me) setMineOnly(false); }, [me]);
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if (e.key === "Escape" && sel !== null && !document.querySelector(".scrim")) pick(null);
    };
    addEventListener("keydown", on);
    return () => removeEventListener("keydown", on);
  }, [sel, pick]);

  // A link can point at a vow older than the pages that are loaded.
  const listed = vows.find((x) => x.id === sel) ?? null;
  useEffect(() => {
    setFar(null);
    if (sel === null || listed) return undefined;
    let live = true;
    source.vow(sel).then((v) => live && setFar(v)).catch(() => {});
    return () => { live = false; };
  }, [sel, listed, source]);
  const v = listed ?? (far && far.id === sel ? far : null);

  const mine = me ? me.toLowerCase() : null;
  const shown = useMemo(() => (mineOnly && mine ? vows.filter((x) => x.keeper.toLowerCase() === mine) : vows), [vows, mineOnly, mine]);
  const total = stats ? stats.kept + stats.broken : 0;
  const tipVow = tip ? vows.find((x) => x.id === tip.id) : null;

  return (
    <>
      <canvas ref={canvas} className={`sky${view === "ledger" ? " dim" : ""}`} aria-label="A night sky with one lantern for each vow" />
      {stats && (
        <dl className="tally">
          <div><dt>Lit</dt><dd>{stats.total}</dd></div>
          <div><dt>Kept</dt><dd>{stats.kept}</dd></div>
          <div><dt>Broken</dt><dd>{stats.broken}</dd></div>
          {stats.retracted > 0 && <div><dt>Retracted</dt><dd>{stats.retracted}</dd></div>}
          {total > 0 && <div><dt>Kept rate</dt><dd>{Math.round((stats.kept * 100) / total)}%</dd></div>}
          <div><dt>Embers burned</dt><dd>{gen(stats.embers)}</dd></div>
          <div><dt>Paid out</dt><dd>{gen(stats.paid)}</dd></div>
        </dl>
      )}

      {!loaded && (
        <div className="empty">
          <h2>Reading the sky.</h2>
          <p>Asking the contract for its lanterns.</p>
        </div>
      )}
      {stats && stats.total === 0 && (
        <div className="empty">
          <h2>The sky is dark.</h2>
          <p>Write a promise, back it with GEN, and point to the page that will prove it.</p>
        </div>
      )}

      {view === "ledger" && <Ledger vows={shown} now={now} filter={filter} selected={sel} onPick={pick} />}

      <nav className="dock" aria-label="View and filter">
        <div className="seg" role="group" aria-label="View">
          <button className={view === "sky" ? "on" : ""} aria-pressed={view === "sky"} onClick={() => setView("sky")}>Sky</button>
          <button className={view === "ledger" ? "on" : ""} aria-pressed={view === "ledger"} onClick={() => setView("ledger")}>Ledger</button>
        </div>
        <div className="seg" role="group" aria-label="Filter">
          {FILTERS.map((f) => (
            <button key={f} className={filter === f ? "on" : ""} aria-pressed={filter === f} onClick={() => setFilter(f)}>
              {f === "all" ? "All" : PHASE_LABEL[f]}
            </button>
          ))}
        </div>
        {me && (
          <div className="seg" role="group" aria-label="Owner">
            <button className={mineOnly ? "on" : ""} aria-pressed={mineOnly} onClick={() => setMineOnly(!mineOnly)}>My vows</button>
          </div>
        )}
        {stats && vows.length < stats.total && <button className="ghost more" onClick={() => sync.loadMore()}>Show older vows</button>}
      </nav>

      <button className="light" onClick={onLight}>Light a lantern</button>

      {tipVow && tip && !v && (
        <div className="tip" style={{ left: Math.min(tip.x + 16, innerWidth - 260), top: tip.y + 16 }}>
          <strong>{tipVow.text.length > 90 ? `${tipVow.text.slice(0, 90)}…` : tipVow.text}</strong>
          <span>{alias(tipVow.keeper)}</span>
        </div>
      )}

      {v && <VowView vow={v} variant="drawer" onClose={() => pick(null)} />}
    </>
  );
}
