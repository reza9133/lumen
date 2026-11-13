import { useEffect, useMemo, useState } from "react";
import { readParams, type Params } from "../chain";
import { useSource } from "../context";
import { gen, parseWei } from "../format";
import * as L from "../limits";
import { burned, owed } from "../payout";
import "./pages.css";

const MIN = (s: number) => (s >= 86400 ? `${s / 86400} days` : s >= 3600 ? `${s / 3600} hours` : s >= 60 ? `${s / 60} minutes` : `${s} seconds`);

// The lifecycle of a vow, drawn from the states and transitions the contract has.
function Lifecycle() {
  const box = (x: number, y: number, w: number, label: string, cls = "") => (
    <g key={label} className={`node ${cls}`}>
      <rect x={x} y={y} width={w} height={40} rx={12} />
      <text x={x + w / 2} y={y + 25} textAnchor="middle">{label}</text>
    </g>
  );
  const arrow = (d: string, label?: string, lx = 0, ly = 0, anchor: "start" | "middle" | "end" = "middle") => (
    <g className="edge" key={d}>
      <path d={d} markerEnd="url(#head)" />
      {label && <text x={lx} y={ly} textAnchor={anchor}>{label}</text>}
    </g>
  );
  return (
    <svg className="diagram" viewBox="0 -12 760 312" role="img" aria-label="A vow starts open. The keeper can retract it before the deadline if nobody has backed it. After the deadline validators read the page: a vow that is too vague ends unclear at once, otherwise the verdict goes to review, where it can be disputed, and anyone then finalizes it as kept or broken, or unclear when the evidence is contested. A vow with no final verdict thirty days later can be released as unclear, and everyone is refunded.">
      <defs>
        <marker id="head" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" /></marker>
      </defs>
      {box(10, 20, 110, "Open", "open")}
      {box(190, 20, 140, "Judging", "step")}
      {box(400, 20, 150, "In review", "review")}
      {box(640, 0, 110, "Kept", "kept")}
      {box(640, 62, 110, "Broken", "broken")}
      {box(400, 130, 150, "Unclear", "unclear")}
      {box(10, 130, 110, "Retracted", "retracted")}
      {box(360, 224, 230, "No final verdict for 30 days", "step")}
      {arrow("M120 40 H188", "deadline", 154, 33)}
      {arrow("M330 40 H398", "verdict", 364, 33)}
      {arrow("M550 32 L638 20", "finalize", 594, 8)}
      {arrow("M550 48 L638 82")}
      {arrow("M65 60 V128", "retract (no backing)", 76, 98, "start")}
      {arrow("M290 60 L420 128", "too vague", 335, 100, "end")}
      {arrow("M475 60 V128", "contested", 485, 100, "start")}
      {arrow("M475 222 V172", "release, refund", 485, 202, "start")}
    </svg>
  );
}

type CalcOk = { put: bigint; rows: { label: string; got: bigint; net: bigint; burn: bigint }[] };
type CalcErr = { error: string };

function Calculator() {
  const [stake, setStake] = useState("1");
  const [faith, setFaith] = useState("0.3");
  const [doubt, setDoubt] = useState("0.2");
  const [role, setRole] = useState<"keeper" | "faith" | "doubt">("faith");
  const [mine, setMine] = useState("0.1");

  const r = useMemo<CalcOk | CalcErr | null>(() => {
    const S = parseWei(stake), F = parseWei(faith), D = parseWei(doubt), M = parseWei(mine);
    if (S === null || F === null || D === null || M === null || S <= 0n) return null;
    if (role === "faith" && (M > F || F > S / BigInt(L.FAITH_CAP_DIV))) return { error: `Faith can be at most half the stake (${gen((S / 2n).toString())}), and your part cannot exceed the total.` };
    if (role === "doubt" && M > D) return { error: "Your doubt cannot exceed the total doubt." };
    const f = role === "faith" ? M : 0n;
    const d = role === "doubt" ? M : 0n;
    const keeper = role === "keeper";
    const put = keeper ? S : M;
    const rows = [
      ["Kept", L.KEPT, S, F, D],
      ["Broken", L.BROKEN, S, F, D],
      ["Broken, and nobody doubted", L.BROKEN, S, F, 0n],
      ["Unclear (a full refund)", L.UNCLEAR, S, F, D],
      ["Retracted by the keeper", L.RETRACTED, S, 0n, 0n],
    ] as const;
    return {
      put,
      rows: rows
        .filter(([label]) => (label === "Retracted by the keeper" ? keeper : label !== "Broken, and nobody doubted" || role !== "doubt"))
        .map(([label, state, s, ff, dd]) => {
          const got = owed(state, keeper, f, role === "doubt" && dd === 0n ? 0n : d, s, ff, dd);
          return { label, got, net: got - put, burn: burned(state, s, ff, dd) };
        }),
    };
  }, [stake, faith, doubt, role, mine]);

  return (
    <section className="card" aria-label="Payout calculator">
      <h3>What would I get?</h3>
      <p className="meta">The same rules the contract uses to pay out, and the same code as the preview in the vow panel. Enter the pools of a vow and your part in them.</p>
      <div className="calc-grid">
        <label>Keeper's stake (GEN)<input value={stake} onChange={(e) => setStake(e.target.value)} inputMode="decimal" /></label>
        <label>Total faith (GEN)<input value={faith} onChange={(e) => setFaith(e.target.value)} inputMode="decimal" /></label>
        <label>Total doubt (GEN)<input value={doubt} onChange={(e) => setDoubt(e.target.value)} inputMode="decimal" /></label>
        <label>I am<select value={role} onChange={(e) => setRole(e.target.value as typeof role)}>
          <option value="faith">a faith backer</option><option value="doubt">a doubter</option><option value="keeper">the keeper</option>
        </select></label>
        {role !== "keeper" && <label>My amount (GEN)<input value={mine} onChange={(e) => setMine(e.target.value)} inputMode="decimal" /></label>}
      </div>
      {r === null && <p className="meta error">Enter the amounts as numbers, for example 0.5.</p>}
      {r && "error" in r && <p className="meta error" role="alert">{r.error}</p>}
      {r && "rows" in r && (
        <div className="table-wrap">
          <table className="data">
            <thead><tr><th>If the vow ends</th><th className="num">I receive</th><th className="num">Compared with what I put in ({gen(r.put.toString())})</th><th className="num">Burned</th></tr></thead>
            <tbody>
              {r.rows.map((x) => (
                <tr key={x.label}>
                  <td>{x.label}</td>
                  <td className="num">{gen(x.got.toString())} GEN</td>
                  <td className={`num ${x.net > 0n ? "up" : x.net < 0n ? "down" : ""}`}>{x.net > 0n ? "+" : ""}{gen(x.net.toString())} GEN</td>
                  <td className="num">{gen(x.burn.toString())} GEN</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

export default function Protocol() {
  const source = useSource();
  const [params, setParams] = useState<Params | null>(null);
  const [err, setErr] = useState("");
  useEffect(() => {
    if (source.kind !== "chain") return;
    readParams().then(setParams).catch((e) => setErr(e?.message ?? "Could not read params()."));
  }, [source]);

  const rows: [string, string, string][] = [
    ["Minimum stake", `${gen(L.MIN_STAKE.toString())} GEN`, "min_stake"],
    ["Minimum backing", `${gen(L.MIN_BACK.toString())} GEN`, "min_back"],
    ["Vow text", `${L.MIN_TEXT} to ${L.MAX_TEXT} characters`, "max_text"],
    ["Deadline", `${MIN(L.MIN_WINDOW)} to ${MIN(L.MAX_WINDOW)} from now`, "min_window"],
    ["Faith on one vow", `at most 1/${L.FAITH_CAP_DIV} of the stake`, "faith_cap_div"],
    ["Progress notes", `${L.MAX_UPDATES} per vow, ${L.MIN_UPDATE} to ${L.MAX_UPDATE} characters each`, "max_updates"],
    ["Retraction", `before the deadline, only with no backing, burns 1/${L.RETRACT_BURN_DIV} of the stake`, "retract_burn_div"],
    ["Pinned proof", `${L.MAX_PINS} per vow`, "max_pins"],
    ["Counter-evidence", `${L.MAX_COUNTERS} pages per vow`, "max_counters"],
    ["Review window", `1/${L.REVIEW_DIV} of the vow's lifetime, ${MIN(L.REVIEW_MIN)} to ${MIN(L.REVIEW_MAX)}`, "review_div"],
    ["Release", `${MIN(L.RELEASE_AFTER)} after the deadline without a verdict`, "release_after"],
    ["Evidence reads", `${L.MAX_TRIES} tries, one hour apart`, "max_tries"],
  ];
  const match = params
    ? params.min_stake === L.MIN_STAKE.toString() && params.min_back === L.MIN_BACK.toString() && params.max_text === L.MAX_TEXT && params.max_updates === L.MAX_UPDATES &&
      params.retract_burn_div === L.RETRACT_BURN_DIV && params.review_div === L.REVIEW_DIV && params.release_after === L.RELEASE_AFTER
    : null;

  return (
    <div className="page-in">
      <h2 className="page-title">Protocol</h2>
      <p className="lede">The whole life of a vow, the money rules, and every limit the contract enforces.</p>

      <section className="card" aria-label="Lifecycle">
        <h3>Life of a vow</h3>
        <Lifecycle />
        <ol className="steps">
          <li><strong>Open.</strong> The keeper stakes GEN and names the page that will prove the vow. Others back it with faith or doubt. The keeper can post progress notes, pin firm proof, or retract while nobody has backed it.</li>
          <li><strong>Judging.</strong> After the deadline every validator reads the page. A kept verdict needs a verbatim quote and a date on or before the deadline.</li>
          <li><strong>Review.</strong> A verdict is a proposal. The losing side can submit a page until the window closes. Then anyone finalizes.</li>
          <li><strong>Claim.</strong> Each address withdraws what the rules give it. A vow with no verdict thirty days after its deadline can be released and refunds everyone.</li>
        </ol>
      </section>

      <Calculator />

      <section className="card" aria-label="Limits">
        <h3>Limits</h3>
        {match === true && <p className="meta ok">These limits match the deployed contract (read from <code>params()</code>, version {params!.version}).</p>}
        {match === false && <p className="meta error" role="alert">The deployed contract (version {params!.version}) reports different limits than this app expects. Update the app before sending transactions.</p>}
        {err && <p className="meta error">{err}</p>}
        {source.kind === "demo" && <p className="meta">Shown from the app's own table. On a live deployment this page compares it with the contract.</p>}
        <div className="table-wrap">
          <table className="data"><tbody>{rows.map(([k, v]) => <tr key={k}><th scope="row">{k}</th><td>{v}</td></tr>)}</tbody></table>
        </div>
      </section>

      <section className="card" aria-label="Tiers">
        <h3>Keeper tiers</h3>
        <div className="table-wrap">
          <table className="data">
            <thead><tr><th>Tier</th><th className="num">Kept vows</th><th className="num">GEN staked on them</th><th>Broken vows</th></tr></thead>
            <tbody>
              {L.TIERS.map((t) => (
                <tr key={t.name}><td>{t.name}</td><td className="num">{t.kept}+</td><td className="num">{gen(t.keptStake.toString())}+</td><td>{t.brokenDiv ? `fewer than 1 per ${t.brokenDiv} kept` : "any"}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
