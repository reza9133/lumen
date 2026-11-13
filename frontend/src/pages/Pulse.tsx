import { useMemo } from "react";
import { useNow } from "../clock";
import { useVows } from "../context";
import { PHASE_LABEL, gen, phaseOf, type Phase } from "../format";
import "./pages.css";

const ORDER: Phase[] = ["kept", "broken", "retracted", "unclear", "review", "due", "burning"];
const DAY = 86400;

// Charts of what the loaded vows say. Everything is drawn as plain SVG from the same data the sky uses.
export default function Pulse() {
  const { vows, stats, loaded } = useVows();
  const now = useNow();

  const data = useMemo(() => {
    const phases = new Map<Phase, number>();
    const pools = [0, 0, 0, 0, 0];
    const perDay = Array(30).fill(0) as number[];
    let faith = 0n, doubt = 0n, stake = 0n;
    for (const v of vows) {
      const p = phaseOf(v.state, v.deadline, now);
      phases.set(p, (phases.get(p) ?? 0) + 1);
      const pool = Number(BigInt(v.stake) + BigInt(v.faith) + BigInt(v.doubt)) / 1e18;
      pools[pool < 0.5 ? 0 : pool < 1 ? 1 : pool < 2 ? 2 : pool < 5 ? 3 : 4] += 1;
      const age = Math.floor((now - v.created) / DAY);
      if (age >= 0 && age < 30) perDay[29 - age] += 1;
      faith += BigInt(v.faith);
      doubt += BigInt(v.doubt);
      stake += BigInt(v.stake);
    }
    return { phases, pools, perDay, faith, doubt, stake };
  }, [vows, now]);

  if (!loaded || !stats) return <div className="page-in"><h2 className="page-title">Pulse</h2><p className="meta pad" role="status">Reading the sky…</p></div>;

  const total = vows.length || 1;
  const judged = stats.kept + stats.broken;
  const locked = BigInt(stats.deposited) - BigInt(stats.paid) - BigInt(stats.embers);
  const maxDay = Math.max(1, ...data.perDay);
  const maxPool = Math.max(1, ...data.pools);
  const poolLabels = ["< 0.5", "0.5 – 1", "1 – 2", "2 – 5", "5 +"];
  const bar = (n: number, max: number, h: number) => Math.max(n > 0 ? 3 : 0, Math.round((n / max) * h));

  return (
    <div className="page-in">
      <h2 className="page-title">Pulse</h2>
      <p className="lede">How the vows are going. {stats.total} lit by {stats.keepers} keepers{loaded && vows.length < stats.total ? `; the ${vows.length} newest are charted` : ""}.</p>

      <dl className="facts">
        <div><dt>Kept rate</dt><dd>{judged ? Math.round((stats.kept * 100) / judged) : 0}<small>% of {judged} judged</small></dd></div>
        <div><dt>Retracted</dt><dd>{stats.retracted}</dd></div>
        <div><dt>Deposited</dt><dd>{gen(stats.deposited)}<small> GEN</small></dd></div>
        <div><dt>Paid out</dt><dd>{gen(stats.paid)}<small> GEN</small></dd></div>
        <div><dt>Burned</dt><dd>{gen(stats.embers)}<small> GEN</small></dd></div>
        <div><dt>Still held</dt><dd>{gen(locked.toString())}<small> GEN</small></dd></div>
      </dl>

      <section className="card" aria-label="Where the vows stand">
        <h3>Where the vows stand</h3>
        <div className="stack" role="img" aria-label={ORDER.map((p) => `${PHASE_LABEL[p]} ${data.phases.get(p) ?? 0}`).join(", ")}>
          {ORDER.map((p) => (data.phases.get(p) ? <i key={p} className={`c-${p}`} style={{ width: `${((data.phases.get(p) ?? 0) / total) * 100}%` }} title={`${PHASE_LABEL[p]}: ${data.phases.get(p)}`} /> : null))}
        </div>
        <ul className="legend">
          {ORDER.map((p) => <li key={p}><i className={`c-${p}`} />{PHASE_LABEL[p]} <b>{data.phases.get(p) ?? 0}</b></li>)}
        </ul>
      </section>

      <div className="two-col">
        <section className="card" aria-label="Vows lit per day">
          <h3>Lit per day, last 30 days</h3>
          <svg viewBox="0 0 300 120" className="chart" role="img" aria-label={`Vows lit each day for 30 days, most in one day: ${maxDay}`}>
            {data.perDay.map((n, i) => <rect key={i} x={i * 10 + 1} y={100 - bar(n, maxDay, 90)} width={8} height={bar(n, maxDay, 90)} rx={2} className="c-burning"><title>{n} lit {29 - i} days ago</title></rect>)}
            <line x1="0" y1="100.5" x2="300" y2="100.5" className="axis" />
            <text x="0" y="116" className="tick">30 days ago</text>
            <text x="300" y="116" className="tick" textAnchor="end">today</text>
          </svg>
        </section>
        <section className="card" aria-label="Size of the pools">
          <h3>Pool size (GEN)</h3>
          <svg viewBox="0 0 300 120" className="chart" role="img" aria-label={`Vows by total pool: ${poolLabels.map((l, i) => `${l} GEN ${data.pools[i]}`).join(", ")}`}>
            {data.pools.map((n, i) => (
              <g key={i}>
                <rect x={i * 60 + 8} y={90 - bar(n, maxPool, 78)} width={44} height={bar(n, maxPool, 78)} rx={3} className="c-kept"><title>{n} vows</title></rect>
                <text x={i * 60 + 30} y={108} className="tick" textAnchor="middle">{poolLabels[i]}</text>
                <text x={i * 60 + 30} y={85 - bar(n, maxPool, 78)} className="tick" textAnchor="middle">{n}</text>
              </g>
            ))}
          </svg>
        </section>
      </div>

      <section className="card" aria-label="Faith and doubt">
        <h3>Faith and doubt</h3>
        {(() => {
          const sum = data.faith + data.doubt;
          const pct = sum > 0n ? Number((data.faith * 100n) / sum) : 50;
          return (
            <>
              <div className="split" role="img" aria-label={`Faith ${pct} percent, doubt ${100 - pct} percent`}><i style={{ width: `${pct}%` }} /></div>
              <div className="row"><span>Faith {gen(data.faith.toString())} GEN</span><span>Doubt {gen(data.doubt.toString())} GEN</span></div>
              <p className="meta">Keepers have staked {gen(data.stake.toString())} GEN on these vows. Faith is capped at half of each stake; doubt is not.</p>
            </>
          );
        })()}
      </section>
    </div>
  );
}
