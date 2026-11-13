// The limits the contract enforces, in one place. `tests/direct/test_frontend_parity.py` compares every value
// here with what the contract reports from `params()`, so a change in the contract that is not copied here
// fails the test suite instead of showing up as a refused transaction.

export const MIN_STAKE = 10n ** 17n; // 0.1 GEN
export const MIN_BACK = 10n ** 16n; // 0.01 GEN
export const MAX_TEXT = 280;
export const MIN_TEXT = 8;
export const MAX_URL = 300;
export const MIN_WINDOW = 60;
export const MAX_WINDOW = 366 * 86400;
export const PAGE_MAX = 60; // vows per list call
export const FAITH_CAP_DIV = 2; // total faith on a vow may not exceed stake / 2
export const MAX_COUNTERS = 3;
export const MAX_PINS = 2;
export const MAX_DISPUTES = 3;
export const MAX_UPDATES = 5;
export const MAX_UPDATE = 200;
export const MIN_UPDATE = 4;
export const EARLY_GAP = 900;
export const RETRY_GAP = 3600;
export const MAX_TRIES = 3;
export const RELEASE_AFTER = 30 * 86400;
export const REVIEW_DIV = 8;
export const REVIEW_MIN = 600;
export const REVIEW_MAX = 2 * 86400;
export const RETRACT_BURN_DIV = 5; // a retraction burns a fifth of the stake
export const FEED_MAX = 100;
export const KEEPERS_MAX = 100;

export type Tier = { name: string; kept: number; keptStake: bigint; brokenDiv: number };
// Highest first. A keeper holds the first tier whose three conditions are all met.
export const TIERS: readonly Tier[] = [
  { name: "Constellation", kept: 15, keptStake: 20n * 10n ** 18n, brokenDiv: 10 },
  { name: "Beacon", kept: 7, keptStake: 5n * 10n ** 18n, brokenDiv: 4 },
  { name: "Flame", kept: 3, keptStake: 10n ** 18n, brokenDiv: 0 },
  { name: "Spark", kept: 1, keptStake: 0n, brokenDiv: 0 },
];

// Vow states, as the contract numbers them.
export const OPEN = 0;
export const KEPT = 1;
export const BROKEN = 2;
export const UNCLEAR = 3;
export const REVIEW = 4;
export const RETRACTED = 5;
