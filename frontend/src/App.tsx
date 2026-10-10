import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CONTRACT, makeWallet, nowSec, readAll, readPosition, readRecord, send, syncClock,
  type KeeperRecord, type Position, type Stats, type Vow,
} from "./chain";
import { createSky } from "./sky";
import { PHASE_LABEL, alias, gen, short, type Phase } from "./format";
import Drawer from "./Drawer";
import Ledger from "./Ledger";
import { AboutDialog, LightDialog } from "./Dialogs";
import WalletPanel from "./WalletPanel";
import { GitHubIcon } from "./icons";
import { useWallet } from "./useWallet";

const REPO_URL = "https://github.com/reza9133/lumen";

type Toast = { kind: "ok" | "err" | "busy"; msg: string };
type Tip = { id: number; x: number; y: number } | null;

const FILTERS: (Phase | "all")[] = ["all", "burning", "due", "review", "kept", "broken"];

export default function App() {
  const canvas = useRef<HTMLCanvasElement>(null);
  const sky = useRef<ReturnType<typeof createSky> | null>(null);
  const [vows, setVows] = useState<Vow[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [sel, setSel] = useState<number | null>(null);
  const w = useWallet();
  // The signing client is built once the wallet is on the right network, and rebuilt when the account changes.
  const [client, setClient] = useState<any>(null);
  useEffect(() => {
    let live = true;
    setClient(null);
    if (!w.address || !w.chainOk) return undefined;
    makeWallet(w.address).then((x) => { if (live) setClient(x.client); }).catch(() => {});
    return () => { live = false; };
  }, [w.address, w.chainOk]);
  const wallet = useMemo(() => (w.address && client ? { client, addr: w.address } : null), [w.address, client]);
  useEffect(() => { if (!w.address) setMineOnly(false); }, [w.address]);
  const [pos, setPos] = useState<Position | null>(null);
  const [record, setRecord] = useState<KeeperRecord | null>(null);
  const [now, setNow] = useState(nowSec());
  const [toast, setToast] = useState<Toast | null>(null);
  const [dialog, setDialog] = useState<"light" | "about" | null>(null);
  const [view, setView] = useState<"sky" | "ledger">("sky");
  const [filter, setFilter] = useState<Phase | "all">("all");
  const [tip, setTip] = useState<Tip>(null);
  const [loaded, setLoaded] = useState(false);
  const [mineOnly, setMineOnly] = useState(false);
  const pages = useRef(1);

  // Selecting a vow also writes it to the address bar, so every vow has a link that can be shared.
  const pick = useCallback((id: number | null) => {
    setSel(id);
    try {
      history.replaceState(null, "", id === null ? `${location.pathname}${location.search}` : `#vow=${id}`);
    } catch {
      /* the address bar is optional */
    }
  }, []);

  const refresh = useCallback(async () => {
    if (!CONTRACT) return;
    try {
      const d = await readAll(pages.current);
      setVows(d.vows);
      setStats(d.stats);
      setLoaded(true);
    } catch (e: any) {
      setToast({ kind: "err", msg: `Could not read the contract. ${e?.shortMessage ?? e?.message ?? ""}` });
    }
  }, []);

  useEffect(() => {
    sky.current = createSky(canvas.current!, {
      onPick: pick,
      onHover: (id, x, y) => setTip(id === null ? null : { id, x, y }),
    });
    sky.current.setClock(nowSec);
    return () => sky.current?.destroy();
  }, []);
  useEffect(() => sky.current?.setVows(vows), [vows]);
  useEffect(() => { if (stats) sky.current?.setAsh(stats.embers); }, [stats]);
  useEffect(() => sky.current?.setSelected(sel), [sel]);
  useEffect(() => sky.current?.setFilter(filter), [filter]);
  useEffect(() => sky.current?.setOwner(mineOnly && w.address ? w.address : null), [mineOnly, w.address]);
  useEffect(() => {
    const read = () => {
      const m = /^#vow=(\d+)$/.exec(location.hash);
      setSel(m ? Number(m[1]) : null);
    };
    read();
    addEventListener("hashchange", read);
    return () => removeEventListener("hashchange", read);
  }, []);
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if (e.key === "Escape" && dialog === null && sel !== null) pick(null);
    };
    addEventListener("keydown", on);
    return () => removeEventListener("keydown", on);
  }, [dialog, sel, pick]);
  useEffect(() => {
    if (!toast || toast.kind === "busy") return;
    const t = setTimeout(() => setToast(null), toast.kind === "ok" ? 6000 : 12000);
    return () => clearTimeout(t);
  }, [toast]);
  useEffect(() => {
    syncClock().then(() => setNow(nowSec()));
  }, []);
  useEffect(() => {
    refresh();
    const a = setInterval(refresh, 12000);
    const b = setInterval(() => setNow(nowSec()), 1000);
    return () => { clearInterval(a); clearInterval(b); };
  }, [refresh]);

  const v = vows.find((x) => x.id === sel) ?? null;
  const keeper = v?.keeper ?? null;
  // Clear on a change of vow or account only. A periodic refresh must not blank the panel, and an
  // answer that arrives after the selection moved on is dropped.
  useEffect(() => { setPos(null); }, [sel, w.address]);
  useEffect(() => {
    if (sel === null || !w.address) return;
    let live = true;
    readPosition(sel, w.address).then((p) => { if (live) setPos(p); }).catch(() => {});
    return () => { live = false; };
  }, [sel, w.address, vows]);
  useEffect(() => { setRecord(null); }, [keeper]);
  useEffect(() => {
    if (!keeper) return;
    let live = true;
    readRecord(keeper).then((r) => { if (live) setRecord(r); }).catch(() => {});
    return () => { live = false; };
  }, [keeper, vows]);

  const run = async (busy: string, done: string, fn: string, args: unknown[], value?: bigint) => {
    if (!w.address) {
      w.openModal();
      return setToast({ kind: "err", msg: "Connect a wallet first." });
    }
    if (!w.chainOk) {
      w.openModal();
      return setToast({ kind: "err", msg: "Switch your wallet to the GenLayer network first." });
    }
    if (!wallet) return setToast({ kind: "err", msg: "Your wallet is still getting ready. Try again in a moment." });
    setToast({ kind: "busy", msg: busy });
    try {
      await send(wallet.client, fn, args, value);
      setToast({ kind: "ok", msg: done });
      await refresh();
    } catch (e: any) {
      setToast({ kind: "err", msg: e?.shortMessage ?? e?.message ?? String(e) });
    }
  };

  const mine = w.address ? w.address.toLowerCase() : null;
  const shown = useMemo(
    () => (mineOnly && mine ? vows.filter((x) => x.keeper.toLowerCase() === mine) : vows),
    [vows, mineOnly, mine],
  );
  const total = stats ? stats.kept + stats.broken : 0;

  const tipVow = tip ? vows.find((x) => x.id === tip.id) : null;

  return (
    <div className="stage">
      <canvas ref={canvas} className={`sky${view === "ledger" ? " dim" : ""}`} aria-label="A night sky with one lantern for each vow" />

      <header className="bar">
        <div className="brand">
          <img className="logo" src="/lumen-logo.svg" alt="" width={56} height={56} />
          <div>
            <h1>Lumen</h1>
            <p>Vows the validators remember.</p>
          </div>
        </div>
        {stats && (
          <dl className="tally">
            <div><dt>Lit</dt><dd>{stats.total}</dd></div>
            <div><dt>Kept</dt><dd>{stats.kept}</dd></div>
            <div><dt>Broken</dt><dd>{stats.broken}</dd></div>
            {total > 0 && <div><dt>Kept rate</dt><dd>{Math.round((stats.kept * 100) / total)}%</dd></div>}
            <div><dt>Embers burned</dt><dd>{gen(stats.embers)}</dd></div>
            <div><dt>Paid out</dt><dd>{gen(stats.paid)}</dd></div>
          </dl>
        )}
        <div className="head-actions">
          <button className="ghost" onClick={() => setDialog("about")}>How it works</button>
          <a className="ghost-link" href="/docs.html">Docs</a>
          <a className="ghost-link icon" href={REPO_URL} target="_blank" rel="noreferrer noopener" aria-label="Lumen on GitHub" title="Lumen on GitHub"><GitHubIcon /></a>
          <WalletPanel wallet={w} />
        </div>
      </header>

      {!CONTRACT && (
        <div className="note">Deploy the contract, then set <code>VITE_LUMEN_ADDRESS</code> in <code>frontend/.env</code>.</div>
      )}
      {CONTRACT && !loaded && (
        <div className="empty">
          <h2>Reading the sky.</h2>
          <p>Asking the contract for its lanterns.</p>
        </div>
      )}
      {CONTRACT && stats && stats.total === 0 && (
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
        {w.address && (
          <div className="seg" role="group" aria-label="Owner">
            <button className={mineOnly ? "on" : ""} aria-pressed={mineOnly} onClick={() => setMineOnly(!mineOnly)}>My vows</button>
          </div>
        )}
        {stats && vows.length < stats.total && (
          <button
            className="ghost more"
            onClick={() => {
              pages.current += 1;
              refresh();
            }}
          >
            Show older vows
          </button>
        )}
      </nav>

      <button className="light" onClick={() => setDialog("light")} disabled={!CONTRACT}>Light a lantern</button>

      {tipVow && tip && !v && (
        <div className="tip" style={{ left: Math.min(tip.x + 16, innerWidth - 260), top: tip.y + 16 }}>
          <strong>{tipVow.text.length > 90 ? `${tipVow.text.slice(0, 90)}…` : tipVow.text}</strong>
          <span>{alias(tipVow.keeper)}</span>
        </div>
      )}

      {v && (
        <Drawer
          vow={v}
          now={now}
          me={w.address}
          pos={pos}
          record={record}
          onConnect={w.openModal}
          onClose={() => pick(null)}
          onInvalid={(msg) => setToast({ kind: "err", msg })}
          onNotice={(msg) => setToast({ kind: "ok", msg })}
          onBack={(side, wei) =>
            run(side === "faith" ? "Adding your faith" : "Adding your doubt", side === "faith" ? "Faith added." : "Doubt added.", "back", [v.id, side], wei)
          }
          onJudge={() => run("Validators are reading the evidence. This can take a minute or two.", "A verdict is proposed. Check the lantern for the review window.", "judge", [v.id])}
          onChallenge={(url) => run("Adding your counter-evidence", "Counter-evidence added.", "challenge", [v.id, url])}
          onPin={(url) => run("Pinning your proof", "Proof pinned.", "pin_evidence", [v.id, url])}
          onDispute={(url) => run("Adding your dispute", "Dispute added.", "dispute", [v.id, url])}
          onFinalize={() => run("Finalizing. If pages were disputed the validators read them again, which can take a minute or two.", "Verdict final. Check the lantern.", "finalize", [v.id])}
          onRelease={() => run("Releasing the stakes", "Released. Everyone can now claim a refund.", "release", [v.id])}
          onClaim={() => run("Claiming", "Claim submitted. The payout arrives when the transaction finalizes.", "claim", [v.id])}
        />
      )}

      {dialog === "light" && (
        <LightDialog
          onClose={() => setDialog(null)}
          onSubmit={(text, url, secs, stake) => {
            setDialog(null);
            run("Lighting your lantern", "Your lantern is lit.", "make_vow", [text, url, nowSec() + secs], stake);
          }}
        />
      )}
      {dialog === "about" && <AboutDialog onClose={() => setDialog(null)} />}
      {toast && (
        <div className={`toast ${toast.kind}`} role="status" onClick={() => toast.kind !== "busy" && setToast(null)}>
          {toast.msg}
        </div>
      )}
    </div>
  );
}
