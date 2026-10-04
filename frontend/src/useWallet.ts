import { useCallback, useEffect, useState } from "react";
import { CHAIN, NETWORK_NAME } from "./chain";
import {
  discoverWallets,
  getActiveProvider,
  setActiveProvider,
  subscribeToWallets,
  type Eip1193,
  type WalletDetail,
} from "./eip6963";

// Which wallet (by EIP-6963 rdns) to reconnect to on the next visit.
const SELECTED_WALLET_KEY = "lumen_wallet_rdns";
// Set when the person disconnects on purpose, so the app does not silently reconnect on the next
// load even though the wallet still has permission.
const DISCONNECT_FLAG = "lumen_wallet_disconnected";

export const NETWORK_LABEL = NETWORK_NAME.charAt(0).toUpperCase() + NETWORK_NAME.slice(1);

// Storage can throw (private mode, blocked storage); the wallet flow must never depend on it.
function store(action: "get" | "set" | "remove", key: string, value?: string): string | null {
  try {
    if (typeof window === "undefined") return null;
    if (action === "get") return window.localStorage.getItem(key);
    if (action === "set") window.localStorage.setItem(key, value ?? "");
    if (action === "remove") window.localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
  return null;
}

const chainIdHex = () => "0x" + Number(CHAIN.id).toString(16);
const isTargetChain = (idHex: string | null) => Boolean(idHex) && parseInt(String(idHex), 16) === Number(CHAIN.id);

function describeError(err: any, fallback: string): string {
  if (err?.code === 4001) return "Request cancelled in your wallet.";
  if (err?.code === -32002) return "A request is already pending in your wallet. Open the extension to continue.";
  return err?.message || fallback;
}

async function readChainId(provider: Eip1193): Promise<string | null> {
  try {
    return String(await provider.request({ method: "eth_chainId" }));
  } catch {
    return null;
  }
}

// Switches to the network, adding it first when the wallet does not know it. Returns false when the
// person refuses or the wallet cannot do it; a failed switch never drops an otherwise good connection.
async function switchToTargetChain(provider: Eip1193): Promise<boolean> {
  if (isTargetChain(await readChainId(provider))) return true;
  try {
    await provider.request({ method: "wallet_switchEthereumChain", params: [{ chainId: chainIdHex() }] });
    return true;
  } catch (switchError: any) {
    if (switchError?.code === 4902) {
      try {
        const chain: any = CHAIN;
        await provider.request({
          method: "wallet_addEthereumChain",
          params: [
            {
              chainId: chainIdHex(),
              chainName: chain.name,
              nativeCurrency: chain.nativeCurrency,
              rpcUrls: chain.rpcUrls?.default?.http ?? [],
              blockExplorerUrls: chain.blockExplorers?.default?.url ? [chain.blockExplorers.default.url] : [],
            },
          ],
        });
        return true;
      } catch {
        return false;
      }
    }
    return false;
  }
}

// Wallet state for the whole app: discovery and picking, reconnect on load, account and network
// changes, switch account, switch network and a disconnect that revokes the site's permission so the
// next connect shows a real consent prompt. The connect modal's open state lives here too, so any
// button in the app can open it.
export function useWallet() {
  const [address, setAddress] = useState<string | null>(null);
  const [chainId, setChainId] = useState<string | null>(null);
  const [provider, setProvider] = useState<Eip1193 | null>(null);
  const [selectedWalletRdns, setSelectedWalletRdns] = useState<string | null>(null);
  const [availableWallets, setAvailableWallets] = useState<WalletDetail[]>([]);
  const [initializing, setInitializing] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [switching, setSwitching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  const chainOk = isTargetChain(chainId);

  useEffect(() => subscribeToWallets(setAvailableWallets), []);

  // Restore the previous session on load.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (store("get", DISCONNECT_FLAG) === "true") {
        setInitializing(false);
        return;
      }
      let rdns = store("get", SELECTED_WALLET_KEY);
      if (rdns) {
        const wallets = await discoverWallets();
        const match = wallets.find((w) => w.info.rdns === rdns);
        if (match) {
          setActiveProvider(match.provider);
        } else {
          rdns = null;
          store("remove", SELECTED_WALLET_KEY);
        }
      }
      if (cancelled) return;
      const active = getActiveProvider();
      if (!active) {
        setInitializing(false);
        return;
      }
      try {
        // eth_accounts, not eth_requestAccounts: no popup, only an account the wallet already granted.
        const accounts: string[] = await active.request({ method: "eth_accounts" });
        const id = await readChainId(active);
        if (cancelled) return;
        setProvider(active);
        setSelectedWalletRdns(rdns);
        setChainId(id);
        setAddress(accounts?.[0] ?? null);
      } catch {
        /* wallet locked or not ready: stay disconnected */
      } finally {
        if (!cancelled) setInitializing(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Follow account and network changes made inside the wallet.
  useEffect(() => {
    if (!provider?.on) return undefined;
    const onAccountsChanged = async (accounts: string[]) => {
      const next = accounts?.[0] ?? null;
      if (next) store("remove", DISCONNECT_FLAG);
      const id = await readChainId(provider);
      setAddress(next);
      if (id) setChainId(id);
    };
    const onChainChanged = (id: string) => setChainId(String(id));
    const onDisconnect = () => setAddress(null);
    provider.on("accountsChanged", onAccountsChanged);
    provider.on("chainChanged", onChainChanged);
    provider.on("disconnect", onDisconnect);
    return () => {
      provider.removeListener?.("accountsChanged", onAccountsChanged);
      provider.removeListener?.("chainChanged", onChainChanged);
      provider.removeListener?.("disconnect", onDisconnect);
    };
  }, [provider]);

  const openModal = useCallback(() => {
    setError(null);
    setModalOpen(true);
  }, []);
  const closeModal = useCallback(() => setModalOpen(false), []);
  const clearError = useCallback(() => setError(null), []);

  // Pass an entry from `availableWallets` to connect to that wallet. With no argument the wallet
  // already in use (or window.ethereum) is used.
  const connect = useCallback(async (detail?: WalletDetail) => {
    const target = detail ? detail.provider : getActiveProvider();
    if (!target) {
      setError("No EVM wallet found. Install MetaMask, Rabby or another wallet extension.");
      return null;
    }
    setConnecting(true);
    setError(null);
    try {
      const accounts: string[] = await target.request({ method: "eth_requestAccounts" });
      if (!accounts?.[0]) throw new Error("No account returned by the wallet.");

      // Commit the choice only now, so cancelling the popup leaves nothing half-selected. The active
      // provider must be set before `address` changes: the signing client is built from that change.
      if (detail) {
        setActiveProvider(detail.provider);
        store("set", SELECTED_WALLET_KEY, detail.info.rdns);
      }
      store("remove", DISCONNECT_FLAG);

      const switched = await switchToTargetChain(target);
      const id = await readChainId(target);

      setProvider(target);
      if (detail) setSelectedWalletRdns(detail.info.rdns);
      setChainId(id);
      setAddress(accounts[0]);

      if (switched) setModalOpen(false);
      else setError(`Connected, but your wallet is not on ${NETWORK_LABEL}. Switch network to continue.`);
      return accounts[0];
    } catch (err: any) {
      setError(describeError(err, "Failed to connect the wallet."));
      return null;
    } finally {
      setConnecting(false);
    }
  }, []);

  const disconnect = useCallback(async () => {
    const active = getActiveProvider();
    if (active) {
      try {
        await active.request({ method: "wallet_revokePermissions", params: [{ eth_accounts: {} }] });
      } catch {
        /* not every wallet can revoke; the local disconnect below still works */
      }
    }
    setActiveProvider(null);
    store("remove", SELECTED_WALLET_KEY);
    store("set", DISCONNECT_FLAG, "true");
    setProvider(null);
    setSelectedWalletRdns(null);
    setAddress(null);
    setChainId(null);
    setError(null);
    setModalOpen(false);
  }, []);

  const switchAccount = useCallback(async () => {
    const active = getActiveProvider();
    if (!active) return null;
    setSwitching(true);
    setError(null);
    try {
      // Shows the wallet's own account picker even when already connected.
      await active.request({ method: "wallet_requestPermissions", params: [{ eth_accounts: {} }] });
      const accounts: string[] = await active.request({ method: "eth_accounts" });
      if (!accounts?.[0]) throw new Error("No account selected.");
      setAddress(accounts[0]);
      return accounts[0];
    } catch (err: any) {
      setError(describeError(err, "Failed to switch account."));
      return null;
    } finally {
      setSwitching(false);
    }
  }, []);

  const switchNetwork = useCallback(async () => {
    const active = getActiveProvider();
    if (!active) return;
    setSwitching(true);
    setError(null);
    try {
      const ok = await switchToTargetChain(active);
      const id = await readChainId(active);
      if (id) setChainId(id);
      if (!ok) setError(`Switch your wallet to ${NETWORK_LABEL} to continue.`);
    } finally {
      setSwitching(false);
    }
  }, []);

  return {
    address,
    chainId,
    chainOk,
    connected: Boolean(address && chainOk),
    wrongNetwork: Boolean(address && !chainOk),
    initializing,
    connecting,
    switching,
    error,
    clearError,
    availableWallets,
    selectedWalletRdns,
    hasWallet: availableWallets.length > 0 || Boolean(getActiveProvider()),
    modalOpen,
    openModal,
    closeModal,
    connect,
    disconnect,
    switchAccount,
    switchNetwork,
  };
}

export type WalletApi = ReturnType<typeof useWallet>;
