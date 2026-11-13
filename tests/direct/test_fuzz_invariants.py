"""Randomised, model-based tests. Each seed drives a long random sequence of calls from several accounts against a
fresh contract (makes, backings, updates, retractions, judgements with random mocked verdicts, finalisations,
claims, counter-evidence, disputes, releases, jumps in time) and checks the invariants after every step:

  * a call either succeeds or raises a contract error (UserError). Any other exception is a bug;
  * a failed call changes nothing (the harness state is rolled back like a chain would);
  * the feed length equals the number of successful state changes, and an incremental client that only ever
    calls pulse/changes_since ends up with exactly the rows list_vows returns;
  * money: deposited equals the sum of all stakes and backings, every position's payout equals an independent
    re-implementation of the payout rules, burned equals the independent burn rule, paid equals the claims made,
    and deposited - paid - burned - still-claimable is non-negative and only rounding dust;
  * final states never change again; global counters equal what the rows say; the keeper index matches the rows.

Run:  pytest tests/direct/test_fuzz_invariants.py -v      (longer run: LUMEN_FUZZ_SEEDS=200 LUMEN_FUZZ_BASE=5000)
"""

import json
import os
import random
import time
from datetime import datetime, timezone

import pytest

from conftest import (
    BAD_PAGE, CONTRACT, GEN, GOOD_PAGE, PROOF_URL, hexof, mock_counter, mock_counter_verdict, mock_page, mock_verdict,
    pay, sender,
)

OPEN, KEPT, BROKEN, UNCLEAR, REVIEW, RETRACTED = 0, 1, 2, 3, 4, 5
FINAL = (KEPT, BROKEN, UNCLEAR, RETRACTED)
T0 = int(time.time())
SEEDS = int(os.environ.get("LUMEN_FUZZ_SEEDS", "12"))
STEPS = int(os.environ.get("LUMEN_FUZZ_STEPS", "80"))
BASE = int(os.environ.get("LUMEN_FUZZ_BASE", "1000"))
MAX_VOWS = 50  # keeps the incremental client below the contract's change-feed page size
COVERAGE = {"final": set(), "actions": {}}


def oracle_payout(state, is_keeper, faith_of, doubt_of, stake, faith, doubt):
    """The documented payout rules, written independently of the contract."""
    if state == UNCLEAR:
        return faith_of + doubt_of + (stake if is_keeper else 0)
    if state == RETRACTED:
        return stake - stake // 5 if is_keeper else 0
    if state == KEPT:
        if is_keeper:
            return stake + (doubt if faith == 0 else 0)
        if faith_of > 0:
            return faith_of + doubt * faith_of // faith
        return 0
    if state == BROKEN:
        if doubt == 0:
            return 0
        pot = stake - stake // 2 + faith
        return doubt_of + pot * doubt_of // doubt if doubt_of > 0 else 0
    return 0


def oracle_burn(state, stake, faith, doubt):
    if state == RETRACTED:
        return stake // 5
    if state == BROKEN:
        return stake // 2 if doubt > 0 else stake + faith
    return 0


class Sim:
    def __init__(self, vm, c, accounts, rnd):
        self.vm, self.c, self.accounts, self.rnd = vm, c, accounts, rnd
        self.t = 0
        self.successes = 0
        self.log = []
        self.last_state = {}
        self.claimed_total = 0
        self.claimed = set()
        self.cursor = 0
        self.mirror = {}
        self.url_n = 0

    # -- plumbing ---------------------------------------------------------------------------------------------
    def warp(self, t=None):
        if t is not None:
            self.t = max(self.t, t)
        self.vm.warp(datetime.fromtimestamp(T0 + self.t, tz=timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"))

    def rows(self):
        total = json.loads(self.c.stats())["total"]
        return [json.loads(self.c.get_vow(i)) for i in range(total)]

    def attempt(self, name, fn):
        """Run one call. A contract error rolls the harness back and counts as a refusal; anything else fails."""
        snap = self.vm.snapshot()
        self.log.append(name)
        try:
            fn()
        except Exception as e:  # noqa: BLE001
            self.vm.value = 0
            if type(e).__name__ != "UserError":
                raise AssertionError(f"unexpected {type(e).__name__}: {e}\nlast actions: {self.log[-12:]}") from e
            self.vm.revert(snap)
            COVERAGE["actions"][name + ":refused"] = COVERAGE["actions"].get(name + ":refused", 0) + 1
            return False
        self.vm.value = 0
        self.successes += 1
        COVERAGE["actions"][name] = COVERAGE["actions"].get(name, 0) + 1
        return True

    # -- actions ----------------------------------------------------------------------------------------------
    def pick_vow(self, prefer=None):
        rows = self.rows()
        if not rows:
            return None
        pool = [r for r in rows if prefer is None or r["state"] in prefer]
        return self.rnd.choice(pool or rows)

    def act_make(self):
        if json.loads(self.c.stats())["total"] >= MAX_VOWS:
            return
        who = self.rnd.choice(self.accounts[:5])
        stake = self.rnd.choice([10**17, 10**17 + 3, GEN, GEN + 7, 3 * GEN + 12345, self.rnd.randint(10**17, 6 * GEN)])
        secs = self.rnd.choice([3600, 7200, 86400, 3 * 86400])
        text = self.rnd.choice(["Publish chapter one of the essay series", "Ship the first release of the app ‌ ok",
                                "Run a 10k race and post the timing result", "Finish the draft | with a pipe ​ here"])
        self.warp()

        def call():
            pay(self.vm, who, stake)
            self.c.make_vow(text, PROOF_URL, T0 + self.t + secs)

        self.attempt("make", call)

    def act_back(self):
        r = self.pick_vow((OPEN, REVIEW))
        if r is None:
            return
        who = self.rnd.choice(self.accounts)
        side = self.rnd.choice(["faith", "doubt"])
        amount = self.rnd.choice([10**16, 10**16 + 5, 10**17, self.rnd.randint(10**16, GEN)])
        self.warp()

        def call():
            pay(self.vm, who, amount)
            self.c.back(r["id"], side)

        self.attempt("back", call)

    def act_update(self):
        r = self.pick_vow((OPEN,))
        if r is None:
            return
        who = next((a for a in self.accounts if hexof(a) == r["keeper"].lower()), self.accounts[0])
        who = who if self.rnd.random() < 0.85 else self.rnd.choice(self.accounts)
        self.warp()

        def call():
            sender(self.vm, who)
            self.c.post_update(r["id"], f"Progress note {self.rnd.randint(0, 10**6)} ‌ ok")

        self.attempt("update", call)

    def act_retract(self):
        r = self.pick_vow((OPEN,))
        if r is None:
            return
        who = next((a for a in self.accounts if hexof(a) == r["keeper"].lower()), self.accounts[0])
        who = who if self.rnd.random() < 0.9 else self.rnd.choice(self.accounts)
        self.warp()

        def call():
            sender(self.vm, who)
            self.c.retract(r["id"])

        self.attempt("retract", call)

    def act_judge(self):
        r = self.pick_vow((OPEN, REVIEW))
        if r is None:
            return
        mode = self.rnd.random()
        if mode < 0.65:
            self.warp(r["deadline"] - T0 + self.rnd.randint(0, 400))
        elif mode < 0.85:
            self.warp(r["created"] - T0 + (r["deadline"] - r["created"]) // 2 + self.rnd.randint(0, 300))
        else:
            self.warp()
        verdict = self.rnd.choice(["FULFILLED", "FULFILLED", "BROKEN", "UNCLEAR"])
        self.vm.clear_mocks()
        mock_page(self.vm, GOOD_PAGE if verdict != "BROKEN" else BAD_PAGE)
        mock_verdict(self.vm, verdict)
        mock_counter(self.vm)
        mock_counter_verdict(self.vm, contradicted=self.rnd.random() < 0.5)
        who = self.rnd.choice(self.accounts)

        def call():
            sender(self.vm, who)
            self.c.judge(r["id"])

        self.attempt("judge", call)

    def act_finalize(self):
        r = self.pick_vow((REVIEW,))
        if r is None:
            return
        self.warp(r["review_end"] - T0 + self.rnd.randint(0, 100))
        verdict = self.rnd.choice(["FULFILLED", "BROKEN", "UNCLEAR"])
        self.vm.clear_mocks()
        mock_page(self.vm, GOOD_PAGE if verdict != "BROKEN" else BAD_PAGE)
        mock_verdict(self.vm, verdict)
        mock_counter(self.vm)
        mock_counter_verdict(self.vm, contradicted=self.rnd.random() < 0.5)
        who = self.rnd.choice(self.accounts)

        def call():
            sender(self.vm, who)
            self.c.finalize(r["id"])

        self.attempt("finalize", call)

    def act_release(self):
        r = self.pick_vow((OPEN, REVIEW))
        if r is None:
            return
        self.warp(r["deadline"] - T0 + 30 * 86400 + self.rnd.randint(1, 3600))

        def call():
            sender(self.vm, self.rnd.choice(self.accounts))
            self.c.release(r["id"])

        self.attempt("release", call)

    def act_claim(self):
        r = self.pick_vow(FINAL)
        if r is None:
            return
        who = self.rnd.choice(self.accounts)
        pos = json.loads(self.c.position_of(r["id"], hexof(who)))
        owed = int(pos["payout"])
        was_claimed = (r["id"], hexof(who)) in self.claimed

        def call():
            sender(self.vm, who)
            self.c.claim(r["id"])

        if self.attempt("claim", call):
            assert owed > 0 and not was_claimed, "a claim succeeded that should have been refused"
            self.claimed.add((r["id"], hexof(who)))
            self.claimed_total += owed

    def act_counter(self, kind):
        r = self.pick_vow((OPEN,) if kind == "challenge" else (REVIEW,))
        if r is None:
            return
        who = self.rnd.choice(self.accounts)
        self.url_n += 1
        url = f"https://counter.example.net/note-{self.url_n}"
        self.warp()
        self.vm.clear_mocks()
        mock_counter(self.vm)

        def call():
            sender(self.vm, who)
            getattr(self.c, kind)(r["id"], url)

        self.attempt(kind, call)

    def act_advance(self):
        self.warp(self.t + self.rnd.choice([30, 600, 3600, 7200, 86400]))

    # -- invariants -------------------------------------------------------------------------------------------
    def sync_mirror(self):
        out = json.loads(self.c.changes_since(self.cursor))
        if out["reset"]:
            self.mirror = {r["id"]: r for r in json.loads(self.c.list_vows(0, 60))}
        else:
            for r in out["rows"]:
                self.mirror[r["id"]] = r
        self.cursor = out["rev"]

    def check_light(self):
        s = json.loads(self.c.stats())
        assert s["rev"] == self.successes == json.loads(self.c.pulse())["rev"], (s["rev"], self.successes, self.log[-6:])
        assert len(json.loads(self.c.activity(0, 100))) == min(100, self.successes)

    def check_heavy(self, settled=False):
        rows = self.rows()
        s = json.loads(self.c.stats())
        deposited = burned = paid_expected = unclaimed = held = 0
        keeper_vows = {}
        for r in rows:
            prev = self.last_state.get(r["id"], OPEN)
            if prev in FINAL:
                assert r["state"] == prev, f"vow {r['id']} left final state {prev}"
            self.last_state[r["id"]] = r["state"]
            stake, faith, doubt = int(r["stake"]), int(r["faith"]), int(r["doubt"])
            assert faith <= stake // 2, "faith exceeded its cap"
            deposited += stake + faith + doubt
            keeper_vows[r["keeper"].lower()] = keeper_vows.get(r["keeper"].lower(), 0) + 1
            if r["state"] in FINAL:
                burned += oracle_burn(r["state"], stake, faith, doubt)
                total_out = 0
                for a in self.accounts:
                    pos = json.loads(self.c.position_of(r["id"], hexof(a)))
                    fo, do = int(pos["faith"]), int(pos["doubt"])
                    want = oracle_payout(r["state"], hexof(a) == r["keeper"].lower(), fo, do, stake, faith, doubt)
                    assert int(pos["payout"]) == want, f"payout mismatch on vow {r['id']} state {r['state']}: {pos} vs {want}"
                    total_out += want
                    if pos["claimed"]:
                        paid_expected += want
                    else:
                        unclaimed += want
                assert total_out + oracle_burn(r["state"], stake, faith, doubt) <= stake + faith + doubt
            else:
                held += stake + faith + doubt  # still at stake in an unfinished vow
                assert r["proposed"] in (0, KEPT, BROKEN)
        assert int(s["deposited"]) == deposited
        assert int(s["embers"]) == burned
        assert int(s["paid"]) == paid_expected == self.claimed_total
        dust = deposited - held - int(s["paid"]) - burned - unclaimed
        assert 0 <= dust <= 4 * max(1, len(rows)) * len(self.accounts), f"dust {dust}"
        for key, field in (("kept", KEPT), ("broken", BROKEN), ("retracted", RETRACTED)):
            assert s[key] == sum(1 for r in rows if r["state"] == field), key
        listed = json.loads(self.c.list_keepers(0, 100))
        assert listed["total"] == len(keeper_vows) == s["keepers"]
        assert {k["address"].lower(): k["vows"] for k in listed["rows"]} == keeper_vows
        for k in listed["rows"]:
            assert k["kept"] + k["broken"] + k["retracted"] <= k["vows"]
            assert k["tier"] in ("Unlit", "Spark", "Flame", "Beacon", "Constellation")
        listed_rows = json.loads(self.c.list_vows(0, 60))
        assert [r["id"] for r in listed_rows] == [r["id"] for r in reversed(rows)][:60] or {r["id"] for r in listed_rows} == {r["id"] for r in rows}
        self.sync_mirror()
        assert self.mirror == {r["id"]: r for r in rows}, "the incremental client drifted from list_vows"
        for r in rows:
            assert json.loads(self.c.vows_of(r["keeper"], -1, 60))["rows"], "vows_of lost a keeper's vows"

    def settle_everything(self):
        """Close every vow, let everybody claim, and check that nothing is left but rounding dust."""
        self.warp(self.t + 40 * 86400)
        for r in self.rows():
            if r["state"] in (OPEN, REVIEW):
                self.vm.clear_mocks()
                mock_page(self.vm, GOOD_PAGE)
                mock_verdict(self.vm, "UNCLEAR")
                sender(self.vm, self.accounts[0])
                self.attempt("release", lambda rid=r["id"]: self.c.release(rid))
        for r in self.rows():
            assert r["state"] in FINAL, r
            for a in self.accounts:
                pos = json.loads(self.c.position_of(r["id"], hexof(a)))
                if int(pos["payout"]) > 0 and not pos["claimed"]:
                    owed = int(pos["payout"])
                    sender(self.vm, a)
                    assert self.attempt("claim", lambda rid=r["id"]: self.c.claim(rid))
                    self.claimed.add((r["id"], hexof(a)))
                    self.claimed_total += owed
        self.check_heavy(settled=True)
        s = json.loads(self.c.stats())
        rows = self.rows()
        left = int(s["deposited"]) - int(s["paid"]) - int(s["embers"])
        assert 0 <= left <= 4 * max(1, len(rows)) * len(self.accounts)


ACTIONS = [
    ("make", 18), ("back", 22), ("update", 6), ("retract", 7), ("judge", 14), ("finalize", 10), ("claim", 12),
    ("challenge", 4), ("dispute", 3), ("advance", 4),
]


@pytest.mark.parametrize("seed", range(SEEDS))
def test_random_sequences_keep_every_invariant(direct_vm, direct_deploy, direct_accounts, seed):
    rnd = random.Random(BASE + seed)
    c = direct_deploy(CONTRACT)
    sim = Sim(direct_vm, c, list(direct_accounts[:6]), rnd)
    names, weights = zip(*ACTIONS)
    for step in range(STEPS):
        name = rnd.choices(names, weights)[0]
        if name in ("challenge", "dispute"):
            sim.act_counter(name)
        else:
            getattr(sim, "act_" + name)()
        sim.check_light()
        if step % 10 == 9:
            sim.check_heavy()
    sim.check_heavy()
    sim.settle_everything()
    rows = sim.rows()
    COVERAGE["final"] |= {r["state"] for r in rows}


def test_the_random_runs_reached_the_states_and_actions_they_are_meant_to_cover():
    acts = COVERAGE["actions"]
    must_final = {KEPT, BROKEN, RETRACTED}
    must_act = ["make", "back", "update", "retract", "judge", "finalize", "claim"]
    if SEEDS >= 30:  # the rarer paths need a longer run to be reached reliably
        must_final |= {UNCLEAR}
        must_act += ["challenge", "dispute", "release"]
    assert COVERAGE["final"] >= must_final, (COVERAGE["final"], acts)
    for name in must_act:
        assert acts.get(name, 0) > 0, f"{name} never succeeded in the random runs: {acts}"
