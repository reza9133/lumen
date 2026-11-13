import { useEffect, useMemo, useState, type ReactNode } from "react";
import type { FeedEntry } from "../chain";
import { useNow } from "../clock";
import { useSource, useVows } from "../context";
import { ago, alias } from "../format";
import { href } from "../router";
import "./pages.css";

const GROUPS: [string, string, string[]][] = [
  ["all", "Everything", []],
  ["new", "New vows", ["made"]],
  ["backing", "Backing", ["faith", "doubt"]],
  ["notes", "Notes and proof", ["update", "pinned", "challenged"]],
  ["verdicts", "Verdicts", ["proposed", "kept", "broken", "unclear", "retracted", "released", "disputed"]],
  ["money", "Payouts", ["claimed"]],
];
const KIND: Record<string, string> = { made: "new", faith: "good", doubt: "bad", update: "note", pinned: "note", challenged: "bad", kept: "good", broken: "bad", retracted: "mute", unclear: "mute", claimed: "good" };

// One sentence per kind of event. The feed records which vow it happened to, not who acted, so backers stay anonymous here.
function sentence(action: string, k: ReactNode): ReactNode {
  switch (action) {
    case "made": return <>{k} lit a vow</>;
    case "faith": return <>Faith was added to a vow by {k}</>;
    case "doubt": return <>Doubt was added to a vow by {k}</>;
    case "update": return <>{k} posted a progress note</>;
    case "pinned": return <>{k} pinned firm proof</>;
    case "challenged": return <>A doubter added counter-evidence to a vow by {k}</>;
    case "checked": return <>Validators checked a vow by {k} early</>;
    case "retry": return <>Validators could not read the evidence of a vow by {k}</>;
    case "proposed": return <>Validators proposed a verdict on a vow by {k}</>;
    case "disputed": return <>A page was submitted against the verdict on a vow by {k}</>;
    case "kept": return <>A vow by {k} was kept</>;
    case "broken": return <>A vow by {k} was broken</>;
    case "unclear": return <>A vow by {k} ended unclear</>;
    case "retracted": return <>{k} retracted a vow</>;
    case "released": return <>A vow by {k} was released, everyone can claim a refund</>;
    case "claimed": return <>A payout was claimed from a vow by {k}</>;
    default: return <>{action} on a vow by {k}</>;
  }
}

export default function Activity() {
  const source = useSource();
  const { rev, loaded } = useVows();
  const now = useNow();
  const [rows, setRows] = useState<FeedEntry[]>([]);
  const [ready, setReady] = useState(false);
  const [group, setGroup] = useState("all");
  const [error, setError] = useState("");
  const [pages, setPages] = useState(1);

  useEffect(() => {
    if (!loaded) return undefined;
    let live = true;
    Promise.all(Array.from({ length: pages }, (_, i) => source.activity(i * 100, 100)))
      .then((chunks) => { if (live) { setRows(chunks.flat()); setReady(true); setError(""); } })
      .catch((e) => live && setError(e?.message ?? "Could not read the activity."));
    return () => { live = false; };
  }, [source, rev, loaded, pages]);

  const shown = useMemo(() => {
    const set = GROUPS.find(([k]) => k === group)![2];
    return set.length ? rows.filter((r) => set.includes(r.action)) : rows;
  }, [rows, group]);

  return (
    <div className="page-in">
      <h2 className="page-title">Activity</h2>
      <p className="lede">Everything that happened to any vow, newest first. It updates by itself when the contract changes.</p>
      <div className="seg wide" role="group" aria-label="Filter activity">
        {GROUPS.map(([k, label]) => (
          <button key={k} className={group === k ? "on" : ""} aria-pressed={group === k} onClick={() => setGroup(k)}>{label}</button>
        ))}
      </div>
      {error && <p className="meta error" role="alert">{error}</p>}
      {!ready && !error && <p className="meta pad" role="status">Reading the activity…</p>}
      {ready && shown.length === 0 && <p className="meta pad">Nothing yet.</p>}
      <ol className="feed">
        {shown.map((e) => (
          <li key={e.seq} className={`k-${KIND[e.action] ?? "note"}`}>
            <time dateTime={new Date(e.at * 1000).toISOString()} title={new Date(e.at * 1000).toLocaleString()}>{ago(e.at, now)}</time>
            <span>
              {sentence(e.action, <a href={href.keeper(e.keeper)}>{alias(e.keeper)}</a>)}:{" "}
              <a className="vowlink" href={href.vow(e.vow)}>{e.text}</a>
            </span>
          </li>
        ))}
      </ol>
      {ready && rows.length >= pages * 100 && <button className="ghost" onClick={() => setPages(pages + 1)}>Show older activity</button>}
    </div>
  );
}
