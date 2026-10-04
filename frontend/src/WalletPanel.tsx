import { useEffect, useRef, useState, type ReactNode } from "react";
import { readRecord, type KeeperRecord } from "./chain";
import { getActiveProvider } from "./eip6963";
import { alias, gen, short } from "./format";
import Modal from "./Modal";
import { NETWORK_LABEL, type WalletApi } from "./useWallet";
import {
  AlertIcon, CheckIcon, ChevronDownIcon, ChevronRightIcon, CopyIcon, ExternalIcon, LogOutIcon, UserIcon, WalletIcon,
} from "./icons";

const INSTALL_URL = "https://metamask.io/download/";

function Notice(p: { tone?: "info" | "warn" | "error"; title?: string; children: ReactNode }) {
  const tone = p.tone ?? "info";
  return (
    <div className={`notice ${tone}`} role={tone === "error" ? "alert" : undefined}>
      {tone !== "info" && <AlertIcon className="notice-icon" />}
      <div>
        {p.title && <strong>{p.title}</strong>}
        <div className="notice-text">{p.children}</div>
      </div>
    </div>
  );
}

function InfoCard(p: { label: string; children: ReactNode }) {
  return (
    <div className="info-card">
      <p className="label">{p.label}</p>
      <div>{p.children}</div>
    </div>
  );
}

function AddressRow({ address }: { address: string }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard blocked: the address is selectable */
    }
  };
  return (
    <span className="addr-row" title={address}>
      <code>{address}</code>
      <button type="button" className="icon-btn" onClick={copy} aria-label={copied ? "Address copied" : "Copy address"}>
        {copied ? <CheckIcon width={14} height={14} /> : <CopyIcon width={14} height={14} />}
      </button>
    </span>
  );
}

// The wallet control in the header and the modal behind it.
//  - not connected: a Connect button, and a modal with a picker of every installed wallet
//  - connected: an address chip, and a modal with the wallet's details, the network status, switch
//    account and disconnect
export default function WalletPanel({ wallet }: { wallet: WalletApi }) {
  const {
    address, chainOk, initializing, connecting, switching, error, hasWallet, availableWallets, selectedWalletRdns,
    modalOpen, openModal, closeModal, connect, disconnect, switchAccount, switchNetwork,
  } = wallet;

  const [record, setRecord] = useState<KeeperRecord | null>(null);
  const [balance, setBalance] = useState<bigint | null>(null);

  // The keeper record and balance are re-read whenever the modal opens, so they are fresh after a
  // vow resolves or a claim lands.
  useEffect(() => {
    setRecord(null);
    if (!address) return undefined;
    let live = true;
    readRecord(address).then((r) => { if (live) setRecord(r); }).catch(() => {});
    return () => { live = false; };
  }, [address, modalOpen]);

  useEffect(() => {
    setBalance(null);
    const provider = getActiveProvider();
    if (!address || !chainOk || !modalOpen || !provider) return undefined;
    let live = true;
    provider
      .request({ method: "eth_getBalance", params: [address, "latest"] })
      .then((hex: string) => { if (live) setBalance(BigInt(hex)); })
      .catch(() => {});
    return () => { live = false; };
  }, [address, chainOk, modalOpen]);

  const walletName = availableWallets.find((w) => w.info.rdns === selectedWalletRdns)?.info.name ?? "your wallet";

  if (!address) {
    return (
      <>
        <button className="ghost wallet-btn" onClick={openModal} disabled={initializing || connecting}>
          <WalletIcon />
          {connecting ? "Connecting…" : "Connect wallet"}
        </button>

        <Modal
          open={modalOpen}
          onClose={closeModal}
          title="Connect to GenLayer"
          description="Connect a wallet to light lanterns, back vows and claim payouts."
        >
          <div className="stack">
            {!hasWallet ? (
              <>
                <Notice tone="warn" title="No wallet detected">
                  Install a wallet extension to continue. MetaMask is a good default if you do not have one yet.
                </Notice>
                <a className="btn-link" href={INSTALL_URL} target="_blank" rel="noreferrer">
                  <ExternalIcon /> Install MetaMask
                </a>
                <Notice>After installing a wallet, refresh this page and press Connect wallet again.</Notice>
              </>
            ) : (
              <>
                {availableWallets.length === 0 ? (
                  <button onClick={() => connect()} disabled={connecting}>Connect wallet</button>
                ) : (
                  <div className="picker">
                    {availableWallets.map((w) => (
                      <button key={w.info.uuid} type="button" className="pick" onClick={() => connect(w)} disabled={connecting}>
                        {w.info.icon && <img src={w.info.icon} alt="" width={28} height={28} />}
                        <span>{w.info.name}</span>
                        <ChevronRightIcon />
                      </button>
                    ))}
                  </div>
                )}
                {connecting && <p className="meta center">Waiting for your wallet…</p>}
                {error && <Notice tone="error" title="Connection error">{error}</Notice>}
                <Notice>
                  <p>Choosing a wallet will ask it to:</p>
                  <ol>
                    <li>Connect your wallet to this app</li>
                    <li>Add the GenLayer {NETWORK_LABEL} network to your wallet</li>
                    <li>Switch to the {NETWORK_LABEL} network</li>
                  </ol>
                  <p>Disconnecting forgets this choice, so you can pick a different wallet next time.</p>
                </Notice>
              </>
            )}
          </div>
        </Modal>
      </>
    );
  }

  return (
    <>
      <button
        className={`ghost wallet-chip${chainOk ? "" : " warn"}`}
        onClick={openModal}
        title="Wallet details"
        aria-label={`Wallet details for ${alias(address)}`}
      >
        <span className={`dot${chainOk ? " ok" : " warn"}`} aria-label={chainOk ? "Connected" : "Wrong network"} />
        <span className="who">{alias(address)}</span>
        <span className="addr">{short(address)}</span>
        {record && record.streak > 0 && <span className="streak" title="Current streak of kept vows">{record.streak} kept in a row</span>}
        <ChevronDownIcon width={14} height={14} />
      </button>

      <Modal open={modalOpen} onClose={closeModal} title="Wallet details" description={`Connected with ${walletName}`}>
        <div className="stack">
          <InfoCard label="Your address">
            <AddressRow address={address} />
          </InfoCard>

          {chainOk && balance !== null && (
            <InfoCard label="Balance">
              <p className="big">{gen(balance)} <small>GEN</small></p>
            </InfoCard>
          )}

          <InfoCard label="Your record as a keeper">
            {record && (record.kept > 0 || record.broken > 0) ? (
              <>
                <p className="big">{record.kept} <small>kept</small> · {record.broken} <small>broken</small></p>
                <p className="meta">
                  Current streak {record.streak}, best {record.best}. {gen(record.kept_stake)} GEN staked on kept vows.
                </p>
              </>
            ) : (
              <p className="meta">No judged vows yet. Light a lantern to start a record.</p>
            )}
          </InfoCard>

          <InfoCard label="Network status">
            <p className="status-line">
              <span className={`dot${chainOk ? " ok" : " warn"}`} />
              {chainOk ? `Connected to GenLayer ${NETWORK_LABEL}` : "Wrong network"}
            </p>
          </InfoCard>

          {!chainOk && (
            <Notice tone="warn" title="Network warning">
              <p>
                You are not on GenLayer {NETWORK_LABEL}. A transaction from the wrong network would use that
                network's own currency instead of GEN.
              </p>
              <button onClick={switchNetwork} disabled={switching}>{switching ? "Switching…" : "Switch network"}</button>
            </Notice>
          )}

          {error && <Notice tone="error" title="Error">{error}</Notice>}

          <div className="actions">
            <button className="ghost" onClick={switchAccount} disabled={switching}>
              <UserIcon /> {switching ? "Switching…" : "Switch account"}
            </button>
            <button className="ghost danger" onClick={disconnect} disabled={switching}>
              <LogOutIcon /> Disconnect wallet
            </button>
          </div>

          <Notice>
            Use Switch account to pick another account in {walletName}. Use Disconnect to remove this site from your wallet.
          </Notice>
        </div>
      </Modal>
    </>
  );
}
