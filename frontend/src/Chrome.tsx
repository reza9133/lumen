import { useSyncExternalStore } from "react";
import { metrics } from "./chain";
import { useVows } from "./context";
import { href, type Route } from "./router";
import { GitHubIcon } from "./icons";
import type { Sync } from "./sync";

export const REPO_URL = "https://github.com/reza9133/lumen";

const PAGES: { key: Route["name"]; label: string; to: string }[] = [
  { key: "home", label: "Sky", to: href.home },
  { key: "keepers", label: "Keepers", to: href.keepers },
  { key: "activity", label: "Activity", to: href.activity },
  { key: "protocol", label: "Protocol", to: href.protocol },
  { key: "pulse", label: "Pulse", to: href.pulse },
  { key: "space", label: "3D", to: href.space },
];

// The same pages as a menu on the home page (where the header is crowded) and as a row on every other page.
export function Nav({ route, variant }: { route: Route; variant: "row" | "menu" }) {
  const current = route.name === "vow" ? "home" : route.name === "keeper" ? "keepers" : route.name;
  if (variant === "menu") {
    return (
      <details className="menu">
        <summary className="ghost-link">Explore</summary>
        <div className="menu-list" role="menu" onClick={(e) => { (e.currentTarget.closest("details") as HTMLDetailsElement).open = false; }}>
          {PAGES.filter((p) => p.key !== "home").map((p) => (
            <a key={p.key} href={p.to} role="menuitem">{p.label}</a>
          ))}
          <a href="/docs.html" role="menuitem">Docs</a>
        </div>
      </details>
    );
  }
  return (
    <nav className="topnav" aria-label="Pages">
      {PAGES.map((p) => (
        <a key={p.key} href={p.to} aria-current={current === p.key ? "page" : undefined}>{p.label}</a>
      ))}
      <a href="/docs.html">Docs</a>
    </nav>
  );
}

export function RepoLink() {
  return (
    <a className="ghost-link icon" href={REPO_URL} target="_blank" rel="noreferrer noopener" aria-label="Lumen on GitHub" title="Lumen on GitHub"><GitHubIcon /></a>
  );
}

const kb = (n: number) => (n < 1024 ? `${n} B` : `${(n / 1024).toFixed(1)} KB`);

// Who built on what, and how much the page has read from the network so far.
export function Footer({ sync, demo, compact }: { sync: Sync; demo: boolean; compact?: boolean }) {
  const s = useVows();
  const m = useSyncExternalStore(sync.subscribe, () => `${metrics.reads}/${metrics.bytes}`);
  const [reads, bytes] = m.split("/").map(Number);
  const when = s.updatedAt ? new Date(s.updatedAt).toLocaleTimeString() : "waiting";
  return (
    <footer className={`foot${compact ? " compact" : ""}`}>
      <a className="onchain" href="https://www.genlayer.com" target="_blank" rel="noreferrer noopener" aria-label="Built on GenLayer">
        <span className="gl-mark" aria-hidden="true" />
        <span>Built on GenLayer</span>
      </a>
      {!compact && (
        <span className="sync" title="Each refresh reads one tiny revision number. Only when it moved does the page read the vows that changed.">
          {demo ? "Rehearsal data, nothing is on a chain" : `Synced ${when}`} · {s.incrementals} incremental, {s.fullReads} full · {reads} reads, {kb(bytes)}
          {s.stats ? ` · contract ${s.stats.version}` : ""}
        </span>
      )}
    </footer>
  );
}

// Shown while the last read failed, so a wrong address or an older contract is explained instead of looking empty.
export function SyncNotice() {
  const { error, loaded } = useVows();
  if (!error) return null;
  return (
    <div className="note error-note" role="alert">
      {loaded ? "Could not refresh from the network, showing the last data. " : ""}
      {error}
    </div>
  );
}
