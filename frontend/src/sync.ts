// Keeps a local copy of the contract's vows up to date at the lowest cost.
//
// A full read of the newest pages is only done at the start, or when the contract says the copy is too far behind
// (`reset`). After that each poll is one tiny `pulse` call; only when its revision moved does the app ask
// `changes_since(revision)` for the vows that changed, and merge them in. Polling stops while the tab is hidden.
import type { Stats, Vow } from "./chain";
import { PAGE_MAX } from "./limits";
import type { Source } from "./source";

export type SyncState = {
  vows: Vow[]; // newest first
  stats: Stats | null;
  rev: number;
  loaded: boolean;
  error: string;
  hasMore: boolean;
  updatedAt: number; // ms since epoch of the last successful sync
  fullReads: number; // how many times the newest pages were read from scratch
  incrementals: number; // how many times only changed vows were read
};

const EMPTY: SyncState = { vows: [], stats: null, rev: 0, loaded: false, error: "", hasMore: false, updatedAt: 0, fullReads: 0, incrementals: 0 };

export function createSync(source: Source, pollMs = 8000) {
  let state: SyncState = EMPTY;
  const byId = new Map<number, Vow>();
  const listeners = new Set<() => void>();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let running = false;
  let busy: Promise<void> | null = null;
  let pages = 1;

  const emit = (patch: Partial<SyncState>) => {
    state = { ...state, ...patch };
    listeners.forEach((l) => l());
  };
  const sorted = () => [...byId.values()].sort((a, b) => b.id - a.id);
  const oldest = () => (byId.size ? Math.min(...byId.keys()) : 0);

  async function full() {
    const stats = await source.stats(); // read first: a vow that arrives meanwhile is simply merged again next time
    if (typeof stats.rev !== "number") throw new Error("The contract at this address is an older version of Lumen. Deploy contracts/lumen.py (version 2) and set VITE_LUMEN_ADDRESS to the new address.");
    const chunks = await Promise.all(Array.from({ length: pages }, (_, i) => source.list(i * PAGE_MAX, PAGE_MAX)));
    byId.clear();
    for (const row of chunks.flat()) byId.set(row.id, row);
    emit({ vows: sorted(), stats, rev: stats.rev, loaded: true, error: "", hasMore: oldest() > 0, updatedAt: Date.now(), fullReads: state.fullReads + 1 });
  }

  async function tick() {
    if (!state.loaded) return full();
    const p = await source.pulse();
    if (p.rev === state.rev && p.total === state.stats?.total) {
      emit({ error: "", updatedAt: Date.now() });
      return;
    }
    if (p.rev < state.rev) return full(); // a different contract, or the chain was reset
    const c = await source.changes(state.rev);
    if (c.reset) return full();
    for (const row of c.rows) byId.set(row.id, row);
    const stats = await source.stats();
    emit({ vows: sorted(), stats, rev: c.rev, error: "", hasMore: oldest() > 0, updatedAt: Date.now(), incrementals: state.incrementals + 1 });
  }

  function refresh(): Promise<void> {
    busy ??= tick()
      .catch((e: any) => emit({ error: String(e?.shortMessage ?? e?.message ?? e) }))
      .finally(() => {
        busy = null;
      });
    return busy;
  }

  const schedule = () => {
    clearTimeout(timer);
    if (running) timer = setTimeout(async () => (document.hidden ? undefined : await refresh(), schedule()), pollMs);
  };
  const onVisible = () => {
    if (!document.hidden && running) refresh();
  };

  return {
    subscribe(l: () => void) {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    get: () => state,
    refresh,
    start() {
      if (running) return;
      running = true;
      document.addEventListener("visibilitychange", onVisible);
      refresh();
      schedule();
    },
    stop() {
      running = false;
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
    },
    // Reads the next page of older vows.
    async loadMore() {
      if (!state.hasMore) return;
      const total = state.stats?.total ?? 0;
      const rows = await source.list(Math.max(0, total - oldest()), PAGE_MAX);
      for (const row of rows) byId.set(row.id, row);
      pages += 1;
      emit({ vows: sorted(), hasMore: oldest() > 0 });
    },
  };
}
export type Sync = ReturnType<typeof createSync>;
