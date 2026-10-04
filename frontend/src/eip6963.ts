// EIP-6963 wallet discovery and the registry of the wallet in use.
//
// Every installed wallet extension announces itself, so the app can offer a real picker instead of
// whichever extension grabbed `window.ethereum`. The wallet in use lives at module level so the
// wallet hook (which picks it) and the signing client (which sends with it) always agree. With
// nothing picked yet it falls back to `window.ethereum`.

export type Eip1193 = {
  request: (args: { method: string; params?: unknown }) => Promise<any>;
  on?: (event: string, handler: (...args: any[]) => void) => void;
  removeListener?: (event: string, handler: (...args: any[]) => void) => void;
};

export type WalletDetail = {
  info: { uuid: string; name: string; icon: string; rdns: string };
  provider: Eip1193;
};

let activeProvider: Eip1193 | null = null;

export function setActiveProvider(provider: Eip1193 | null) {
  activeProvider = provider ?? null;
}

export function getActiveProvider(): Eip1193 | null {
  if (activeProvider) return activeProvider;
  if (typeof window === "undefined") return null;
  return ((window as any).ethereum as Eip1193 | undefined) ?? null;
}

// Asks every wallet to announce itself and collects the answers for a short window.
export function discoverWallets(timeoutMs = 250): Promise<WalletDetail[]> {
  return new Promise((resolve) => {
    if (typeof window === "undefined") {
      resolve([]);
      return;
    }
    const found = new Map<string, WalletDetail>();
    const onAnnounce = (event: Event) => {
      const detail = (event as CustomEvent<WalletDetail>).detail;
      if (detail?.info?.uuid) found.set(detail.info.uuid, detail);
    };
    window.addEventListener("eip6963:announceProvider", onAnnounce);
    window.dispatchEvent(new Event("eip6963:requestProvider"));
    setTimeout(() => {
      window.removeEventListener("eip6963:announceProvider", onAnnounce);
      resolve(Array.from(found.values()));
    }, timeoutMs);
  });
}

// Live version: also picks up extensions that announce themselves late. Returns an unsubscribe.
export function subscribeToWallets(onUpdate: (wallets: WalletDetail[]) => void): () => void {
  if (typeof window === "undefined") return () => {};
  const found = new Map<string, WalletDetail>();
  const onAnnounce = (event: Event) => {
    const detail = (event as CustomEvent<WalletDetail>).detail;
    if (detail?.info?.uuid) {
      found.set(detail.info.uuid, detail);
      onUpdate(Array.from(found.values()));
    }
  };
  window.addEventListener("eip6963:announceProvider", onAnnounce);
  window.dispatchEvent(new Event("eip6963:requestProvider"));
  return () => window.removeEventListener("eip6963:announceProvider", onAnnounce);
}
