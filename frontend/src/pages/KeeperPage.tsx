import { useEffect, useState } from "react";
import type { Profile, Vow } from "../chain";
import { useNow } from "../clock";
import { useActions, useSource, useVows } from "../context";
import { PHASE_LABEL, alias, dateOf, gen, left, phaseOf, short } from "../format";
import { TIERS } from "../limits";
import { nextStep } from "../payout";
import { href } from "../router";
import { Record, TierBadge } from "./Keepers";
import "./pages.css";

export default function KeeperPage({ address }: { address: string }) {
  const source = useSource();
  const { rev, loaded } = useVows();
  const { me } = useActions();
  const now = useNow();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [vows, setVows] = useState<Vow[]>([]);
  const [next, setNext] = useState(-1);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!loaded) return undefined;
    let live = true;
    setError("");
    Promise.all([source.profile(address), source.vowsOf(address, -1, 20)])
      .then(([p, v]) => {
        if (!live) return;
        setProfile(p);
        setVows(v.rows);
        setNext(v.next);
      })
      .catch((e) => live && setError(e?.message ?? "Could not read this keeper."));
    return () => { live = false; };
  }, [source, address, rev, loaded]);

  const more = async () => {
    const v = await source.vowsOf(address, next, 20);
    setVows((old) => [...old, ...v.rows.filter((r) => !old.some((o) => o.id === r.id))]);
    setNext(v.next);
  };

  const step = profile ? nextStep(profile.kept, profile.broken, BigInt(profile.kept_stake)) : null;
  const judged = [...vows].filter((v) => [1, 2, 5].includes(v.state)).sort((a, b) => a.id - b.id);

  return (
    <div className="page-in">
      <p className="crumb"><a href={href.keepers}>Keepers</a> / {short(address)}</p>
      <h2 className="page-title">{alias(address)} {profile && <TierBadge tier={profile.tier} />}</h2>
      <p className="lede"><span className="addr">{address}</span>{me && me.toLowerCase() === address.toLowerCase() ? "  (you)" : ""}</p>
      {error && <p className="meta error" role="alert">{error}</p>}
      {!profile && !error && <p className="meta pad" role="status">Reading this keeper…</p>}
      {profile && (
        <>
          <dl className="facts">
            <div><dt>Vows lit</dt><dd>{profile.vows}</dd></div>
            <div><dt>Kept</dt><dd>{profile.kept}</dd></div>
            <div><dt>Broken</dt><dd>{profile.broken}</dd></div>
            <div><dt>Retracted</dt><dd>{profile.retracted}</dd></div>
            <div><dt>Streak</dt><dd>{profile.streak}<small> best {profile.best}</small></dd></div>
            <div><dt>Staked on kept</dt><dd>{gen(profile.kept_stake)}<small> GEN</small></dd></div>
          </dl>

          <section className="card" aria-label="Standing">
            <h3>Standing</h3>
            <div className="ladder" role="img" aria-label={`Current tier ${profile.tier}`}>
              {[...TIERS].reverse().map((t) => (
                <span key={t.name} className={`rung${profile.tier === t.name ? " here" : ""}`}><TierBadge tier={t.name} /></span>
              ))}
            </div>
            {step ? (
              <p className="meta">For <strong>{step.name}</strong> this keeper still needs {step.missing.length ? step.missing.join(", ") : "nothing more than the next judged vow"}.</p>
            ) : (
              <p className="meta">This is the highest tier.</p>
            )}
            <p className="meta">Record, oldest vow first: <Record kept={judged.filter((v) => v.state === 1).length} broken={judged.filter((v) => v.state === 2).length} retracted={judged.filter((v) => v.state === 5).length} /></p>
          </section>

          <section className="card" aria-label="Vows">
            <h3>Vows</h3>
            {vows.length === 0 && <p className="meta">No vows yet.</p>}
            <ul className="vowlist">
              {vows.map((v) => {
                const phase = phaseOf(v.state, v.deadline, now);
                return (
                  <li key={v.id}>
                    <a href={href.vow(v.id)}>
                      <span className={`pill p-${phase}`}>{PHASE_LABEL[phase]}</span>
                      <span className="txt">{v.text}</span>
                      <span className="sub">{gen((BigInt(v.stake) + BigInt(v.faith) + BigInt(v.doubt)).toString())} GEN</span>
                      <span className="sub">{phase === "burning" ? left(v.deadline, now) : dateOf(v.deadline)}</span>
                    </a>
                  </li>
                );
              })}
            </ul>
            {next >= 0 && <button className="ghost" onClick={more}>Show older vows</button>}
          </section>
        </>
      )}
    </div>
  );
}
