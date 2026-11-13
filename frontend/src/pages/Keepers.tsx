import { useEffect, useMemo, useState } from "react";
import type { Profile } from "../chain";
import { useSource, useVows } from "../context";
import { alias, gen, short } from "../format";
import { TIERS } from "../limits";
import { href } from "../router";
import "./pages.css";

type Sort = "tier" | "kept" | "streak" | "stake" | "vows";
const SORTS: [Sort, string][] = [["tier", "Highest tier"], ["kept", "Most kept"], ["streak", "Longest streak"], ["stake", "Most staked on kept vows"], ["vows", "Most vows"]];
const RANK = new Map<string, number>([...TIERS.map((t, i) => [t.name, TIERS.length - i] as [string, number]), ["Unlit", 0]]);

export function TierBadge({ tier }: { tier: string }) {
  return <span className={`tier t-${tier.toLowerCase()}`}>{tier}</span>;
}

// A row of small dots, one per judged vow, is the quickest way to read a record.
export function Record({ kept, broken, retracted }: { kept: number; broken: number; retracted: number }) {
  const cap = 24;
  const dots = [...Array(kept).fill("kept"), ...Array(broken).fill("broken"), ...Array(retracted).fill("retracted")].slice(0, cap);
  const more = kept + broken + retracted - dots.length;
  return (
    <span className="record" role="img" aria-label={`${kept} kept, ${broken} broken, ${retracted} retracted`}>
      {dots.map((d, i) => <i key={i} className={`d-${d}`} />)}
      {more > 0 && <small>+{more}</small>}
    </span>
  );
}

export default function Keepers() {
  const source = useSource();
  const { rev, loaded } = useVows();
  const [rows, setRows] = useState<Profile[]>([]);
  const [total, setTotal] = useState(0);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<Sort>("tier");
  const [tier, setTier] = useState<string>("all");

  useEffect(() => {
    if (!loaded) return undefined;
    let live = true;
    (async () => {
      try {
        const all: Profile[] = [];
        let first = await source.keepers(0, 100);
        all.push(...first.rows);
        while (all.length < first.total && all.length < 1000) {
          const next = await source.keepers(all.length, 100);
          if (next.rows.length === 0) break;
          all.push(...next.rows);
        }
        if (live) { setRows(all); setTotal(first.total); setReady(true); setError(""); }
      } catch (e: any) {
        if (live) setError(e?.message ?? "Could not read the keepers.");
      }
    })();
    return () => { live = false; };
  }, [source, rev, loaded]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = rows.filter((r) => (tier === "all" || r.tier === tier) && (q === "" || r.address.includes(q) || alias(r.address).toLowerCase().includes(q)));
    const by: Record<Sort, (a: Profile, b: Profile) => number> = {
      tier: (a, b) => (RANK.get(b.tier) ?? 0) - (RANK.get(a.tier) ?? 0) || b.kept - a.kept,
      kept: (a, b) => b.kept - a.kept,
      streak: (a, b) => b.streak - a.streak || b.best - a.best,
      stake: (a, b) => (BigInt(b.kept_stake) > BigInt(a.kept_stake) ? 1 : BigInt(b.kept_stake) < BigInt(a.kept_stake) ? -1 : 0),
      vows: (a, b) => b.vows - a.vows,
    };
    return [...list].sort(by[sort]);
  }, [rows, query, sort, tier]);

  const counts = useMemo(() => {
    const c = new Map<string, number>();
    for (const r of rows) c.set(r.tier, (c.get(r.tier) ?? 0) + 1);
    return c;
  }, [rows]);

  return (
    <div className="page-in">
      <h2 className="page-title">Keepers</h2>
      <p className="lede">Everyone who has lit a vow, and the standing their record earns. A tier needs kept vows, GEN staked on them, and few broken ones.</p>

      <ul className="tiers" aria-label="Tiers">
        {[...TIERS].reverse().map((t) => (
          <li key={t.name}>
            <TierBadge tier={t.name} />
            <span>{t.kept}+ kept, {gen(t.keptStake.toString())}+ GEN{t.brokenDiv ? `, under 1 broken per ${t.brokenDiv} kept` : ""}</span>
            <b>{counts.get(t.name) ?? 0}</b>
          </li>
        ))}
      </ul>

      <div className="tools row-tools">
        <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search by name or address" aria-label="Search keepers" />
        <select value={tier} onChange={(e) => setTier(e.target.value)} aria-label="Filter by tier">
          <option value="all">All tiers</option>
          {[...TIERS].reverse().map((t) => <option key={t.name} value={t.name}>{t.name}</option>)}
          <option value="Unlit">Unlit</option>
        </select>
        <select value={sort} onChange={(e) => setSort(e.target.value as Sort)} aria-label="Sort keepers">
          {SORTS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
      </div>

      {error && <p className="meta error" role="alert">{error}</p>}
      {!ready && !error && <p className="meta pad" role="status">Reading the keepers…</p>}
      {ready && shown.length === 0 && <p className="meta pad">No keepers match.</p>}
      {shown.length > 0 && (
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr><th>Keeper</th><th>Tier</th><th>Record</th><th className="num">Kept</th><th className="num">Broken</th><th className="num">Retracted</th><th className="num">Streak</th><th className="num">Staked on kept</th></tr>
            </thead>
            <tbody>
              {shown.map((r) => (
                <tr key={r.address}>
                  <td><a href={href.keeper(r.address)}><strong>{alias(r.address)}</strong></a> <span className="addr">{short(r.address)}</span></td>
                  <td><TierBadge tier={r.tier} /></td>
                  <td><Record kept={r.kept} broken={r.broken} retracted={r.retracted} /></td>
                  <td className="num">{r.kept}</td>
                  <td className="num">{r.broken}</td>
                  <td className="num">{r.retracted}</td>
                  <td className="num">{r.streak}<small> / {r.best}</small></td>
                  <td className="num">{gen(r.kept_stake)} GEN</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {ready && <p className="meta pad">{shown.length} of {total} keepers. Streak shows current / best.</p>}
    </div>
  );
}
