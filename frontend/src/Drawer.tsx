import { useMemo, useState } from "react";
import type { KeeperRecord, Position, Vow } from "./chain";
import { PHASE_LABEL, alias, gen, left, parseWei, phaseOf, short } from "./format";
import { preview } from "./payout";
import {
  MAX_PINS, PROVENANCE_LABEL, URL_HINT, canDispute, canFinalize, canJudgeEarly, canRelease, isEvidenceUrl, isPinnable, normalizeUrl,
  provenanceOf, reviewOpen,
} from "./evidence";

type Props = {
  vow: Vow;
  now: number;
  me: string | null;
  pos: Position | null;
  record: KeeperRecord | null;
  onClose: () => void;
  onBack: (side: "faith" | "doubt", wei: bigint) => void;
  onJudge: () => void;
  onChallenge: (url: string) => void;
  onPin: (url: string) => void;
  onDispute: (url: string) => void;
  onFinalize: () => void;
  onClaim: () => void;
  onRelease: () => void;
  onInvalid: (msg: string) => void;
  onNotice: (msg: string) => void;
  onConnect: () => void;
};

export default function Drawer({ vow: v, now, me, pos, record, onClose, onBack, onJudge, onChallenge, onPin, onDispute, onFinalize, onClaim, onRelease, onInvalid, onNotice, onConnect }: Props) {
  const [amount, setAmount] = useState("0.1");
  const [counter, setCounter] = useState("");
  const [pin, setPin] = useState("");
  const [dispute, setDispute] = useState("");
  const phase = phaseOf(v.state, v.deadline, now);
  const total = BigInt(v.faith) + BigInt(v.doubt);
  const faithPct = total > 0n ? Number((BigInt(v.faith) * 100n) / total) : 50;
  const mine = me !== null && me.toLowerCase() === v.keeper.toLowerCase();
  const faithRoom = (() => {
    const room = BigInt(v.faith_cap) - BigInt(v.faith);
    return room > 0n ? room : 0n;
  })();

  // What the typed amount would return in each outcome, given the pools as they are right now.
  const typed = parseWei(amount);
  const sheet = useMemo(() => {
    if (typed === null || typed < 10n ** 16n) return null;
    const mineNow = { faith: BigInt(pos?.faith ?? "0"), doubt: BigInt(pos?.doubt ?? "0") };
    return {
      faith: preview(v, mineNow, "faith", typed),
      doubt: preview(v, mineNow, "doubt", typed),
    };
  }, [typed, pos, v.stake, v.faith, v.doubt]);
  const span = v.deadline - v.created;
  const elapsed = span > 0 ? Math.min(100, Math.max(0, ((now - v.created) / span) * 100)) : 100;

  const copyLink = async () => {
    const link = `${location.origin}${location.pathname}#vow=${v.id}`;
    try {
      await navigator.clipboard.writeText(link);
      onNotice("Link copied.");
    } catch {
      onInvalid(`Copy this link: ${link}`);
    }
  };

  const back = (side: "faith" | "doubt") => {
    const wei = parseWei(amount);
    if (wei === null || wei < 10n ** 16n) return onInvalid("Enter an amount of at least 0.01 GEN.");
    if (side === "faith" && wei > faithRoom) {
      return onInvalid(
        faithRoom === 0n
          ? "Faith on this vow is full. It is capped at half of the stake."
          : `Faith is capped at half of the stake. Room left: ${gen(faithRoom.toString())} GEN.`,
      );
    }
    onBack(side, wei);
  };

  const kind = provenanceOf(v.url);
  const early = canJudgeEarly(v, now);
  const open = v.state === 0;
  const canChallenge = open && now < v.deadline && pos !== null && BigInt(pos.doubt) > 0n && !pos.challenged;
  const canPin = mine && v.state === 0 && now < v.deadline && v.pins.length < MAX_PINS;
  const doPin = () => {
    const url = normalizeUrl(pin) ?? pin.trim();
    if (!isEvidenceUrl(url) || !isPinnable(url, now, v.deadline)) {
      return onInvalid("A pin must be an exact archive.org capture (the link holds a 14-digit time) or a commit-pinned link on GitHub, GitLab or Codeberg.");
    }
    onPin(url);
    setPin("");
  };
  const inReview = v.state === 4;
  const disputing = canDispute(v, pos, mine, now);
  const doDispute = () => {
    if (!isEvidenceUrl(dispute)) return onInvalid(URL_HINT);
    onDispute(normalizeUrl(dispute) ?? dispute.trim());
    setDispute("");
  };
  const challenge = () => {
    if (!isEvidenceUrl(counter)) return onInvalid(URL_HINT);
    onChallenge(normalizeUrl(counter) ?? counter.trim());
    setCounter("");
  };

  return (
    <aside className="drawer" aria-live="polite">
      <div className="topbtns">
        <button className="close" onClick={copyLink} aria-label="Copy a link to this vow">Copy link</button>
        <button className="close" onClick={onClose} aria-label="Close details">Close</button>
      </div>
      <span className={`pill p-${phase}`}>{PHASE_LABEL[phase]}</span>
      <blockquote>{v.text}</blockquote>

      <p className="meta">
        Kept by <strong>{alias(v.keeper)}</strong> <span className="addr">{short(v.keeper)}</span>{mine ? " (you)" : ""}
      </p>
      {record && (record.kept > 0 || record.broken > 0) && (
        <p className="meta">Record: {record.kept} kept ({gen(record.kept_stake)} GEN staked), {record.broken} broken. Current streak {record.streak}, best {record.best}.</p>
      )}
      <p className="meta">{phase === "burning" ? left(v.deadline, now) : `Deadline ${new Date(v.deadline * 1000).toLocaleString()}`}</p>
      {phase === "burning" && (
        <div className="timebar" role="progressbar" aria-label="Time elapsed" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(elapsed)}>
          <i style={{ width: `${elapsed}%` }} />
        </div>
      )}
      <p className="meta"><a href={v.url} target="_blank" rel="noreferrer">Open the evidence page</a> ({PROVENANCE_LABEL[kind]})</p>
      {v.pins.length > 0 && (
        <p className="meta">
          Pinned proof:{" "}
          {v.pins.map((u, i) => (
            <span key={u}>{i > 0 ? ", " : ""}<a href={u} target="_blank" rel="noreferrer">{PROVENANCE_LABEL[provenanceOf(u)]}</a></span>
          ))}
        </p>
      )}
      {v.counters.length > 0 && (
        <p className="meta">
          Counter-evidence from doubters:{" "}
          {v.counters.map((u, i) => (
            <span key={u}>{i > 0 ? ", " : ""}<a href={u} target="_blank" rel="noreferrer">page {i + 1}</a></span>
          ))}
        </p>
      )}

      <div className="pools">
        <div className="split" role="img" aria-label={`Faith ${faithPct} percent, doubt ${100 - faithPct} percent`}>
          <i style={{ width: `${faithPct}%` }} />
        </div>
        <div className="row"><span>Faith {gen(v.faith)} GEN</span><span>Doubt {gen(v.doubt)} GEN</span></div>
        <p className="meta">Keeper stake {gen(v.stake)} GEN. Room for faith: {gen(faithRoom.toString())} GEN.</p>
      </div>

      {v.note && <p className="verdict">{v.note}</p>}
      {v.proof && (
        <div className="proof" aria-label="The proof the verdict rests on">
          <p className="meta">Proof relied on ({PROVENANCE_LABEL[v.proof.tier]}), dated {v.proof.date}:</p>
          <blockquote>{v.proof.quote}</blockquote>
          <p className="meta addr">page fingerprint {v.proof.hash.slice(0, 16)}…</p>
        </div>
      )}
      {v.disputes.length > 0 && (
        <p className="meta">
          {v.proposed === 1 || v.state !== 4 ? "Disputed with" : "Rebuttal pages"}:{" "}
          {v.disputes.map((u, i) => (
            <span key={u}>{i > 0 ? ", " : ""}<a href={u} target="_blank" rel="noreferrer">page {i + 1}</a></span>
          ))}
        </p>
      )}

      {phase === "burning" && (
        <div className="act">
          {mine ? (
            <p className="meta">Keepers cannot back their own vow. Share the link so others can.</p>
          ) : (
            <>
              <label>Amount in GEN
                <input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" />
              </label>
              <div className="two">
                <button onClick={() => back("faith")} disabled={!me}>Back this vow</button>
                <button className="ghost" onClick={() => back("doubt")} disabled={!me}>Doubt this vow</button>
              </div>
              {BigInt(v.doubt) === 0n && <p className="meta">Nobody doubts this vow yet. If it breaks while that stays true, faith backing is burned, not refunded.</p>}
              {sheet && (
                <div className="preview" aria-label="What this amount would return">
                  <div className="cols">
                    <span />
                    <b>Back</b>
                    <b>Doubt</b>
                  </div>
                  <div className="cols"><span>If kept</span><span>{gen(sheet.faith.kept)}</span><span>{gen(sheet.doubt.kept)}</span></div>
                  <div className="cols"><span>If broken</span><span>{gen(sheet.faith.broken)}</span><span>{gen(sheet.doubt.broken)}</span></div>
                  <div className="cols"><span>If unclear</span><span>{gen(sheet.faith.unclear)}</span><span>{gen(sheet.doubt.unclear)}</span></div>
                  <p className="meta">GEN you would receive, counting anything you already have on this vow. Later backing changes the split.</p>
                </div>
              )}
              {!me && <button className="ghost" onClick={onConnect}>Connect a wallet to take a side</button>}
            </>
          )}
          {early && (
            <>
              <button className="ghost" onClick={onJudge} disabled={!me}>Ask validators to confirm early</button>
              <p className="meta">Nobody doubts this vow, so it can be confirmed before the deadline. An early check can only confirm a vow, never break it.</p>
            </>
          )}
          {canPin && (
            <div className="challenge">
              <label>Pin proof that cannot be rewritten ({v.pins.length}/{MAX_PINS})
                <input value={pin} onChange={(e) => setPin(e.target.value)} placeholder="https://web.archive.org/web/20261001120000/https://…" />
              </label>
              <button className="ghost" onClick={doPin}>Pin this proof</button>
              <p className="meta">An exact archive.org capture or a commit-pinned link. It must exist before the deadline. Validators read it together with your page. If the archive confirms the capture, firm proof gets a shorter review window and cannot be outweighed by an editable page; a capture it cannot confirm is treated as an editable page.</p>
            </div>
          )}
          {canChallenge && <ChallengeForm value={counter} onChange={setCounter} onSubmit={challenge} />}
          <details className="rules">
            <summary>What happens at the deadline</summary>
            <p>Faith on a vow is capped at half of the stake, so a keeper cannot profit by letting their own vow fail.</p>
            <p>If the vow is kept, the keeper gets the stake back and faith backers share the doubt pool.</p>
            <p>If it is broken, half of the stake is burned. The other half and the faith pool go to the doubters.</p>
            <p>If it is broken and nobody doubted it, the whole stake and all faith backing are burned. Faith backers get nothing back.</p>
            <p>If the vow is too vague to judge, everyone is refunded.</p>
            <p>A kept or broken verdict is first only proposed. It opens a review window in which the losing side can submit a page, and nothing is payable until it closes. A favourable verdict needs a verbatim quote and a date on or before the deadline.</p>
          </details>
        </div>
      )}

      {phase === "due" && (
        <div className="act">
          <button onClick={onJudge} disabled={!me}>Ask validators to judge</button>
          {canRelease(v, now) && (
            <>
              <button className="ghost" onClick={onRelease} disabled={!me}>Release all stakes</button>
              <p className="meta">Thirty days have passed without a verdict. Releasing closes the vow as unclear and everyone can claim a full refund.</p>
            </>
          )}
          <p className="meta">
            {v.tries > 0
              ? `The evidence page could not be read on ${v.tries} attempt${v.tries > 1 ? "s" : ""}. Retries are an hour apart. After three, the vow counts as broken.`
              : "Validators will each read the evidence page and vote. This takes a minute or two."}
          </p>
          {!me && <button className="ghost" onClick={onConnect}>Connect a wallet to request a verdict</button>}
        </div>
      )}

      {inReview && (
        <div className="act">
          <p className="meta">
            Proposed verdict: <strong>{v.proposed === 1 ? "kept" : "broken"}</strong>.{" "}
            {reviewOpen(v, now)
              ? `It can be disputed for ${left(v.review_end, now).replace(" left", "")} more. Nothing is payable until it is final.`
              : "The review window has ended."}
          </p>
          {disputing && (
            <div className="challenge">
              <label>{v.proposed === 1 ? "Add a page that shows the vow failed" : "Add a page that shows the work was done by the deadline"}
                <input value={dispute} onChange={(e) => setDispute(e.target.value)} placeholder="https://web.archive.org/web/…/https://…" />
              </label>
              <button className="ghost" onClick={doDispute}>Submit dispute</button>
              <p className="meta">
                {v.proposed === 1
                  ? "An archive capture or commit link can overturn an editable page. An editable page can only cancel the vow with a refund."
                  : "The page still has to show a dated completion on or before the deadline. Work finished later does not count."}
              </p>
            </div>
          )}
          {v.proposed === 1 && now < v.deadline && !mine && (
            <>
              <label>Amount in GEN
                <input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" />
              </label>
              <button className="ghost" onClick={() => back("doubt")} disabled={!me}>Doubt this vow</button>
              <p className="meta">An early confirmation stays open to doubt until the review window ends.</p>
            </>
          )}
          {canFinalize(v, now) && (
            <>
              <button onClick={onFinalize} disabled={!me}>Finalize the verdict</button>
              <p className="meta">Anyone can finalize. If pages were disputed, validators read them once more and that result is final.</p>
            </>
          )}
          {canRelease(v, now) && (
            <>
              <button className="ghost" onClick={onRelease} disabled={!me}>Release all stakes</button>
              <p className="meta">Thirty days have passed without a final verdict. Everyone can claim a full refund.</p>
            </>
          )}
          {!me && <button className="ghost" onClick={onConnect}>Connect a wallet</button>}
        </div>
      )}

      {(phase === "kept" || phase === "broken" || phase === "unclear") && pos && (
        <div className="act">
          {BigInt(pos.payout) > 0n && !pos.claimed && <button onClick={onClaim}>Claim {gen(pos.payout)} GEN</button>}
          {pos.claimed && <p className="meta">You have claimed your payout.</p>}
          {BigInt(pos.payout) === 0n && (BigInt(pos.faith) > 0n || BigInt(pos.doubt) > 0n || mine) && (
            <p className="meta">Nothing is owed to this address.</p>
          )}
        </div>
      )}
    </aside>
  );
}

function ChallengeForm(p: { value: string; onChange: (v: string) => void; onSubmit: () => void }) {
  return (
    <div className="challenge">
      <label>Add a page that shows the vow failed
        <input value={p.value} onChange={(e) => p.onChange(e.target.value)} placeholder="https://example.com/what-actually-happened" />
      </label>
      <button className="ghost" onClick={p.onSubmit}>Submit counter-evidence</button>
      <p className="meta">One page per doubter. Validators treat it as a claim and only use it if it gives concrete facts that contradict the keeper's page.</p>
    </div>
  );
}
