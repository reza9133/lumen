// Mirror of the contract's payout rules (`_owed` in contracts/lumen.py), used to preview what a
// backing would return. Amounts are wei as bigint; division floors, exactly like the contract.

export const STATE_KEPT = 1;
export const STATE_BROKEN = 2;
export const STATE_UNCLEAR = 3;

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
