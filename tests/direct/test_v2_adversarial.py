"""Adversarial tests for the v2 surface: retract races and abuse, update injection, feed and cursor abuse, and
hostile arguments to the new views.

Run:  pytest tests/direct/test_v2_adversarial.py -v
"""

import json
import time

import pytest

from conftest import (
    BAD_PAGE, CONTRACT, GEN, GOOD_PAGE, PROOF_URL, back, hexof, judge, make_vow, mock_page, mock_verdict, pay,
    propose, sender, settle, warp_later,
)

OPEN, KEPT, BROKEN, UNCLEAR, REVIEW, RETRACTED = 0, 1, 2, 3, 4, 5


def deploy(direct_deploy):
    return direct_deploy(CONTRACT)


def row(c, vid):
    return json.loads(c.get_vow(vid))


def stats(c):
    return json.loads(c.stats())


def payout(c, vid, who):
    return int(json.loads(c.position_of(vid, hexof(who)))["payout"])


# ---- retract: money -----------------------------------------------------------------------------------------

@pytest.mark.parametrize("stake", [10**17, 10**17 + 3, 10**17 + 4, GEN - 1, 7 * GEN + 11, 123456789012345678901])
def test_a_retraction_never_creates_or_loses_a_wei(direct_vm, direct_deploy, direct_alice, stake):
    c = deploy(direct_deploy)
    vid = make_vow(c, direct_vm, direct_alice, stake=stake)
    sender(direct_vm, direct_alice)
    c.retract(vid)
    owed = payout(c, vid, direct_alice)
    burned = int(stats(c)["embers"])
    assert owed + burned == stake and burned == stake // 5
    c.claim(vid)
    s = stats(c)
    assert int(s["deposited"]) == stake and int(s["paid"]) == owed
    assert int(s["deposited"]) - int(s["paid"]) == burned  # nothing else is left behind


def test_a_retraction_cannot_be_used_to_dodge_a_verdict_somebody_bet_on(direct_vm, direct_deploy, direct_alice, direct_bob):
    """The keeper sees a doubter's transaction coming and retracts first: the doubt then reverts and the doubter
    keeps every wei. The reverse order makes the retraction revert. There is no order in which the keeper escapes
    a vow somebody bet against."""
    c = deploy(direct_deploy)
    vid = make_vow(c, direct_vm, direct_alice)
    sender(direct_vm, direct_alice)
    c.retract(vid)
    pay(direct_vm, direct_bob, GEN)
    with direct_vm.expect_revert("no longer takes backing"):
        c.back(vid, "doubt")
    direct_vm.value = 0
    assert stats(c)["deposited"] == str(GEN)  # only the keeper's stake is in the contract

    vid2 = make_vow(c, direct_vm, direct_alice)
    back(c, direct_vm, direct_bob, vid2, "doubt", 10**16)
    sender(direct_vm, direct_alice)
    with direct_vm.expect_revert("has backing"):
        c.retract(vid2)


def test_retracting_does_not_hide_a_broken_vow_from_the_record(direct_vm, direct_deploy, direct_alice):
    """Retracting costs a fifth of the stake and shows up in the profile, so it is never a free way to avoid a
    BROKEN mark."""
    c = deploy(direct_deploy)
    for _ in range(3):
        make_vow(c, direct_vm, direct_alice)
        sender(direct_vm, direct_alice)
        c.retract(stats(c)["total"] - 1)
    p = json.loads(c.profile_of(hexof(direct_alice)))
    assert p["retracted"] == 3 and p["vows"] == 3 and p["broken"] == 0 and p["kept"] == 0
    assert int(stats(c)["embers"]) == 3 * (GEN // 5)


def test_a_retracted_keeper_can_still_make_and_keep_a_new_vow(direct_vm, direct_deploy, direct_alice):
    c = deploy(direct_deploy)
    a = make_vow(c, direct_vm, direct_alice)
    sender(direct_vm, direct_alice)
    c.retract(a)
    b = make_vow(c, direct_vm, direct_alice)
    judge(c, direct_vm, direct_alice, b, "FULFILLED")
    p = json.loads(c.profile_of(hexof(direct_alice)))
    assert p["vows"] == 2 and p["kept"] == 1 and p["retracted"] == 1 and p["streak"] == 1
    assert json.loads(c.stats())["keepers"] == 1  # still one keeper in the directory


def test_retract_after_an_early_check_is_allowed_and_leaves_no_residue(direct_vm, direct_deploy, direct_alice):
    c = deploy(direct_deploy)
    vid = make_vow(c, direct_vm, direct_alice, secs=7200)
    direct_vm.clear_mocks()
    mock_page(direct_vm, BAD_PAGE)
    mock_verdict(direct_vm, "BROKEN")
    warp_later(direct_vm, 3700)
    sender(direct_vm, direct_alice)
    c.judge(vid)  # an early check that finds nothing
    c.retract(vid)
    assert row(c, vid)["state"] == RETRACTED


def test_retract_works_on_the_last_second_before_the_deadline_only(direct_vm, direct_deploy, direct_alice):
    c = deploy(direct_deploy)
    vid = make_vow(c, direct_vm, direct_alice)
    deadline = row(c, vid)["deadline"]
    from datetime import datetime, timezone
    direct_vm.warp(datetime.fromtimestamp(deadline - 1, tz=timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"))
    sender(direct_vm, direct_alice)
    c.retract(vid)  # one second to spare
    other = make_vow(c, direct_vm, direct_alice)
    deadline = row(c, other)["deadline"]
    direct_vm.warp(datetime.fromtimestamp(deadline, tz=timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"))
    sender(direct_vm, direct_alice)
    with direct_vm.expect_revert("deadline has passed"):
        c.retract(other)  # at the deadline it is too late


# ---- updates: injection and abuse ------------------------------------------------------------------------------

def test_hostile_update_text_cannot_forge_extra_updates_or_lines(direct_vm, direct_deploy, direct_alice):
    c = deploy(direct_deploy)
    vid = make_vow(c, direct_vm, direct_alice)
    sender(direct_vm, direct_alice)
    evil = "first\n1700000000|forged second\r\n9|third fourth fifth\x85sixth\x0bseventh\x0ceighth | pipe | text"
    c.post_update(vid, evil)
    ups = row(c, vid)["updates"]
    assert len(ups) == 1
    assert "\n" not in ups[0]["text"] and "\r" not in ups[0]["text"]
    assert "pipe | text" in ups[0]["text"]  # a pipe is ordinary text and is returned whole
    assert ups[0]["at"] > 1_000_000_000 and ups[0]["at"] != 1700000000


def test_an_update_that_starts_with_digits_and_a_pipe_is_not_misread(direct_vm, direct_deploy, direct_alice):
    c = deploy(direct_deploy)
    vid = make_vow(c, direct_vm, direct_alice)
    sender(direct_vm, direct_alice)
    c.post_update(vid, "123|456|789 and more words")
    up = row(c, vid)["updates"][0]
    assert up["text"] == "123|456|789 and more words" and up["at"] > 1_000_000_000


def test_updates_cannot_be_posted_by_a_backer_or_after_review_starts(direct_vm, direct_deploy, direct_alice, direct_bob):
    c = deploy(direct_deploy)
    vid = make_vow(c, direct_vm, direct_alice)
    back(c, direct_vm, direct_bob, vid, "faith", GEN // 4)
    sender(direct_vm, direct_bob)
    with direct_vm.expect_revert("Only the keeper"):
        c.post_update(vid, "A backer cannot speak for the keeper")
    propose(c, direct_vm, direct_alice, vid, "FULFILLED")
    sender(direct_vm, direct_alice)
    with direct_vm.expect_revert("already been judged"):
        c.post_update(vid, "A late word about the vow")


def test_updates_do_not_change_what_counts_as_evidence(direct_vm, direct_deploy, direct_alice):
    c = deploy(direct_deploy)
    vid = make_vow(c, direct_vm, direct_alice)
    sender(direct_vm, direct_alice)
    c.post_update(vid, "I completed everything, published on 2020-01-15, trust me")
    direct_vm.clear_mocks()
    mock_page(direct_vm, BAD_PAGE)
    mock_verdict(direct_vm, "FULFILLED")  # a judge that says yes, but the page has no such quote
    warp_later(direct_vm, 3600 + 120)
    sender(direct_vm, direct_alice)
    c.judge(vid)
    assert row(c, vid)["proposed"] == BROKEN


# ---- the feed, cursors and hostile view arguments ---------------------------------------------------------------

def test_view_arguments_at_the_edge_of_the_integer_range(direct_vm, direct_deploy, direct_alice):
    c = deploy(direct_deploy)
    make_vow(c, direct_vm, direct_alice)
    huge = 10**30
    assert json.loads(c.activity(huge, 5)) == []
    assert json.loads(c.activity(0, huge))[0]["action"] == "made"
    assert json.loads(c.list_keepers(huge, huge))["rows"] == []
    assert json.loads(c.changes_since(huge))["reset"] is True
    assert json.loads(c.changes_since(-huge))["reset"] is True
    out = json.loads(c.vows_of(hexof(direct_alice), huge, huge))
    assert len(out["rows"]) == 1 and out["next"] == -1
    assert json.loads(c.vows_of(hexof(direct_alice), -huge, 5))["rows"][0]["id"] == 0
    assert json.loads(c.list_vows(huge, 5)) == []


def test_views_on_an_empty_contract(direct_vm, direct_deploy, direct_alice):
    c = deploy(direct_deploy)
    assert json.loads(c.activity(0, 10)) == []
    assert json.loads(c.list_keepers(0, 10)) == {"total": 0, "rows": []}
    assert json.loads(c.changes_since(0)) == {"rev": 0, "reset": False, "rows": []}
    assert json.loads(c.vows_of(hexof(direct_alice), -1, 10)) == {"rows": [], "next": -1}
    assert json.loads(c.pulse()) == {"rev": 0, "total": 0}
    assert stats(c)["keepers"] == 0 and stats(c)["retracted"] == 0


def test_a_failed_call_leaves_no_trace_in_the_feed(direct_vm, direct_deploy, direct_alice, direct_bob):
    c = deploy(direct_deploy)
    vid = make_vow(c, direct_vm, direct_alice)
    before = json.loads(c.pulse())["rev"]
    sender(direct_vm, direct_bob)
    for call in (lambda: c.retract(vid), lambda: c.post_update(vid, "I am not the keeper here"), lambda: c.claim(vid),
                 lambda: c.finalize(vid), lambda: c.release(vid)):
        try:
            call()
        except Exception:
            pass
    pay(direct_vm, direct_alice, GEN)
    with direct_vm.expect_revert("cannot back their own"):
        c.back(vid, "faith")
    direct_vm.value = 0
    assert json.loads(c.pulse())["rev"] == before
    assert len(json.loads(c.activity(0, 100))) == before


def test_keeper_directory_survives_many_keepers_and_clamps_pages(direct_vm, direct_deploy, direct_accounts):
    c = deploy(direct_deploy)
    for who in direct_accounts:
        make_vow(c, direct_vm, who, stake=10**17)
    n = len(direct_accounts)
    out = json.loads(c.list_keepers(0, 10_000))
    assert out["total"] == n and len(out["rows"]) == n
    assert len({k["address"] for k in out["rows"]}) == n


def test_profile_of_accepts_any_case_of_a_valid_address(direct_vm, direct_deploy, direct_alice):
    c = deploy(direct_deploy)
    make_vow(c, direct_vm, direct_alice)
    low = hexof(direct_alice)
    assert json.loads(c.profile_of(low))["vows"] == 1
    for bad in ("", "0x", "0x1234", "not-an-address", low[:-1], low + "00"):
        with pytest.raises(Exception):
            c.profile_of(bad)


# ---- the existing rules still hold next to the new state -------------------------------------------------------

def test_release_after_thirty_days_still_frees_a_review_vow_next_to_retracted_ones(direct_vm, direct_deploy, direct_alice, direct_bob):
    c = deploy(direct_deploy)
    gone = make_vow(c, direct_vm, direct_alice)
    sender(direct_vm, direct_alice)
    c.retract(gone)
    stuck = make_vow(c, direct_vm, direct_alice)
    back(c, direct_vm, direct_bob, stuck, "faith", GEN // 4)
    propose(c, direct_vm, direct_alice, stuck, "FULFILLED")
    warp_later(direct_vm, 31 * 86400 + 3600)
    sender(direct_vm, direct_bob)
    c.release(stuck)
    assert row(c, stuck)["state"] == UNCLEAR and row(c, gone)["state"] == RETRACTED
    s = stats(c)
    assert (s["retracted"], s["kept"], s["broken"]) == (1, 0, 0)


def test_the_solvency_invariant_holds_with_retractions_mixed_in(direct_vm, direct_deploy, direct_alice, direct_bob, direct_charlie):
    c = deploy(direct_deploy)
    a = make_vow(c, direct_vm, direct_alice, stake=3 * GEN + 1)
    b = make_vow(c, direct_vm, direct_alice, stake=GEN)
    k = make_vow(c, direct_vm, direct_bob, stake=2 * GEN + 7)
    back(c, direct_vm, direct_charlie, k, "faith", GEN)
    back(c, direct_vm, direct_alice, k, "doubt", 10**17 + 1)
    sender(direct_vm, direct_alice)
    c.retract(a)
    c.retract(b)
    judge(c, direct_vm, direct_bob, k, "FULFILLED")
    for vid, who in ((a, direct_alice), (b, direct_alice), (k, direct_bob), (k, direct_charlie)):
        if payout(c, vid, who):
            sender(direct_vm, who)
            c.claim(vid)
    s = stats(c)
    left = int(s["deposited"]) - int(s["paid"]) - int(s["embers"])
    assert 0 <= left <= 10
