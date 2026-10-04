"""Direct-mode tests for the Lumen contract.

Run:  pytest tests/direct -v   (Python 3.12, genlayer-test installed)
"""

import json
import time

from conftest import (
    CONTRACT, COUNTER_URL, GEN, PROOF_URL, back, hexof, judge, make_vow, mock_counter, mock_page, mock_verdict, pay,
    sender, warp_later,
)


def deploy(direct_deploy):
    return direct_deploy(CONTRACT)


# ---- making vows -----------------------------------------------------------

def test_make_vow_stores_a_clean_row(direct_vm, direct_deploy, direct_alice):
    c = deploy(direct_deploy)
    vid = make_vow(c, direct_vm, direct_alice, text="  Ship <b>the</b> release   this week  ")
    row = json.loads(c.get_vow(vid))
    assert row["state"] == 0
    assert "<" not in row["text"] and ">" not in row["text"]
    assert "  " not in row["text"]
    assert row["stake"] == str(GEN)


def test_make_vow_rejects_bad_input(direct_vm, direct_deploy, direct_alice):
    c = deploy(direct_deploy)
    soon = int(time.time()) + 3600
    pay(direct_vm, direct_alice, GEN)
    with direct_vm.expect_revert("too short"):
        c.make_vow("short", PROOF_URL, soon)
    for bad_url in (
        "ftp://nope",
        "https://localhost/x",
        "http://127.0.0.1/x",
        "https://example.com:8080/x",
        "https://user@example.com/x",
        "https://example.local/x",
        "https://example.com/a\nb",
    ):
        with direct_vm.expect_revert("single http(s) link"):
            c.make_vow("A perfectly long enough vow", bad_url, soon)
    with direct_vm.expect_revert("between one minute and one year"):
        c.make_vow("A perfectly long enough vow", PROOF_URL, int(time.time()) + 5)
    pay(direct_vm, direct_alice, GEN // 100)
    with direct_vm.expect_revert("minimum stake"):
        c.make_vow("A perfectly long enough vow", PROOF_URL, soon)


# ---- backing ---------------------------------------------------------------

def test_back_rules(direct_vm, direct_deploy, direct_alice, direct_bob):
    c = deploy(direct_deploy)
    vid = make_vow(c, direct_vm, direct_alice, stake=2 * GEN)

    pay(direct_vm, direct_alice, GEN)
    with direct_vm.expect_revert("cannot back their own"):
        c.back(vid, "faith")

    pay(direct_vm, direct_bob, GEN // 1000)
    with direct_vm.expect_revert("minimum backing"):
        c.back(vid, "faith")

    back(c, direct_vm, direct_bob, vid, "faith", GEN)
    pay(direct_vm, direct_bob, GEN)
    with direct_vm.expect_revert("already back"):
        c.back(vid, "doubt")
    direct_vm.value = 0

    row = json.loads(c.get_vow(vid))
    assert row["faith"] == str(GEN) and row["doubt"] == "0"


def test_faith_is_capped_at_half_the_stake(direct_vm, direct_deploy, direct_alice, direct_bob, direct_charlie):
    c = deploy(direct_deploy)
    vid = make_vow(c, direct_vm, direct_alice, stake=GEN)
    assert json.loads(c.get_vow(vid))["faith_cap"] == str(GEN // 2)

    pay(direct_vm, direct_bob, GEN // 2 + 1)
    with direct_vm.expect_revert("capped at half"):
        c.back(vid, "faith")

    back(c, direct_vm, direct_bob, vid, "faith", GEN // 2)  # exactly the cap is fine
    pay(direct_vm, direct_charlie, 10**16)
    with direct_vm.expect_revert("capped at half"):
        c.back(vid, "faith")

    # doubt has no cap
    back(c, direct_vm, direct_charlie, vid, "doubt", 20 * GEN)
    assert json.loads(c.get_vow(vid))["doubt"] == str(20 * GEN)


def test_keeper_cannot_profit_by_doubting_their_own_vow(direct_vm, direct_deploy, direct_alice, direct_bob, direct_charlie):
    """alice is the keeper, charlie is her second wallet, bob is the crowd."""
    c = deploy(direct_deploy)
    stake = GEN
    vid = make_vow(c, direct_vm, direct_alice, stake=stake)
    back(c, direct_vm, direct_bob, vid, "faith", stake // 2)  # the most the cap allows
    doubt = 10**16
    back(c, direct_vm, direct_charlie, vid, "doubt", doubt)

    judge(c, direct_vm, direct_alice, vid, "BROKEN")
    payout = int(json.loads(c.position_of(vid, hexof(direct_charlie)))["payout"])
    assert payout <= stake + doubt  # the keeper's total outlay: the attack never turns a profit


def test_no_backing_after_deadline(direct_vm, direct_deploy, direct_alice, direct_bob):
    c = deploy(direct_deploy)
    vid = make_vow(c, direct_vm, direct_alice, secs=120)
    warp_later(direct_vm, 300)
    pay(direct_vm, direct_bob, GEN)
    with direct_vm.expect_revert("no longer takes backing"):
        c.back(vid, "faith")


# ---- judging ---------------------------------------------------------------

def test_cannot_judge_before_deadline(direct_vm, direct_deploy, direct_alice):
    c = deploy(direct_deploy)
    vid = make_vow(c, direct_vm, direct_alice)
    direct_vm.sender = direct_alice
    with direct_vm.expect_revert("deadline has not passed"):
        c.judge(vid)


def test_kept_vow_pays_faith_and_keeper(direct_vm, direct_deploy, direct_alice, direct_bob, direct_charlie):
    c = deploy(direct_deploy)
    vid = make_vow(c, direct_vm, direct_alice, stake=2 * GEN)
    back(c, direct_vm, direct_bob, vid, "faith", GEN)
    back(c, direct_vm, direct_charlie, vid, "doubt", GEN)

    judge(c, direct_vm, direct_bob, vid, "FULFILLED")
    assert json.loads(c.get_vow(vid))["state"] == 1

    direct_vm.sender = direct_alice
    assert json.loads(c.position_of(vid, hexof(direct_alice)))["payout"] == str(2 * GEN)
    assert json.loads(c.position_of(vid, hexof(direct_bob)))["payout"] == str(2 * GEN)  # backing + doubt pool
    assert json.loads(c.position_of(vid, hexof(direct_charlie)))["payout"] == "0"

    rec = json.loads(c.record_of(hexof(direct_alice)))
    assert rec["kept"] == 1 and rec["streak"] == 1 and rec["best"] == 1
    assert rec["kept_stake"] == str(2 * GEN)


def test_keeper_takes_doubt_pool_when_nobody_backed(direct_vm, direct_deploy, direct_alice, direct_charlie):
    c = deploy(direct_deploy)
    vid = make_vow(c, direct_vm, direct_alice, stake=GEN)
    back(c, direct_vm, direct_charlie, vid, "doubt", GEN)
    judge(c, direct_vm, direct_charlie, vid, "FULFILLED")
    assert json.loads(c.position_of(vid, hexof(direct_alice)))["payout"] == str(2 * GEN)


def test_broken_vow_burns_half_and_pays_doubters(direct_vm, direct_deploy, direct_alice, direct_bob, direct_charlie):
    c = deploy(direct_deploy)
    vid = make_vow(c, direct_vm, direct_alice, stake=2 * GEN)
    back(c, direct_vm, direct_bob, vid, "faith", GEN)
    back(c, direct_vm, direct_charlie, vid, "doubt", GEN)

    judge(c, direct_vm, direct_charlie, vid, "BROKEN")
    assert json.loads(c.get_vow(vid))["state"] == 2
    assert json.loads(c.stats())["embers"] == str(GEN)  # half of the 2 GEN stake

    # doubter gets own backing + (1 GEN kept half of stake + 1 GEN faith pool)
    assert json.loads(c.position_of(vid, hexof(direct_charlie)))["payout"] == str(3 * GEN)
    assert json.loads(c.position_of(vid, hexof(direct_alice)))["payout"] == "0"
    assert json.loads(c.position_of(vid, hexof(direct_bob)))["payout"] == "0"

    rec = json.loads(c.record_of(hexof(direct_alice)))
    assert rec["broken"] == 1 and rec["streak"] == 0


def test_broken_without_doubters_burns_everything(direct_vm, direct_deploy, direct_alice, direct_bob):
    c = deploy(direct_deploy)
    vid = make_vow(c, direct_vm, direct_alice, stake=GEN)
    back(c, direct_vm, direct_bob, vid, "faith", GEN // 2)
    judge(c, direct_vm, direct_bob, vid, "BROKEN")
    assert json.loads(c.stats())["embers"] == str(GEN + GEN // 2)


def test_unclear_refunds_everyone(direct_vm, direct_deploy, direct_alice, direct_bob, direct_charlie):
    c = deploy(direct_deploy)
    vid = make_vow(c, direct_vm, direct_alice, stake=GEN)
    back(c, direct_vm, direct_bob, vid, "faith", GEN // 2)
    back(c, direct_vm, direct_charlie, vid, "doubt", GEN // 4)
    judge(c, direct_vm, direct_bob, vid, "UNCLEAR")
    assert json.loads(c.position_of(vid, hexof(direct_alice)))["payout"] == str(GEN)
    assert json.loads(c.position_of(vid, hexof(direct_bob)))["payout"] == str(GEN // 2)
    assert json.loads(c.position_of(vid, hexof(direct_charlie)))["payout"] == str(GEN // 4)


def test_unreadable_page_allows_retries_then_breaks(direct_vm, direct_deploy, direct_alice):
    c = deploy(direct_deploy)
    vid = make_vow(c, direct_vm, direct_alice, stake=GEN)
    mock_page(direct_vm, "Not found", status=404)
    mock_verdict(direct_vm, "FULFILLED")  # must be ignored: the page could not be read
    direct_vm.sender = direct_alice

    warp_later(direct_vm, 3600 + 120)
    c.judge(vid)
    row = json.loads(c.get_vow(vid))
    assert row["state"] == 0 and row["tries"] == 1

    with direct_vm.expect_revert("Wait an hour"):
        c.judge(vid)

    warp_later(direct_vm, 3600 + 120 + 1800)  # half an hour later is still too early
    with direct_vm.expect_revert("Wait an hour"):
        c.judge(vid)

    warp_later(direct_vm, 3600 + 120 + 3700)
    c.judge(vid)
    assert json.loads(c.get_vow(vid))["tries"] == 2

    warp_later(direct_vm, 3600 + 120 + 2 * 3700)
    c.judge(vid)
    row = json.loads(c.get_vow(vid))
    assert row["state"] == 2 and "unreadable" in row["note"]


def test_judged_vow_cannot_be_judged_again(direct_vm, direct_deploy, direct_alice):
    c = deploy(direct_deploy)
    vid = make_vow(c, direct_vm, direct_alice)
    judge(c, direct_vm, direct_alice, vid, "FULFILLED")
    with direct_vm.expect_revert("already been judged"):
        c.judge(vid)


# ---- claims ----------------------------------------------------------------

def test_claim_is_single_use(direct_vm, direct_deploy, direct_alice):
    c = deploy(direct_deploy)
    vid = make_vow(c, direct_vm, direct_alice, stake=GEN)
    judge(c, direct_vm, direct_alice, vid, "FULFILLED")
    direct_vm.sender = direct_alice
    c.claim(vid)
    with direct_vm.expect_revert("Already claimed"):
        c.claim(vid)


def test_claim_needs_a_position(direct_vm, direct_deploy, direct_alice, direct_bob):
    c = deploy(direct_deploy)
    vid = make_vow(c, direct_vm, direct_alice)
    judge(c, direct_vm, direct_alice, vid, "FULFILLED")
    direct_vm.sender = direct_bob
    with direct_vm.expect_revert("Nothing to claim"):
        c.claim(vid)


# ---- consensus -------------------------------------------------------------

def test_validators_agree_on_the_verdict_only(direct_vm, direct_deploy, direct_alice):
    c = deploy(direct_deploy)
    vid = make_vow(c, direct_vm, direct_alice)
    judge(c, direct_vm, direct_alice, vid, "FULFILLED")

    # same verdict, different wording: accepted
    mock_verdict(direct_vm, "FULFILLED", note="Completely different sentence.")
    assert direct_vm.run_validator() is True

    # a different verdict: rejected
    direct_vm.clear_mocks()
    mock_page(direct_vm, "y" * 400)
    mock_verdict(direct_vm, "BROKEN")
    assert direct_vm.run_validator() is False


def test_streak_resets_after_a_broken_vow(direct_vm, direct_deploy, direct_alice):
    c = deploy(direct_deploy)
    a = make_vow(c, direct_vm, direct_alice)
    b = make_vow(c, direct_vm, direct_alice)
    d = make_vow(c, direct_vm, direct_alice)
    judge(c, direct_vm, direct_alice, a, "FULFILLED")
    judge(c, direct_vm, direct_alice, b, "FULFILLED")
    judge(c, direct_vm, direct_alice, d, "BROKEN")
    rec = json.loads(c.record_of(hexof(direct_alice)))
    assert rec == {"kept": 2, "broken": 1, "streak": 0, "best": 2, "kept_stake": str(2 * GEN)}


# ---- reading ---------------------------------------------------------------

def test_list_vows_is_newest_first_and_bounded(direct_vm, direct_deploy, direct_alice):
    c = deploy(direct_deploy)
    ids = [make_vow(c, direct_vm, direct_alice) for _ in range(3)]
    assert [r["id"] for r in json.loads(c.list_vows(0, 2))] == [ids[2], ids[1]]
    assert [r["id"] for r in json.loads(c.list_vows(2, 2))] == [ids[0]]
    assert json.loads(c.list_vows(5, 2)) == []
    assert json.loads(c.list_vows(0, 0)) == []
    assert len(json.loads(c.list_vows(0, 100000))) == 3  # limit is clamped to one page


# ---- counter-evidence ------------------------------------------------------

def test_only_doubters_can_challenge_and_only_once(direct_vm, direct_deploy, direct_alice, direct_bob, direct_charlie):
    c = deploy(direct_deploy)
    vid = make_vow(c, direct_vm, direct_alice, stake=2 * GEN)
    back(c, direct_vm, direct_bob, vid, "faith", GEN // 2)
    back(c, direct_vm, direct_charlie, vid, "doubt", GEN // 10)

    for who in (direct_alice, direct_bob):
        sender(direct_vm, who)
        with direct_vm.expect_revert("Only doubters"):
            c.challenge(vid, COUNTER_URL)

    sender(direct_vm, direct_charlie)
    with direct_vm.expect_revert("single http(s) link"):
        c.challenge(vid, "http://127.0.0.1/x")
    with direct_vm.expect_revert("already part of the evidence"):
        c.challenge(vid, PROOF_URL)
    c.challenge(vid, COUNTER_URL)
    with direct_vm.expect_revert("already submitted"):
        c.challenge(vid, COUNTER_URL + "-2")

    assert json.loads(c.get_vow(vid))["counters"] == [COUNTER_URL]
    assert json.loads(c.position_of(vid, hexof(direct_charlie)))["challenged"] is True


def test_counter_slots_go_to_larger_doubters(direct_vm, direct_deploy, direct_alice, direct_accounts):
    c = deploy(direct_deploy)
    vid = make_vow(c, direct_vm, direct_alice, stake=2 * GEN)
    others = [a for a in direct_accounts if hexof(a) != hexof(direct_alice)][:5]
    stakes = [1, 2, 3, 4, 1]  # in 0.01 GEN; the last doubter is as small as the first
    for who, s in zip(others, stakes):
        back(c, direct_vm, who, vid, "doubt", s * 10**16)

    urls = [f"https://counter.example.net/{i}" for i in range(5)]
    for who, url in zip(others[:3], urls[:3]):
        sender(direct_vm, who)
        c.challenge(vid, url)

    sender(direct_vm, others[3])  # staked more than the weakest holder, takes its slot
    c.challenge(vid, urls[3])
    assert json.loads(c.get_vow(vid))["counters"] == [urls[3], urls[1], urls[2]]
    # the displaced doubter lost the slot, not the right to try again
    assert json.loads(c.position_of(vid, hexof(others[0])))["challenged"] is False

    sender(direct_vm, others[4])  # a dust-sized doubt cannot crowd anyone out
    with direct_vm.expect_revert("held by larger doubters"):
        c.challenge(vid, urls[4])


def test_counter_evidence_reaches_the_judges(direct_vm, direct_deploy, direct_alice, direct_charlie):
    c = deploy(direct_deploy)
    vid = make_vow(c, direct_vm, direct_alice, stake=GEN)
    back(c, direct_vm, direct_charlie, vid, "doubt", GEN // 10)
    sender(direct_vm, direct_charlie)
    c.challenge(vid, COUNTER_URL)

    mock_page(direct_vm, "x" * 400)
    mock_counter(direct_vm)
    # This mock only matches when the prompt carries the counter page.
    direct_vm.mock_llm(r'<counter n="1">', json.dumps(json.dumps({"verdict": "BROKEN", "note": "The archive contradicts the page."})))
    warp_later(direct_vm, 3600 + 120)
    sender(direct_vm, direct_alice)
    c.judge(vid)
    assert json.loads(c.get_vow(vid))["state"] == 2


def test_unreadable_counter_page_is_ignored(direct_vm, direct_deploy, direct_alice, direct_charlie):
    c = deploy(direct_deploy)
    vid = make_vow(c, direct_vm, direct_alice, stake=GEN)
    back(c, direct_vm, direct_charlie, vid, "doubt", GEN // 10)
    sender(direct_vm, direct_charlie)
    c.challenge(vid, COUNTER_URL)

    mock_counter(direct_vm, body="Not found", status=404)
    judge(c, direct_vm, direct_alice, vid, "FULFILLED")  # the keeper's page decides
    row = json.loads(c.get_vow(vid))
    assert row["state"] == 1 and row["tries"] == 0


# ---- early judging ---------------------------------------------------------

def test_early_judging_confirms_but_never_breaks(direct_vm, direct_deploy, direct_alice, direct_bob):
    c = deploy(direct_deploy)
    vid = make_vow(c, direct_vm, direct_alice, stake=GEN, secs=3600)
    back(c, direct_vm, direct_bob, vid, "faith", GEN // 2)

    sender(direct_vm, direct_alice)
    with direct_vm.expect_revert("halfway"):
        c.judge(vid)

    # Past halfway, but the page does not show the vow: nothing is decided.
    direct_vm.clear_mocks()
    mock_page(direct_vm, "A page about something else entirely, with plenty of text.")
    mock_verdict(direct_vm, "BROKEN")
    warp_later(direct_vm, 1900)
    sender(direct_vm, direct_alice)
    c.judge(vid)
    row = json.loads(c.get_vow(vid))
    assert row["state"] == 0 and row["tries"] == 0 and row["note"].startswith("Checked early")

    with direct_vm.expect_revert("fifteen minutes"):
        c.judge(vid)

    # Later the page shows it.
    direct_vm.clear_mocks()
    mock_page(direct_vm, "x" * 400)
    mock_verdict(direct_vm, "FULFILLED")
    warp_later(direct_vm, 1900 + 901)
    sender(direct_vm, direct_alice)
    c.judge(vid)
    assert json.loads(c.get_vow(vid))["state"] == 1
    assert json.loads(c.position_of(vid, hexof(direct_alice)))["payout"] == str(GEN)
    assert json.loads(c.position_of(vid, hexof(direct_bob)))["payout"] == str(GEN // 2)


def test_unreadable_page_does_not_count_during_early_checks(direct_vm, direct_deploy, direct_alice):
    c = deploy(direct_deploy)
    vid = make_vow(c, direct_vm, direct_alice, stake=GEN, secs=3600)
    mock_page(direct_vm, "Not found", status=404)
    mock_verdict(direct_vm, "FULFILLED")
    warp_later(direct_vm, 1900)
    sender(direct_vm, direct_alice)
    c.judge(vid)
    row = json.loads(c.get_vow(vid))
    assert row["state"] == 0 and row["tries"] == 0


def test_a_doubt_closes_the_early_door(direct_vm, direct_deploy, direct_alice, direct_charlie):
    c = deploy(direct_deploy)
    vid = make_vow(c, direct_vm, direct_alice, stake=GEN, secs=3600)
    back(c, direct_vm, direct_charlie, vid, "doubt", GEN // 100)
    warp_later(direct_vm, 2000)
    sender(direct_vm, direct_alice)
    with direct_vm.expect_revert("nobody doubts"):
        c.judge(vid)
    # After the deadline judging works as before.
    judge(c, direct_vm, direct_alice, vid, "FULFILLED")
    assert json.loads(c.get_vow(vid))["state"] == 1


def test_counter_evidence_closes_at_the_deadline(direct_vm, direct_deploy, direct_alice, direct_charlie):
    c = deploy(direct_deploy)
    vid = make_vow(c, direct_vm, direct_alice, stake=GEN)
    back(c, direct_vm, direct_charlie, vid, "doubt", GEN // 10)
    warp_later(direct_vm, 3600 + 120)
    sender(direct_vm, direct_charlie)
    with direct_vm.expect_revert("deadline has passed"):
        c.challenge(vid, COUNTER_URL)


# ---- release (the escape hatch) ----------------------------------------------

def test_release_refunds_a_vow_that_never_got_a_verdict(direct_vm, direct_deploy, direct_alice, direct_bob, direct_charlie):
    c = deploy(direct_deploy)
    vid = make_vow(c, direct_vm, direct_alice, stake=GEN)
    back(c, direct_vm, direct_bob, vid, "faith", GEN // 4)
    back(c, direct_vm, direct_charlie, vid, "doubt", GEN // 10)
    sender(direct_vm, direct_bob)

    warp_later(direct_vm, 3600 + 3 * 86400)
    with direct_vm.expect_revert("thirty days"):
        c.release(vid)

    warp_later(direct_vm, 3600 + 30 * 86400 + 60)
    c.release(vid)
    row = json.loads(c.get_vow(vid))
    assert row["state"] == 3 and "refunded" in row["note"]
    for who, want in ((direct_alice, GEN), (direct_bob, GEN // 4), (direct_charlie, GEN // 10)):
        assert json.loads(c.position_of(vid, hexof(who)))["payout"] == str(want)

    with direct_vm.expect_revert("already been judged"):
        c.release(vid)
    with direct_vm.expect_revert("already been judged"):
        c.judge(vid)


def test_a_judged_vow_cannot_be_released(direct_vm, direct_deploy, direct_alice):
    c = deploy(direct_deploy)
    vid = make_vow(c, direct_vm, direct_alice, stake=GEN)
    judge(c, direct_vm, direct_alice, vid, "FULFILLED")
    warp_later(direct_vm, 3600 + 31 * 86400)
    with direct_vm.expect_revert("already been judged"):
        c.release(vid)


def test_an_unusable_verdict_is_a_model_failure_not_a_ruling(direct_vm, direct_deploy, direct_alice):
    c = deploy(direct_deploy)
    vid = make_vow(c, direct_vm, direct_alice, stake=GEN)
    mock_page(direct_vm, "x" * 400)
    mock_verdict(direct_vm, "MAYBE")  # not one of FULFILLED / BROKEN / UNCLEAR
    warp_later(direct_vm, 3600 + 120)
    sender(direct_vm, direct_alice)
    with direct_vm.expect_revert("LLM_ERROR"):
        c.judge(vid)
    # Nothing was decided: the vow is still open, so a new leader can try again.
    row = json.loads(c.get_vow(vid))
    assert row["state"] == 0 and row["tries"] == 0


def test_a_terse_page_is_judged_only_on_the_last_attempt(direct_vm, direct_deploy, direct_alice):
    c = deploy(direct_deploy)
    vid = make_vow(c, direct_vm, direct_alice, stake=GEN)
    mock_page(direct_vm, "<p>Done.</p>")  # readable, but shorter than MIN_PAGE
    mock_verdict(direct_vm, "FULFILLED")
    direct_vm.sender = direct_alice

    warp_later(direct_vm, 3600 + 120)
    c.judge(vid)
    assert json.loads(c.get_vow(vid))["tries"] == 1

    warp_later(direct_vm, 3600 + 120 + 3700)
    c.judge(vid)
    row = json.loads(c.get_vow(vid))
    assert row["state"] == 0 and row["tries"] == 2

    warp_later(direct_vm, 3600 + 120 + 2 * 3700)
    c.judge(vid)
    row = json.loads(c.get_vow(vid))
    assert row["state"] == 1 and row["tries"] == 2
