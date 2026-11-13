// Mirror of the contract's payout rules (`_owed` in contracts/lumen.py), used to preview what a
// backing would return. Amounts are wei as bigint; division floors, exactly like the contract.

import { RETRACT_BURN_DIV, TIERS, type Tier } from "./limits.ts";

export const STATE_KEPT = 1;
export const STATE_BROKEN = 2;
export const STATE_UNCLEAR = 3;
export const STATE_RETRACTED = 5;

export function owed(
  state: number,
  isKeeper: boolean,
  f: bigint,
  d: bigint,
  stake: bigint,
  faith: bigint,
  doubt: bigint,
): bigint {
  if (state === STATE_UNCLEAR) return f + d + (isKeeper ? stake : 0n);
  if (state === STATE_RETRACTED) return isKeeper ? stake - stake / BigInt(RETRACT_BURN_DIV) : 0n;
  if (state === STATE_KEPT) {
    let out = isKeeper ? stake : 0n;
    if (faith > 0n) out += f + (doubt * f) / faith;
    else if (isKeeper) out += doubt;
    return out;
  }
  if (state === STATE_BROKEN && doubt > 0n && d > 0n) {
    const pot = stake - stake / 2n + faith;
    return d + (pot * d) / doubt;
  }
  return 0n;
}

export type Preview = {
  put: bigint; // everything this address would have on the vow after the backing
  kept: bigint; // payout if the vow is kept
  broken: bigint; // payout if it is broken
  unclear: bigint; // payout if it is closed as unclear (a full refund)
};

type Pools = { stake: string; faith: string; doubt: string };

// What an address would receive in each outcome if it added `add` wei to `side`, with the pools as
// they are now. `mine` is what the address already has on the vow.
export function preview(v: Pools, mine: { faith: bigint; doubt: bigint }, side: "faith" | "doubt", add: bigint): Preview {
  const onFaith = side === "faith";
  const f = mine.faith + (onFaith ? add : 0n);
  const d = mine.doubt + (onFaith ? 0n : add);
  const stake = BigInt(v.stake);
  const faith = BigInt(v.faith) + (onFaith ? add : 0n);
  const doubt = BigInt(v.doubt) + (onFaith ? 0n : add);
  return {
    put: f + d,
    kept: owed(STATE_KEPT, false, f, d, stake, faith, doubt),
    broken: owed(STATE_BROKEN, false, f, d, stake, faith, doubt),
    unclear: owed(STATE_UNCLEAR, false, f, d, stake, faith, doubt),
  };
}

// What a finished vow burns (the contract keeps it as embers).
export function burned(state: number, stake: bigint, faith: bigint, doubt: bigint): bigint {
  if (state === STATE_RETRACTED) return stake / BigInt(RETRACT_BURN_DIV);
  if (state !== STATE_BROKEN) return 0n;
  return doubt > 0n ? stake / 2n : stake + faith;
}

// ---- keeper standing, the same table as the contract's `_standing` -----------------------------------------

const meets = (t: Tier, kept: number, broken: number, keptStake: bigint) =>
  kept >= t.kept && keptStake >= t.keptStake && (t.brokenDiv === 0 || broken * t.brokenDiv <= kept);

export function standing(kept: number, broken: number, keptStake: bigint): string {
  for (const t of TIERS) if (meets(t, kept, broken, keptStake)) return t.name;
  return "Unlit";
}

// The next tier up and what is still missing for it, in words. null for the top tier.
export function nextStep(kept: number, broken: number, keptStake: bigint): { name: string; missing: string[] } | null {
  const current = TIERS.findIndex((t) => meets(t, kept, broken, keptStake));
  const target = current === -1 ? TIERS[TIERS.length - 1] : current === 0 ? null : TIERS[current - 1];
  if (!target) return null;
  const missing: string[] = [];
  if (kept < target.kept) missing.push(`${target.kept - kept} more kept vow${target.kept - kept > 1 ? "s" : ""}`);
  if (keptStake < target.keptStake) missing.push(`${(Number(target.keptStake - keptStake) / 1e18).toFixed(2).replace(/\.?0+$/, "")} more GEN staked on kept vows`);
  if (target.brokenDiv > 0 && broken * target.brokenDiv > kept) missing.push(`fewer than one broken vow per ${target.brokenDiv} kept`);
  return { name: target.name, missing };
}
