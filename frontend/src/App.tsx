import { Suspense, lazy, useEffect, useMemo, useRef, useState } from "react";
import { CONTRACT, loadSdk, makeWallet, send, syncClock } from "./chain";
import { Footer, Nav, RepoLink, SyncNotice } from "./Chrome";
import { ActionsContext, SourceContext, SyncContext, type Actions } from "./context";
import { DEMO_ME, createDemo } from "./demo";
import { AboutDialog, LightDialog } from "./Dialogs";
import Home from "./Home";
import { href, useRoute } from "./router";
import { chainSource, type Source } from "./source";
import { createSync } from "./sync";
import { useWallet } from "./useWallet";
import WalletPanel from "./WalletPanel";

// Every page except the sky loads on demand; the 3D page also pulls in three.js only when it is opened.
const Keepers = lazy(() => import("./pages/Keepers"));
const KeeperPage = lazy(() => import("./pages/KeeperPage"));
const Activity = lazy(() => import("./pages/Activity"));
const Protocol = lazy(() => import("./pages/Protocol"));
const Pulse = lazy(() => import("./pages/Pulse"));
const Space = lazy(() => import("./pages/Space"));
const VowPage = lazy(() => import("./pages/VowPage"));

type Toast = { kind: "ok" | "err" | "busy"; msg: string };

// Without a contract address, or with ?demo in the address, the app runs on the in-page rehearsal.
const DEMO = !CONTRACT || /[?&]demo(?:=|&|$)/.test(location.search);

export default function App() {
  const demo = useMemo(() => (DEMO ? createDemo() : null), []);
  const source: Source = demo ?? chainSource;
  const sync = useMemo(() => createSync(source), [source]);
  const route = useRoute();
  const w = useWallet();
  const [toast, setToast] = useState<Toast | null>(null);
  const [dialog, setDialog] = useState<"light" | "about" | null>(null);

  useEffect(() => {
    sync.start();
    return () => sync.stop();
  }, [sync]);
  useEffect(() => {
    if (DEMO) return;
    loadSdk().catch(() => {}); // start fetching the SDK now; the first read waits for it
    syncClock();
  }, []);

  // The signing client is built once the wallet is on the right network, and rebuilt when the account changes.
  const [client, setClient] = useState<any>(null);
  useEffect(() => {
    let live = true;
    setClient(null);
    if (DEMO || !w.address || !w.chainOk) return undefined;
    makeWallet(w.address).then((x) => live && setClient(x.client)).catch(() => {});
    return () => { live = false; };
  }, [w.address, w.chainOk]);

  useEffect(() => {
    if (!toast || toast.kind === "busy") return undefined;
    const t = setTimeout(() => setToast(null), toast.kind === "ok" ? 6000 : 12000);
    return () => clearTimeout(t);
  }, [toast]);

  const actions: Actions = useMemo(() => {
    const me = DEMO ? DEMO_ME : w.address;
    return {
      me,
      demo: DEMO,
      connect: w.openModal,
      notice: (msg) => setToast({ kind: "ok", msg }),
      invalid: (msg) => setToast({ kind: "err", msg }),
      act: async (busy, done, fn, args, value) => {
        if (demo) {
          try {
            await demo.send(fn, args, value);
            setToast({ kind: "ok", msg: `${done} (rehearsal)` });
            await sync.refresh();
          } catch (e: any) {
            setToast({ kind: "err", msg: e?.message ?? String(e) });
          }
          return;
        }
        if (!w.address) {
          w.openModal();
          return setToast({ kind: "err", msg: "Connect a wallet first." });
        }
        if (!w.chainOk) {
          w.openModal();
          return setToast({ kind: "err", msg: "Switch your wallet to the GenLayer network first." });
        }
        if (!client) return setToast({ kind: "err", msg: "Your wallet is still getting ready. Try again in a moment." });
        setToast({ kind: "busy", msg: busy });
        try {
          await send(client, fn, args, value);
          setToast({ kind: "ok", msg: done });
          await sync.refresh();
        } catch (e: any) {
          setToast({ kind: "err", msg: e?.shortMessage ?? e?.message ?? String(e) });
        }
      },
    };
  }, [demo, sync, client, w.address, w.chainOk, w.openModal]);

  const home = route.name === "home";
  const scroller = useRef<HTMLElement>(null);
  useEffect(() => { scroller.current?.scrollTo({ top: 0 }); }, [route]);

  return (
    <SourceContext.Provider value={source}>
      <SyncContext.Provider value={sync}>
        <ActionsContext.Provider value={actions}>
          <div className={`stage${home ? "" : " plain"}`}>
            <header className="bar">
              <a className="brand" href={href.home} aria-label="Lumen, home">
                <img className="logo" src="/lumen-logo.svg" alt="" width={56} height={56} />
                <div>
                  <h1>Lumen</h1>
                  <p>Vows the validators remember.</p>
                </div>
              </a>
              {!home && <Nav route={route} variant="row" />}
              <div className="head-actions">
                {home && <Nav route={route} variant="menu" />}
                <button className="ghost" onClick={() => setDialog("about")}>How it works</button>
                {home && <a className="ghost-link" href="/docs.html">Docs</a>}
                <RepoLink />
                {DEMO ? <span className="chip demo" title="No contract is configured, so the app runs on in-page rehearsal data.">Rehearsal · {DEMO_ME.slice(0, 6)}…</span> : <WalletPanel wallet={w} />}
              </div>
            </header>

            {DEMO && home && (
              <div className="note">
                Rehearsal mode: the vows below are sample data and nothing is sent to a chain.
                <span className="more-note"> Deploy the contract and set <code>VITE_LUMEN_ADDRESS</code> in <code>frontend/.env</code> to go live.</span>
              </div>
            )}

            <SyncNotice />
            {home ? (
              <Home routeVow={route.name === "home" ? route.vow : null} onLight={() => setDialog("light")} />
            ) : (
              <main className="page" ref={scroller} id="main">
                <Suspense fallback={<p className="meta pad" role="status">Loading…</p>}>
                  {route.name === "keepers" && <Keepers />}
                  {route.name === "keeper" && <KeeperPage address={route.address} />}
                  {route.name === "activity" && <Activity />}
                  {route.name === "protocol" && <Protocol />}
                  {route.name === "pulse" && <Pulse />}
                  {route.name === "space" && <Space />}
                  {route.name === "vow" && <VowPage id={route.id} />}
                </Suspense>
                <Footer sync={sync} demo={DEMO} />
              </main>
            )}
            {home && <Footer sync={sync} demo={DEMO} compact />}

            {dialog === "light" && (
              <LightDialog
                onClose={() => setDialog(null)}
                onSubmit={(text, url, secs, stake) => {
                  setDialog(null);
                  actions.act("Lighting your lantern", "Your lantern is lit.", "make_vow", [text, url, source.now() + secs], stake);
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
        </ActionsContext.Provider>
      </SyncContext.Provider>
    </SourceContext.Provider>
  );
}
