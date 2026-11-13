// An independent statement of Lumen's money rules, written from the documentation and not from the contract code.
// The live run compares what the chain pays with what these functions say it should pay.
export const STATE = { OPEN: 0, KEPT: 1, BROKEN: 2, UNCLEAR: 3, REVIEW: 4, RETRACTED: 5 };
export const STATE_NAME = ["OPEN", "KEPT", "BROKEN", "UNCLEAR", "REVIEW", "RETRACTED"];
export const TIERS = [
  { name: "Constellation", kept: 15, keptStake: 20n * 10n ** 18n, brokenDiv: 10 },
  { name: "Beacon", kept: 7, keptStake: 5n * 10n ** 18n, brokenDiv: 4 },
  { name: "Flame", kept: 3, keptStake: 10n ** 18n, brokenDiv: 0 },
  { name: "Spark", kept: 1, keptStake: 0n, brokenDiv: 0 },
];

/** What one address may withdraw from a finished vow. All amounts are BigInt wei. */
export function owed({ state, isKeeper, faithOf = 0n, doubtOf = 0n, stake, faith, doubt }) {
  switch (state) {
    case STATE.UNCLEAR:
      return faithOf + doubtOf + (isKeeper ? stake : 0n);
    case STATE.RETRACTED:
      return isKeeper ? stake - stake / 5n : 0n;
    case STATE.KEPT:
      if (isKeeper) return stake + (faith === 0n ? doubt : 0n);
      return faithOf > 0n ? faithOf + (doubt * faithOf) / faith : 0n;
    case STATE.BROKEN: {
      if (doubt === 0n || doubtOf === 0n) return 0n;
      const pot = stake - stake / 2n + faith;
      return doubtOf + (pot * doubtOf) / doubt;
    }
    default:
      return 0n;
  }
}

/** What a finished vow burns (the contract keeps it as embers). */
export function burned({ state, stake, faith, doubt }) {
  if (state === STATE.RETRACTED) return stake / 5n;
  if (state !== STATE.BROKEN) return 0n;
  return doubt > 0n ? stake / 2n : stake + faith;
}

/** The standing a keeper's record earns. */
export function standing(kept, broken, keptStake) {
  for (const t of TIERS) {
    if (kept >= t.kept && keptStake >= t.keptStake && (t.brokenDiv === 0 || broken * t.brokenDiv <= kept)) return t.name;
  }
  return "Unlit";
}

const PERMALINK = new RegExp(
  "^https?://(?:www\\.)?(?:github\\.com|gitlab\\.com|codeberg\\.org)/[^/\\s]+/[^/\\s]+/(?:-/)?(?:commit/[0-9a-f]{40}|blob/[0-9a-f]{40}/\\S+)(?:[?#]\\S*)?$" +
    "|^https?://[^/\\s]+/ipfs/(?:Qm[1-9A-HJ-NP-Za-km-z]{44}|bafy[a-z2-7]{50,})(?:[/?#]\\S*)?$",
);
const SNAPSHOT = /^https?:\/\/web\.archive\.org\/web\/(\d{14})(?:[a-z]{2}_)?\/https?:\/\/\S+$/;

/** How hard a page is to rewrite, by the shape of its address. */
export function provenance(url) {
  if (SNAPSHOT.test(url)) return "snapshot";
  if (PERMALINK.test(url)) return "permalink";
  return "mutable";
}

/** The wei amount of a decimal GEN string such as "0.25" (no floating point). */
export function gen(text) {
  const m = /^(\d+)(?:\.(\d{1,18}))?$/.exec(String(text).trim());
  if (!m) throw new Error(`Not an amount of GEN: ${text}`);
  return BigInt(m[1]) * 10n ** 18n + BigInt((m[2] ?? "").padEnd(18, "0") || "0");
}

/** A wei amount as text, "1.25 GEN". */
export function fmt(w) {
  w = BigInt(w);
  const neg = w < 0n;
  const s = (neg ? -w : w).toString().padStart(19, "0");
  const frac = s.slice(-18).replace(/0+$/, "");
  return `${neg ? "-" : ""}${s.slice(0, -18)}${frac ? "." + frac : ""} GEN`;
}
