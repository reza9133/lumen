"""Direct-mode tests for the features added in contract v2.0.0: retract, progress updates, the activity feed and
incremental sync, the keeper directory, keeper tiers, params(), and the ZWNJ rule for vow text.

Run:  pytest tests/direct/test_v2_features.py -v
"""

import json
import re
import time
from pathlib import Path

from conftest import (
    BAD_PAGE, CONTRACT, GEN, GOOD_PAGE, PROOF_URL, back, hexof, judge, make_vow, mock_page, mock_verdict, pay,
    propose, sender, settle, warp_later,
)

OPEN, KEPT, BROKEN, UNCLEAR, REVIEW, RETRACTED = 0, 1, 2, 3, 4, 5
ZWNJ = "‌"
ZWSP = "​"
RLO = "‮"


def deploy(direct_deploy):
    return direct_deploy(CONTRACT)


def row(c, vid):
    return json.loads(c.get_vow(vid))


def stats(c):
    return json.loads(c.stats())


def payout(c, vid, who):
    return int(json.loads(c.position_of(vid, hexof(who)))["payout"])


# ---- params ------------------------------------------------------------------------------------------------

def test_params_reports_every_limit_the_contract_enforces(direct_vm, direct_deploy):
    c = deploy(direct_deploy)
    p = json.loads(c.params())
    src = (Path(__file__).resolve().parents[2] / CONTRACT).read_text()
    assert p["version"] == re.search(r'^VERSION = "([^"]+)"', src, re.M).group(1)
    assert p["min_stake"] == str(10**17) and p["min_back"] == str(10**16)
    assert p["states"] == {"open": 0, "kept": 1, "broken": 2, "unclear": 3, "review": 4, "retracted": 5}
    assert [t["name"] for t in p["tiers"]] == ["Constellation", "Beacon", "Flame", "Spark"]
    assert p["retract_burn_div"] == 5 and p["max_updates"] == 5 and p["max_update"] == 200
    assert stats(c)["version"] == p["version"]


def test_the_limits_in_params_are_the_limits_the_contract_enforces(direct_vm, direct_deploy, direct_alice):
    c = deploy(direct_deploy)
    p = json.loads(c.params())
    soon = int(time.time()) + 3600
    pay(direct_vm, direct_alice, int(p["min_stake"]) - 1)
    with direct_vm.expect_revert("minimum stake"):
        c.make_vow("A vow that is long enough to count", PROOF_URL, soon)
    pay(direct_vm, direct_alice, int(p["min_stake"]))
    c.make_vow("A" * p["max_text"] + "B" * 40, PROOF_URL, soon)  # an over-long vow is cut, not refused
    assert len(row(c, 0)["text"]) == p["max_text"]
    direct_vm.value = 0


# ---- ZWNJ ----------------------------------------------------------------------------------------------------

def test_vow_text_keeps_zero_width_non_joiner_and_drops_other_invisible_marks(direct_vm, direct_deploy, direct_alice):
    c = deploy(direct_deploy)
    text = f"Write a note on mi{ZWNJ}khaham and keep it{ZWSP}short{RLO}ly"
    vid = make_vow(c, direct_vm, direct_alice, text=text)
    got = row(c, vid)["text"]
    assert f"mi{ZWNJ}khaham" in got
    assert ZWSP not in got and RLO not in got
    assert "keep it short ly" in got


def test_update_text_keeps_zwnj_too(direct_vm, direct_deploy, direct_alice):
    c = deploy(direct_deploy)
    vid = make_vow(c, direct_vm, direct_alice)
    sender(direct_vm, direct_alice)
    c.post_update(vid, f"Draft one is done mi{ZWNJ}khaham")
    assert row(c, vid)["updates"][0]["text"] == f"Draft one is done mi{ZWNJ}khaham"


def test_page_text_still_turns_zwnj_into_a_space_so_quotes_match(direct_vm, direct_deploy, direct_alice):
    """The judge's quote and the page are compared after the same cleaning, so a quote that dropped or kept the
    invisible mark still matches the page."""
    c = deploy(direct_deploy)
    page = f"Chapter{ZWNJ}one of the essay series was published on the blog, published on 2020-01-15. Share it."
    vid = make_vow(c, direct_vm, direct_alice)
    direct_vm.clear_mocks()
    mock_page(direct_vm, page)
    mock_verdict(direct_vm, "FULFILLED", quote="Chapter one of the essay series was published")
    warp_later(direct_vm, 3600 + 120)
    sender(direct_vm, direct_alice)
    c.judge(vid)
    assert row(c, vid)["state"] == REVIEW and row(c, vid)["proposed"] == KEPT


# ---- retract -------------------------------------------------------------------------------------------------

def test_a_keeper_can_retract_an_unbacked_vow_and_claim_four_fifths(direct_vm, direct_deploy, direct_alice):
    c = deploy(direct_deploy)
    vid = make_vow(c, direct_vm, direct_alice, stake=2 * GEN)
    sender(direct_vm, direct_alice)
    c.retract(vid)
    r = row(c, vid)
    assert r["state"] == RETRACTED and "retracted" in r["note"]
    s = stats(c)
    assert s["retracted"] == 1 and s["embers"] == str(2 * GEN // 5)
    assert payout(c, vid, direct_alice) == 2 * GEN - 2 * GEN // 5
    c.claim(vid)
    s = stats(c)
    assert int(s["deposited"]) - int(s["paid"]) == int(s["embers"])  # only the burned part stays
    with direct_vm.expect_revert("Already claimed"):
        c.claim(vid)
    prof = json.loads(c.profile_of(hexof(direct_alice)))
    assert prof["retracted"] == 1 and prof["vows"] == 1 and prof["kept"] == 0 and prof["tier"] == "Unlit"


def test_a_retraction_ends_the_streak(direct_vm, direct_deploy, direct_alice):
    c = deploy(direct_deploy)
    a = make_vow(c, direct_vm, direct_alice)
    judge(c, direct_vm, direct_alice, a, "FULFILLED")
    assert json.loads(c.record_of(hexof(direct_alice)))["streak"] == 1
    b = make_vow(c, direct_vm, direct_alice)
    sender(direct_vm, direct_alice)
    c.retract(b)
    rec = json.loads(c.record_of(hexof(direct_alice)))
    assert rec["streak"] == 0 and rec["best"] == 1 and rec["kept"] == 1


def test_retract_is_refused_for_anyone_but_the_keeper(direct_vm, direct_deploy, direct_alice, direct_bob):
    c = deploy(direct_deploy)
    vid = make_vow(c, direct_vm, direct_alice)
    sender(direct_vm, direct_bob)
    with direct_vm.expect_revert("Only the keeper"):
        c.retract(vid)
    assert row(c, vid)["state"] == OPEN


def test_a_vow_with_any_backing_cannot_be_retracted(direct_vm, direct_deploy, direct_alice, direct_bob, direct_charlie):
    c = deploy(direct_deploy)
    faith_vid = make_vow(c, direct_vm, direct_alice)
    back(c, direct_vm, direct_bob, faith_vid, "faith", 10**16)  # the minimum
    doubt_vid = make_vow(c, direct_vm, direct_alice)
    back(c, direct_vm, direct_charlie, doubt_vid, "doubt", 10**16)
    sender(direct_vm, direct_alice)
    for vid in (faith_vid, doubt_vid):
        with direct_vm.expect_revert("has backing"):
            c.retract(vid)
        assert row(c, vid)["state"] == OPEN


def test_retract_is_closed_after_the_deadline_and_after_a_verdict(direct_vm, direct_deploy, direct_alice):
    c = deploy(direct_deploy)
    late = make_vow(c, direct_vm, direct_alice)
    warp_later(direct_vm, 3600 + 5)
    sender(direct_vm, direct_alice)
    with direct_vm.expect_revert("deadline has passed"):
        c.retract(late)
    judged = make_vow(c, direct_vm, direct_alice)
    propose(c, direct_vm, direct_alice, judged, "FULFILLED")
    assert row(c, judged)["state"] == REVIEW
    sender(direct_vm, direct_alice)
    with direct_vm.expect_revert("already been judged"):
        c.retract(judged)


def test_a_retracted_vow_is_final_in_every_way(direct_vm, direct_deploy, direct_alice, direct_bob):
    c = deploy(direct_deploy)
    vid = make_vow(c, direct_vm, direct_alice)
    sender(direct_vm, direct_alice)
    c.retract(vid)
    with direct_vm.expect_revert("already been judged"):
        c.retract(vid)
    with direct_vm.expect_revert("already been judged"):
        c.post_update(vid, "Still working on it")
    with direct_vm.expect_revert("already been judged"):
        c.pin_evidence(vid, "https://web.archive.org/web/20200115120000/https://blog.example.org/chapter-one")
    sender(direct_vm, direct_bob)
    pay(direct_vm, direct_bob, GEN)
    with direct_vm.expect_revert("no longer takes backing"):
        c.back(vid, "faith")
    direct_vm.value = 0
    warp_later(direct_vm, 3600 + 120)
    with direct_vm.expect_revert("already been judged"):
        c.judge(vid)
    with direct_vm.expect_revert("not under review"):
        c.finalize(vid)
    warp_later(direct_vm, 31 * 86400 + 3600)
    with direct_vm.expect_revert("already been judged"):
        c.release(vid)


def test_a_retracted_vow_pays_nobody_but_the_keeper(direct_vm, direct_deploy, direct_alice, direct_bob):
    c = deploy(direct_deploy)
    vid = make_vow(c, direct_vm, direct_alice)
    sender(direct_vm, direct_alice)
    c.retract(vid)
    assert payout(c, vid, direct_bob) == 0
    sender(direct_vm, direct_bob)
    with direct_vm.expect_revert("Nothing to claim"):
        c.claim(vid)


# ---- progress updates -----------------------------------------------------------------------------------------

def test_the_keeper_can_post_five_updates_and_no_more(direct_vm, direct_deploy, direct_alice):
    c = deploy(direct_deploy)
    vid = make_vow(c, direct_vm, direct_alice)
    sender(direct_vm, direct_alice)
    for i in range(5):
        c.post_update(vid, f"Progress note number {i}")
    ups = row(c, vid)["updates"]
    assert [u["text"] for u in ups] == [f"Progress note number {i}" for i in range(5)]
    assert all(isinstance(u["at"], int) and u["at"] > 0 for u in ups)
    with direct_vm.expect_revert("at most five"):
        c.post_update(vid, "A sixth note")


def test_update_rules(direct_vm, direct_deploy, direct_alice, direct_bob):
    c = deploy(direct_deploy)
    vid = make_vow(c, direct_vm, direct_alice)
    sender(direct_vm, direct_bob)
    with direct_vm.expect_revert("Only the keeper"):
        c.post_update(vid, "I am not the keeper")
    sender(direct_vm, direct_alice)
    with direct_vm.expect_revert("too short"):
        c.post_update(vid, "ok")
    with direct_vm.expect_revert("too short"):
        c.post_update(vid, "   <>   ")
    c.post_update(vid, "x" * 500)  # over-long notes are cut to 200 characters
    assert len(row(c, vid)["updates"][0]["text"]) == 200
    warp_later(direct_vm, 3600 + 5)
    with direct_vm.expect_revert("Updates are closed"):
        c.post_update(vid, "Too late for a note")
    with direct_vm.expect_revert("No such vow"):
        c.post_update(99, "Nobody is home here")


def test_update_text_is_cleaned_like_vow_text(direct_vm, direct_deploy, direct_alice):
    c = deploy(direct_deploy)
    vid = make_vow(c, direct_vm, direct_alice)
    sender(direct_vm, direct_alice)
    c.post_update(vid, "  <script>alert(1)</script>   First   draft\nis done ")
    text = row(c, vid)["updates"][0]["text"]
    assert "<" not in text and ">" not in text and "\n" not in text and "  " not in text


def test_updates_never_reach_the_judges(direct_vm, direct_deploy, direct_alice):
    """A mock that matches the update text is registered first, so if the marker were ever placed in a prompt the
    judge would answer BROKEN and the vow could not be proposed as kept."""
    c = deploy(direct_deploy)
    vid = make_vow(c, direct_vm, direct_alice)
    sender(direct_vm, direct_alice)
    c.post_update(vid, "ZZ-UPDATE-MARKER the judges must never read this note")
    direct_vm.clear_mocks()
    direct_vm.mock_llm(r"ZZ-UPDATE-MARKER", json.dumps(json.dumps({"verdict": "BROKEN", "note": "leaked"})))
    mock_page(direct_vm, GOOD_PAGE)
    mock_verdict(direct_vm, "FULFILLED")
    warp_later(direct_vm, 3600 + 120)
    sender(direct_vm, direct_alice)
    c.judge(vid)
    assert row(c, vid)["state"] == REVIEW and row(c, vid)["proposed"] == KEPT


# ---- activity feed, pulse and incremental sync ----------------------------------------------------------------

def test_every_state_change_is_logged_in_order(direct_vm, direct_deploy, direct_alice, direct_bob, direct_charlie):
    c = deploy(direct_deploy)
    assert json.loads(c.pulse()) == {"rev": 0, "total": 0}
    vid = make_vow(c, direct_vm, direct_alice, stake=2 * GEN)
    back(c, direct_vm, direct_bob, vid, "faith", GEN // 2)
    back(c, direct_vm, direct_charlie, vid, "doubt", GEN // 2)
    sender(direct_vm, direct_alice)
    c.post_update(vid, "Halfway there with the draft")
    propose(c, direct_vm, direct_alice, vid, "FULFILLED")
    settle(c, direct_vm, vid)
    sender(direct_vm, direct_alice)
    c.claim(vid)
    acts = json.loads(c.activity(0, 50))
    names = [a["action"] for a in reversed(acts)]
    assert names == ["made", "faith", "doubt", "update", "proposed", "kept", "claimed"]
    assert [a["seq"] for a in acts] == list(range(len(acts) - 1, -1, -1))  # newest first, seq counts down
    assert all(a["vow"] == vid and a["keeper"].lower() == hexof(direct_alice) for a in acts)
    assert json.loads(c.pulse()) == {"rev": 7, "total": 1}
    assert stats(c)["rev"] == 7


def test_activity_paging_and_clamps(direct_vm, direct_deploy, direct_alice):
    c = deploy(direct_deploy)
    for _ in range(5):
        make_vow(c, direct_vm, direct_alice)
    page1 = json.loads(c.activity(0, 2))
    page2 = json.loads(c.activity(2, 2))
    page3 = json.loads(c.activity(4, 2))
    assert [a["seq"] for a in page1] == [4, 3] and [a["seq"] for a in page2] == [2, 1] and [a["seq"] for a in page3] == [0]
    assert json.loads(c.activity(0, 0)) == [] and json.loads(c.activity(99, 5)) == []
    assert json.loads(c.activity(-3, 1))[0]["seq"] == 4  # a negative offset counts as zero
    assert len(json.loads(c.activity(0, 10_000))) == 5  # the limit is clamped to the contract maximum


def test_retries_and_early_checks_are_logged_without_a_state_change(direct_vm, direct_deploy, direct_alice):
    c = deploy(direct_deploy)
    vid = make_vow(c, direct_vm, direct_alice, secs=7200)
    direct_vm.clear_mocks()
    mock_page(direct_vm, BAD_PAGE)
    mock_verdict(direct_vm, "BROKEN")
    warp_later(direct_vm, 3700)  # past halfway, before the deadline
    sender(direct_vm, direct_alice)
    c.judge(vid)
    assert row(c, vid)["state"] == OPEN
    assert json.loads(c.activity(0, 1))[0]["action"] == "checked"


def test_changes_since_returns_only_vows_that_changed(direct_vm, direct_deploy, direct_alice, direct_bob):
    c = deploy(direct_deploy)
    a = make_vow(c, direct_vm, direct_alice)
    b = make_vow(c, direct_vm, direct_alice)
    first = json.loads(c.changes_since(0))
    assert first["reset"] is False and first["rev"] == 2
    assert [r["id"] for r in first["rows"]] == [b, a]  # newest change first
    cursor = first["rev"]
    again = json.loads(c.changes_since(cursor))
    assert again == {"rev": cursor, "reset": False, "rows": []}
    back(c, direct_vm, direct_bob, a, "faith", GEN // 2)
    delta = json.loads(c.changes_since(cursor))
    assert [r["id"] for r in delta["rows"]] == [a] and delta["rows"][0]["faith"] == str(GEN // 2)
    assert delta["rev"] == cursor + 1


def test_changes_since_lists_a_vow_once_however_often_it_changed(direct_vm, direct_deploy, direct_alice):
    c = deploy(direct_deploy)
    vid = make_vow(c, direct_vm, direct_alice)
    sender(direct_vm, direct_alice)
    for i in range(4):
        c.post_update(vid, f"Update number {i} on this vow")
    out = json.loads(c.changes_since(0))
    assert out["rev"] == 5 and [r["id"] for r in out["rows"]] == [vid]


def test_a_cursor_from_another_contract_or_a_huge_gap_means_reset(direct_vm, direct_deploy, direct_alice):
    c = deploy(direct_deploy)
    make_vow(c, direct_vm, direct_alice)
    assert json.loads(c.changes_since(5)) == {"rev": 1, "reset": True, "rows": []}  # ahead of this contract
    assert json.loads(c.changes_since(-1)) == {"rev": 1, "reset": True, "rows": []}
    limit = json.loads(c.params())["page_max"]
    for _ in range(limit + 1):
        make_vow(c, direct_vm, direct_alice, stake=10**17)
    n = json.loads(c.pulse())["rev"]
    out = json.loads(c.changes_since(0))
    assert out["reset"] is True and out["rows"] == [] and out["rev"] == n  # more vows changed than one page holds
    recent = json.loads(c.changes_since(n - 3))
    assert recent["reset"] is False and len(recent["rows"]) == 3


# ---- keeper directory and tiers -------------------------------------------------------------------------------

def test_keepers_are_indexed_once_in_order_of_their_first_vow(direct_vm, direct_deploy, direct_alice, direct_bob, direct_charlie):
    c = deploy(direct_deploy)
    make_vow(c, direct_vm, direct_bob)
    make_vow(c, direct_vm, direct_alice)
    make_vow(c, direct_vm, direct_bob)
    make_vow(c, direct_vm, direct_charlie)
    out = json.loads(c.list_keepers(0, 10))
    assert out["total"] == 3
    assert [k["address"].lower() for k in out["rows"]] == [hexof(direct_bob), hexof(direct_alice), hexof(direct_charlie)]
    assert [k["vows"] for k in out["rows"]] == [2, 1, 1]
    assert stats(c)["keepers"] == 3
    page = json.loads(c.list_keepers(1, 1))
    assert page["total"] == 3 and [k["address"].lower() for k in page["rows"]] == [hexof(direct_alice)]
    assert json.loads(c.list_keepers(5, 5))["rows"] == [] and json.loads(c.list_keepers(0, 0))["rows"] == []
    assert json.loads(c.list_keepers(-4, 2))["rows"][0]["address"].lower() == hexof(direct_bob)


def test_profile_of_an_unknown_address_is_an_empty_record(direct_vm, direct_deploy, direct_alice):
    c = deploy(direct_deploy)
    p = json.loads(c.profile_of(hexof(direct_alice)))
    assert p.pop("address").lower() == hexof(direct_alice)
    assert p == {
        "vows": 0, "kept": 0, "broken": 0, "retracted": 0, "streak": 0, "best": 0,
        "kept_stake": "0", "tier": "Unlit",
    }
    with direct_vm.expect_revert():
        c.profile_of("not an address")


def test_standing_follows_the_tier_table():
    src = (Path(__file__).resolve().parents[2] / CONTRACT).read_text()
    ns = {}
    exec(src[src.index("TIERS = ("):src.index("# A public web address")].split("\n\n")[0], ns)
    exec(src[src.index("def _standing"):src.index("def _prompt")], ns)
    standing = ns["_standing"]
    cases = [
        ((0, 0, 0), "Unlit"),
        ((1, 0, 0), "Spark"),
        ((1, 0, 10**17), "Spark"),
        ((3, 0, 10**18 - 1), "Spark"),  # three kept vows, but less than 1 GEN behind them
        ((3, 0, 10**18), "Flame"),
        ((3, 5, 10**18), "Flame"),  # Flame has no ratio rule
        ((7, 1, 5 * 10**18), "Beacon"),
        ((7, 2, 5 * 10**18), "Flame"),  # 2 broken * 4 = 8 > 7 kept
        ((7, 0, 5 * 10**18 - 1), "Flame"),
        ((15, 1, 20 * 10**18), "Constellation"),
        ((15, 2, 20 * 10**18), "Beacon"),  # 2 * 10 = 20 > 15
        ((100, 0, 19 * 10**18), "Beacon"),
        ((14, 0, 100 * 10**18), "Beacon"),
    ]
    for args, want in cases:
        assert standing(*args) == want, (args, want)


def test_a_pile_of_dust_sized_kept_vows_does_not_buy_a_high_tier(direct_vm, direct_deploy, direct_alice):
    c = deploy(direct_deploy)
    for _ in range(4):
        vid = make_vow(c, direct_vm, direct_alice, stake=10**17)
        judge(c, direct_vm, direct_alice, vid, "FULFILLED")
        sender(direct_vm, direct_alice)
        c.claim(vid)
    p = json.loads(c.profile_of(hexof(direct_alice)))
    assert p["kept"] == 4 and p["kept_stake"] == str(4 * 10**17) and p["tier"] == "Spark"


def test_a_keeper_climbs_to_flame_with_real_stake(direct_vm, direct_deploy, direct_alice):
    c = deploy(direct_deploy)
    for _ in range(3):
        vid = make_vow(c, direct_vm, direct_alice, stake=GEN)
        judge(c, direct_vm, direct_alice, vid, "FULFILLED")
    assert json.loads(c.profile_of(hexof(direct_alice)))["tier"] == "Flame"


# ---- vows_of --------------------------------------------------------------------------------------------------

def test_vows_of_pages_newest_first_with_a_cursor(direct_vm, direct_deploy, direct_alice, direct_bob):
    c = deploy(direct_deploy)
    mine, theirs = [], []
    for i in range(7):
        who, bucket = (direct_alice, mine) if i % 3 != 1 else (direct_bob, theirs)
        bucket.append(make_vow(c, direct_vm, who))
    key = hexof(direct_alice)
    seen = []
    cursor = -1
    for _ in range(10):
        out = json.loads(c.vows_of(key, cursor, 2))
        seen += [r["id"] for r in out["rows"]]
        assert all(r["keeper"].lower() == key for r in out["rows"])
        if out["next"] == -1:
            break
        cursor = out["next"]
    assert seen == list(reversed(mine))
    assert json.loads(c.vows_of(hexof(direct_bob), -1, 50))["rows"][0]["id"] == theirs[-1]


def test_vows_of_for_a_stranger_or_with_odd_arguments_is_safe(direct_vm, direct_deploy, direct_alice, direct_bob):
    c = deploy(direct_deploy)
    make_vow(c, direct_vm, direct_alice)
    assert json.loads(c.vows_of(hexof(direct_bob), -1, 10)) == {"rows": [], "next": -1}
    assert json.loads(c.vows_of(hexof(direct_alice), -1, 0))["rows"] == []
    assert len(json.loads(c.vows_of(hexof(direct_alice), 10_000, 10))["rows"]) == 1  # a cursor past the end starts at the newest
    assert json.loads(c.vows_of(hexof(direct_alice), 0, 10))["next"] == -1


# ---- rows -----------------------------------------------------------------------------------------------------

def test_rows_carry_updates_and_the_new_state(direct_vm, direct_deploy, direct_alice):
    c = deploy(direct_deploy)
    vid = make_vow(c, direct_vm, direct_alice)
    assert row(c, vid)["updates"] == []
    listed = json.loads(c.list_vows(0, 10))
    assert listed[0]["id"] == vid and "updates" in listed[0]
