import { useMemo, useState } from "react";
import type { Vow } from "./chain";
import { PHASE_LABEL, alias, gen, left, phaseOf, type Phase } from "./format";

export type Sort = "newest" | "ending" | "pool";
const SORTS: [Sort, string][] = [
  ["newest", "Newest first"],
  ["ending", "Ending soonest"],
  ["pool", "Largest pool"],
];

const poolOf = (v: Vow) => BigInt(v.stake) + BigInt(v.faith) + BigInt(v.doubt);

export default function Ledger(p: {
  vows: Vow[];
  now: number;
  filter: Phase | "all";
  selected: number | null;
  onPick: (id: number) => void;
}) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<Sort>("newest");

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = p.vows.filter((v) => {
      if (p.filter !== "all" && phaseOf(v.state, v.deadline, p.now) !== p.filter) return false;
      if (q === "") return true;
      return v.text.toLowerCase().includes(q) || alias(v.keeper).toLowerCase().includes(q) || v.keeper.toLowerCase().includes(q);
    });
    if (sort === "ending") {
      // Open vows first, nearest deadline on top; judged vows follow, newest first.
      return [...list].sort((a, b) => {
        const ao = a.state === 0 || a.state === 4, bo = b.state === 0 || b.state === 4;
        if (ao !== bo) return ao ? -1 : 1;
        return ao ? a.deadline - b.deadline : b.id - a.id;
      });
    }
    if (sort === "pool") {
      return [...list].sort((a, b) => {
        const pa = poolOf(a), pb = poolOf(b);
        return pa === pb ? b.id - a.id : pa > pb ? -1 : 1;
      });
    }
    return list;
  }, [p.vows, p.filter, p.now, query, sort]);

  return (
    <section className="ledger" aria-label="All vows">
      <div className="tools">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search vows or keepers"
          aria-label="Search vows or keepers"
        />
        <select value={sort} onChange={(e) => setSort(e.target.value as Sort)} aria-label="Sort vows">
          {SORTS.map(([k, label]) => <option key={k} value={k}>{label}</option>)}
        </select>
      </div>
      {rows.length === 0 && <p className="meta pad">No vows match.</p>}
      <ul>
        {rows.map((v) => {
          const phase = phaseOf(v.state, v.deadline, p.now);
          return (
            <li key={v.id}>
              <button className={`entry${p.selected === v.id ? " on" : ""}`} onClick={() => p.onPick(v.id)}>
                <span className={`pill p-${phase}`}>{PHASE_LABEL[phase]}</span>
                <span className="txt">{v.text}</span>
                <span className="sub">{alias(v.keeper)}</span>
                <span className="sub">{gen(poolOf(v))} GEN</span>
                <span className="sub">{phase === "burning" ? left(v.deadline, p.now) : new Date(v.deadline * 1000).toLocaleDateString()}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
