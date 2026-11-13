import { useEffect, useState } from "react";
import type { Position, Profile, Vow } from "./chain";
import { useNow } from "./clock";
import { useActions, useSource } from "./context";
import Drawer from "./Drawer";

// A vow with everything a person can do to it. The drawer over the sky and the full page share this wrapper, so the
// two never drift apart: it loads the connected account's position and the keeper's record, and wires the buttons.
export default function VowView({ vow: v, variant, onClose }: { vow: Vow; variant: "drawer" | "page"; onClose?: () => void }) {
  const source = useSource();
  const { me, act, connect, notice, invalid } = useActions();
  const now = useNow();
  const [pos, setPos] = useState<Position | null>(null);
  const [record, setRecord] = useState<Profile | null>(null);

  // Clear on a change of vow or account only. A periodic refresh must not blank the panel, and an answer that
  // arrives after the selection moved on is dropped.
  useEffect(() => setPos(null), [v.id, me]);
  useEffect(() => {
    if (!me) return undefined;
    let live = true;
    source.position(v.id, me).then((p) => live && setPos(p)).catch(() => {});
    return () => { live = false; };
  }, [v.id, me, v.state, v.faith, v.doubt, v.review_end, source]);
  useEffect(() => setRecord(null), [v.keeper]);
  useEffect(() => {
    let live = true;
    source.profile(v.keeper).then((r) => live && setRecord(r)).catch(() => {});
    return () => { live = false; };
  }, [v.keeper, v.state, source]);

  return (
    <Drawer
      vow={v}
      now={now}
      me={me}
      pos={pos}
      record={record}
      variant={variant}
      onConnect={connect}
      onClose={onClose}
      onInvalid={invalid}
      onNotice={notice}
      onBack={(side, wei) => act(side === "faith" ? "Adding your faith" : "Adding your doubt", side === "faith" ? "Faith added." : "Doubt added.", "back", [v.id, side], wei)}
      onJudge={() => act("Validators are reading the evidence. This can take a minute or two.", "A verdict is proposed. Check the lantern for the review window.", "judge", [v.id])}
      onChallenge={(url) => act("Adding your counter-evidence", "Counter-evidence added.", "challenge", [v.id, url])}
      onPin={(url) => act("Pinning your proof", "Proof pinned.", "pin_evidence", [v.id, url])}
      onDispute={(url) => act("Adding your dispute", "Dispute added.", "dispute", [v.id, url])}
      onFinalize={() => act("Finalizing. If pages were disputed the validators read them again, which can take a minute or two.", "Verdict final. Check the lantern.", "finalize", [v.id])}
      onRelease={() => act("Releasing the stakes", "Released. Everyone can now claim a refund.", "release", [v.id])}
      onClaim={() => act("Claiming", "Claim submitted. The payout arrives when the transaction finalizes.", "claim", [v.id])}
      onUpdate={(text) => act("Posting your note", "Note posted.", "post_update", [v.id, text])}
      onRetract={() => act("Retracting your vow", "Vow retracted. You can claim the rest of the stake.", "retract", [v.id])}
    />
  );
}
