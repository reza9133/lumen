"""Regenerate frontend/scripts/payout-vectors.json from the contract's own payout function.

The vectors are what keeps frontend/src/payout.ts identical to `_owed` in contracts/lumen.py:
`npm run check:payout` replays them against the TypeScript code.

Run:  python3 tests/tools/gen_payout_vectors.py
"""

import json
import random
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
GEN = 10**18


def load_owed():
    src = (ROOT / "contracts" / "lumen.py").read_text()
    consts = src[src.index("OPEN, KEPT, BROKEN, UNCLEAR, REVIEW, RETRACTED"):src.index("_BLOCKED_TLDS")]
    consts = consts[: consts.index("# A public web address")] if "# A public web address" in consts else consts
    ns: dict = {}
    exec(consts, ns)
    exec(src[src.index("def _owed"):src.index("def _judge_once")], ns)
    return ns["_owed"], ns


def main() -> None:
    owed, ns = load_owed()
    states = [ns["KEPT"], ns["BROKEN"], ns["UNCLEAR"], ns["RETRACTED"]]
    rnd = random.Random(20261110)
    rows = []

    def add(state, keeper, f, d, stake, faith, doubt):
        rows.append([state, keeper, str(f), str(d), str(stake), str(faith), str(doubt), str(owed(state, keeper, f, d, stake, faith, doubt))])

    # Hand-picked corners first: no backing at all, a lone doubter, a lone faith backer, exact caps.
    for state in states:
        add(state, True, 0, 0, GEN, 0, 0)
        add(state, False, 0, 0, GEN, 0, 0)
    add(ns["RETRACTED"], True, 0, 0, 10**17, 0, 0)  # the minimum stake: a fifth is burned, the rest returned
    add(ns["RETRACTED"], True, 0, 0, 10**17 + 4, 0, 0)  # the stake does not divide by five
    add(ns["RETRACTED"], False, 5, 5, GEN, 0, 0)  # nobody else can hold a position on a retracted vow
    add(ns["BROKEN"], False, 0, GEN // 10, GEN, 0, GEN // 10)
    add(ns["KEPT"], False, GEN // 10, 0, GEN, GEN // 10, 0)

    # Random vows, every state, keeper and non-keeper positions that respect the pools.
    while len(rows) < 260:
        state = rnd.choice(states)
        stake = rnd.randint(10**17, 40 * GEN)
        faith = rnd.randint(0, stake // 2)
        doubt = rnd.randint(0, 20 * GEN)
        keeper = rnd.random() < 0.3
        if state == ns["RETRACTED"]:
            faith = doubt = 0
        f = 0 if keeper or faith == 0 else rnd.randint(0, faith)
        d = 0 if keeper or doubt == 0 else rnd.randint(0, doubt)
        add(state, keeper, f, d, stake, faith, doubt)

    out = ROOT / "frontend" / "scripts" / "payout-vectors.json"
    out.write_text(json.dumps(rows, indent=0) + "\n")
    by_state = {s: sum(1 for r in rows if r[0] == s) for s in states}
    print(f"wrote {len(rows)} vectors to {out.relative_to(ROOT)}  (by state: {by_state})")


if __name__ == "__main__":
    main()
