import { useEffect, useState } from "react";
import { parseWei } from "./format";
import { EDITABLE_HINT, URL_HINT, cleanText, evidenceKind, isEvidenceUrl, isVowText, normalizeUrl } from "./evidence";

const WINDOWS: [string, number][] = [
  ["In 5 minutes", 300],
  ["In 1 hour", 3600],
  ["In 1 day", 86400],
  ["In 1 week", 604800],
  ["In 30 days", 2592000],
];

function useEscape(fn: () => void) {
  useEffect(() => {
    const on = (e: KeyboardEvent) => e.key === "Escape" && fn();
    addEventListener("keydown", on);
    return () => removeEventListener("keydown", on);
  }, [fn]);
}

export function LightDialog(p: { onClose: () => void; onSubmit: (text: string, url: string, secs: number, stake: bigint) => void }) {
  const [text, setText] = useState("");
  const [url, setUrl] = useState("");
  const [secs, setSecs] = useState(300);
  const [stake, setStake] = useState("0.5");
  useEscape(p.onClose);
  const wei = parseWei(stake);
  const okUrl = isEvidenceUrl(url);
  const ready = isVowText(text) && okUrl && wei !== null && wei >= 10n ** 17n;
  return (
    <div className="scrim" onClick={p.onClose}>
      <form
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-label="Make a vow"
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault();
          if (ready && wei) p.onSubmit(cleanText(text), normalizeUrl(url) ?? url.trim(), secs, wei);
        }}
      >
        <h2>Make a vow</h2>
        <label>What will you do?
          <textarea value={text} maxLength={280} rows={3} onChange={(e) => setText(e.target.value)} placeholder="Publish the first chapter of my essay series." autoFocus />
        </label>
        <label>Where will the proof appear?
          <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://example.com/my-essays" />
        </label>
        {okUrl && evidenceKind(url) === "editable" && <p className="meta hint">{EDITABLE_HINT}</p>}
        {url.trim() !== "" && !okUrl && <p className="meta hint">{URL_HINT}</p>}
        <div className="two">
          <label>Deadline
            <select value={secs} onChange={(e) => setSecs(Number(e.target.value))}>
              {WINDOWS.map(([n, s]) => <option key={s} value={s}>{n}</option>)}
            </select>
          </label>
          <label>Your stake in GEN
            <input value={stake} onChange={(e) => setStake(e.target.value)} inputMode="decimal" />
          </label>
        </div>
        {stake.trim() !== "" && (wei === null || wei < 10n ** 17n) && (
          <p className="meta hint">{wei === null ? "Enter the stake as a number, for example 0.5." : "The minimum stake is 0.1 GEN."}</p>
        )}
        <p className="meta">If the page shows no proof after the deadline, half of your stake is burned and the other half goes to those who doubted you, together with the faith pool. If nobody doubted you, the whole stake and all faith behind it are burned. The minimum stake is 0.1 GEN.</p>
        <div className="two">
          <button type="submit" disabled={!ready}>Light the lantern</button>
          <button type="button" className="ghost" onClick={p.onClose}>Cancel</button>
        </div>
      </form>
    </div>
  );
}

export function AboutDialog(p: { onClose: () => void }) {
  useEscape(p.onClose);
  return (
    <div className="scrim" onClick={p.onClose}>
      <div className="dialog about" role="dialog" aria-modal="true" aria-label="How Lumen works" onClick={(e) => e.stopPropagation()}>
        <h2>How Lumen works</h2>
        <ol>
          <li><strong>Make a vow.</strong> Write what you will do, stake GEN, and name the web page that will prove it.</li>
          <li><strong>Others take sides.</strong> Friends back you with faith. Skeptics put GEN on doubt and can add pages that argue the vow failed. Both stay open until the deadline.</li>
          <li><strong>Validators read the page.</strong> After the deadline, each validator reads the evidence and votes. They must agree on the verdict, not on the wording. A vow nobody doubts can be confirmed early, once half of the time has passed.</li>
          <li><strong>Claim.</strong> Kept vows return the stake and pay the faith side. Broken vows burn half the stake and pay the doubters. If nobody doubted a broken vow, the whole stake and the faith behind it are burned. Burned GEN is shown as embers drifting down the sky.</li>
        </ol>
        <p className="meta">Lantern brightness shows the size of the pool. Gold lanterns are kept, dim red ones are broken, and a gold line joins kept lanterns lit by the same keeper.</p>
        <button onClick={p.onClose}>Got it</button>
      </div>
    </div>
  );
}
