"""Pure payout-math tests. They need no VM: the payout helpers are loaded straight from the contract source.

Run:  pytest tests/direct/test_economics.py -v
"""

import random
from pathlib import Path

GEN = 10**18
OPEN, KEPT, BROKEN, UNCLEAR = 0, 1, 2, 3


def load_helpers():
    src = (Path(__file__).resolve().parents[2] / "contracts" / "lumen.py").read_text()
    start, end = src.index("def _owed"), src.index("def _adjudicate")
    ns = {"OPEN": OPEN, "KEPT": KEPT, "BROKEN": BROKEN, "UNCLEAR": UNCLEAR}
    exec(src[start:end], ns)
    return ns["_owed"], ns["_burned"]


def test_payouts_never_exceed_the_pool_and_dust_is_tiny():
    owed, burned = load_helpers()
    rnd = random.Random(2024)
    worst_dust = 0
    for _ in range(20000):
        stake = rnd.randint(10**17, 50 * GEN)
        faiths = [rnd.randint(10**16, 10 * GEN) for _ in range(rnd.randint(0, 4))]
        doubts = [rnd.randint(10**16, 10 * GEN) for _ in range(rnd.randint(0, 4))]
        faith, doubt = sum(faiths), sum(doubts)
        total = stake + faith + doubt
        for state in (KEPT, BROKEN, UNCLEAR):
            paid = owed(state, True, 0, 0, stake, faith, doubt)
            paid += sum(owed(state, False, f, 0, stake, faith, doubt) for f in faiths)
            paid += sum(owed(state, False, 0, d, stake, faith, doubt) for d in doubts)
            left = total - paid - burned(state, stake, faith, doubt)
            assert left >= 0
            worst_dust = max(worst_dust, left)
    assert worst_dust <= 8  # at most one wei per claimant


def test_a_keeper_who_doubts_their_own_vow_never_profits_under_the_cap():
    owed, _ = load_helpers()
    minimum_back = 10**16
    for stake in (10**17, GEN, 3 * GEN + 7, 50 * GEN + 1):
        for faith in (0, minimum_back, stake // 4, stake // 2):  # the cap is stake // 2
            payout = owed(BROKEN, False, 0, minimum_back, stake, faith, minimum_back)
            assert payout - stake - minimum_back <= 0


def test_without_the_cap_the_same_attack_would_pay():
    """Documents why the cap exists: with faith above stake // 2 the attack turns a profit."""
    owed, _ = load_helpers()
    stake, faith, doubt = GEN, 5 * GEN, 10**16
    payout = owed(BROKEN, False, 0, doubt, stake, faith, doubt)
    assert payout - stake - doubt > 0
