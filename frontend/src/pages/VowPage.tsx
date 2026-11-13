import { useEffect, useState } from "react";
import type { Vow } from "../chain";
import { useSource, useVows } from "../context";
import { href } from "../router";
import VowView from "../VowView";
import "./pages.css";

// One vow on a page of its own, for sharing. It reads from the synced list and falls back to asking the contract
// for a vow older than the pages that are loaded.
export default function VowPage({ id }: { id: number }) {
  const source = useSource();
  const { vows, loaded } = useVows();
  const [far, setFar] = useState<Vow | null>(null);
  const [error, setError] = useState("");
  const listed = vows.find((v) => v.id === id) ?? null;

  useEffect(() => {
    setFar(null);
    setError("");
    if (listed || !loaded) return undefined;
    let live = true;
    source.vow(id).then((v) => live && setFar(v)).catch(() => live && setError("There is no vow with this number."));
    return () => { live = false; };
  }, [id, listed, loaded, source]);

  const v = listed ?? far;
  return (
    <div className="page-in narrow">
      <p className="crumb"><a href={href.home}>Sky</a> / vow {id}</p>
      {!v && !error && <p className="meta pad" role="status">Reading the vow…</p>}
      {error && <p className="meta error" role="alert">{error}</p>}
      {v && <VowView vow={v} variant="page" />}
    </div>
  );
}
