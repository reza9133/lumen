"""Adversarial tests for archive evidence: redirects, timestamp mismatches and captures nobody confirmed.

The contract used to trust the 14 digits in a Wayback link. But a link for a time with no capture is answered
with the nearest capture (by a redirect, or by serving it directly), which can be one taken after the deadline,
so the digits prove nothing. A snapshot now counts only when the archive itself says, in the Memento-Datetime
header of the replay it served, that it served exactly the capture named in the link, and that capture was taken by
the deadline. Everything else is read as an editable page and has to show a dated completion like any other page.

Each test fixes what the archive answered and what the model "said", and checks what the contract does with it.

Run:  pytest tests/direct/test_archive.py -v
"""

import json
import time

from conftest import (
    ARCHIVE_PAGE, BAD_PAGE, CONTRACT, COUNTER_URL, GEN, GOOD_PAGE, back, hexof, make_vow, mock_counter_verdict, mock_page,
    mock_redirect, mock_snapshot, mock_verdict, pay, propose, sender, settle, snapshot_url, warp_later,
)

OPEN, KEPT, BROKEN, UNCLEAR, REVIEW = 0, 1, 2, 3, 4

TS = "20200115120000"  # the capture the keeper pins: long before any deadline
TS_OLD = "20200102000000"
SNAP = snapshot_url(TS)
SNAP_OLD = snapshot_url(TS_OLD)
SNAP_PAGE_NO_DATE = "Chapter one of the essay series was published, and this capture holds the full text."
OLD_PAGE = "The archive from 3 May shows an empty blog, and no chapter was ever posted there."
QUOTE = "Chapter one of the essay series was published"
HOUR = 3600


def late_capture(after_deadline: int = 60) -> str:
    """A capture time just after the deadline of a one hour vow made now (and before the moment of judging)."""
    return time.strftime("%Y%m%d%H%M%S", time.gmtime(time.time() + HOUR + after_deadline))


def deploy(direct_deploy):
    return direct_deploy(CONTRACT)


def row(c, vid):
    return json.loads(c.get_vow(vid))


def payout(c, vid, who):
    return int(json.loads(c.position_of(vid, hexof(who)))["payout"])


def pinned_vow(c, vm, keeper, url=SNAP):
    vid = make_vow(c, vm, keeper, stake=GEN)
    sender(vm, keeper)
    c.pin_evidence(vid, url)
    return vid


def vow_on(c, vm, keeper, url):
    """A vow whose main evidence is `url` itself (make_vow in conftest always uses an ordinary page)."""
    warp_later(vm, 0)
    pay(vm, keeper, GEN)
    c.make_vow("Publish the first chapter of my essay series", url, int(time.time()) + HOUR)
    vm.value = 0
    return json.loads(c.stats())["total"] - 1


def rule_on_pin(c, vm, keeper, vid, reply_source=2, quote=QUOTE, date_quote="", date="", main=BAD_PAGE):
    """The deadline passes and the judge relies on the pinned capture (source 2) without giving a page date."""
    mock_page(vm, main)
    mock_verdict(vm, "FULFILLED", source=reply_source, quote=quote, date_quote=date_quote, date=date)
    warp_later(vm, HOUR + 120)
    sender(vm, keeper)
    c.judge(vid)
    return row(c, vid)


def assert_not_a_snapshot(r):
    """The model said FULFILLED on a capture nobody confirmed, and the contract turned that into BROKEN."""
    assert r["state"] == REVIEW and r["proposed"] == BROKEN, r
    assert r["proof"] is None
    assert "dated completion" in r["note"], r["note"]


# ---- the baseline: an exact capture the archive confirms --------------------------------------------------------

def test_an_exact_capture_confirmed_by_the_archive_is_a_snapshot(direct_vm, direct_deploy, direct_alice):
    c = deploy(direct_deploy)
    for flag in ("", "id_", "if_"):  # the raw-content and frame flavours of the same capture
        url = snapshot_url(TS, flag)
        vid = pinned_vow(c, direct_vm, direct_alice, url)
        direct_vm.clear_mocks()
        mock_snapshot(direct_vm, TS, SNAP_PAGE_NO_DATE, flag=flag)
        r = rule_on_pin(c, direct_vm, direct_alice, vid)
        assert r["proposed"] == KEPT, flag
        assert r["proof"]["tier"] == "snapshot" and r["proof"]["url"] == url and r["proof"]["date"] == "2020-01-15"
        assert r["review_end"] - r["proposed_at"] == 600  # firm proof: the short review window


# ---- redirects --------------------------------------------------------------------------------------------------

def test_a_redirect_to_a_later_capture_is_not_a_snapshot(direct_vm, direct_deploy, direct_alice):
    """The keeper pins an old time. The archive has no capture for it and sends the reader to a capture taken after
    the deadline, which shows the finished work. Whether the platform follows that redirect for us or hands it back,
    the contract ends up with a capture it cannot call pre-deadline, and the page itself shows no date."""
    c = deploy(direct_deploy)
    late = late_capture()
    for status in (301, 302, 303, 307, 308):
        vid = pinned_vow(c, direct_vm, direct_alice)
        direct_vm.clear_mocks()
        mock_redirect(direct_vm, TS, late, status=status)
        mock_snapshot(direct_vm, late, SNAP_PAGE_NO_DATE)
        assert_not_a_snapshot(rule_on_pin(c, direct_vm, direct_alice, vid))


def test_a_redirect_that_only_normalises_the_address_keeps_the_same_capture(direct_vm, direct_deploy, direct_alice):
    """Not every redirect is an attack. The raw-content form of a link may be sent on to the plain form of the very
    same capture. The replay finally served still names that capture, so the snapshot stands."""
    c = deploy(direct_deploy)
    url = snapshot_url(TS, "id_")
    vid = pinned_vow(c, direct_vm, direct_alice, url)
    direct_vm.clear_mocks()
    mock_redirect(direct_vm, TS, TS, flag="id_")  # .../web/<TS>id_/... -> /web/<TS>/...
    mock_snapshot(direct_vm, TS, SNAP_PAGE_NO_DATE)
    r = rule_on_pin(c, direct_vm, direct_alice, vid)
    assert r["proposed"] == KEPT and r["proof"]["tier"] == "snapshot" and r["proof"]["url"] == url


def test_a_redirect_that_leaves_the_archive_is_never_followed(direct_vm, direct_deploy, direct_alice):
    """An open redirect on the archive, a look-alike host and a userinfo trick all lead to a page the keeper controls.
    Only the archive's own replay path is followed, so the page is unreadable and cannot prove anything."""
    c = deploy(direct_deploy)
    evil = "https://evil.example.org/chapter"
    for loc in (
        evil,
        "//evil.example.org/chapter",
        f"https://web.archive.org.evil.example.org/web/{TS}/{ARCHIVE_PAGE}",
        f"https://web.archive.org@evil.example.org/web/{TS}/{ARCHIVE_PAGE}",
        f"https://evil.example.org/web/{TS}/{ARCHIVE_PAGE}",
        "javascript:alert(1)",
        "",
    ):
        vid = pinned_vow(c, direct_vm, direct_alice)
        direct_vm.clear_mocks()
        mock_redirect(direct_vm, TS, TS, location=loc)
        # If the contract followed it, this convincing page would make the keeper win.
        direct_vm.mock_web(r"evil\.example\.org", {
            "status": 200, "body": SNAP_PAGE_NO_DATE, "headers": {"memento-datetime": "Wed, 15 Jan 2020 12:00:00 GMT"},
        })
        r = rule_on_pin(c, direct_vm, direct_alice, vid)
        assert r["state"] == REVIEW and r["proposed"] == BROKEN and r["proof"] is None, loc
        assert "did not point to the page" in r["note"], (loc, r["note"])  # the pin was unreadable, so it was skipped


def test_redirect_loops_and_long_chains_end_unreadable(direct_vm, direct_deploy, direct_alice):
    c = deploy(direct_deploy)
    vid = pinned_vow(c, direct_vm, direct_alice)
    direct_vm.clear_mocks()
    mock_redirect(direct_vm, TS, TS)  # redirects to itself, forever
    r = rule_on_pin(c, direct_vm, direct_alice, vid)
    assert r["proposed"] == BROKEN and r["proof"] is None and "did not point to the page" in r["note"]

    # As the main evidence page, a page that cannot be read is retried and never counts as a verdict by itself.
    vid = vow_on(c, direct_vm, direct_alice, SNAP)
    direct_vm.clear_mocks()
    mock_redirect(direct_vm, TS, TS)
    mock_verdict(direct_vm, "FULFILLED", source=1, quote=QUOTE, date_quote="", date="")
    warp_later(direct_vm, HOUR + 120)
    sender(direct_vm, direct_alice)
    c.judge(vid)
    r = row(c, vid)
    assert r["state"] == OPEN and r["tries"] == 1 and "could not be read" in r["note"]


# ---- timestamp mismatches ---------------------------------------------------------------------------------------

def test_a_capture_other_than_the_one_named_is_not_a_snapshot(direct_vm, direct_deploy, direct_alice):
    """The archive answers 200 but the replay says it is a different capture than the link names: a later one
    (taken after the deadline), one second off, or an earlier one. The link's digits were wrong, so none of them
    is trusted; the page is judged as an editable page and shows no date."""
    c = deploy(direct_deploy)
    for served in (late_capture(), "20200115120001", "20200115115959", "20200114120000", "20190115120000"):
        vid = pinned_vow(c, direct_vm, direct_alice)
        direct_vm.clear_mocks()
        mock_snapshot(direct_vm, TS, SNAP_PAGE_NO_DATE, served=served)
        assert_not_a_snapshot(rule_on_pin(c, direct_vm, direct_alice, vid))


def test_a_replay_that_disagrees_with_the_address_it_was_served_from_is_not_trusted(direct_vm, direct_deploy, direct_alice):
    """The platform followed a redirect to a different capture, but the replay's header claims the requested time."""
    c = deploy(direct_deploy)
    late = late_capture()
    vid = pinned_vow(c, direct_vm, direct_alice)
    direct_vm.clear_mocks()
    mock_redirect(direct_vm, TS, late)
    mock_snapshot(direct_vm, late, SNAP_PAGE_NO_DATE, served=TS)  # header says TS, address says `late`
    assert_not_a_snapshot(rule_on_pin(c, direct_vm, direct_alice, vid))


def test_a_capture_the_archive_does_not_confirm_is_not_a_snapshot(direct_vm, direct_deploy, direct_alice):
    """No header, an empty one, one in the wrong format and an impossible date: nothing says which capture was
    served, so the contract does not guess."""
    c = deploy(direct_deploy)
    for header in (None, "", "yesterday", "2020-01-15T12:00:00Z", "Wed, 31 Feb 2020 12:00:00 GMT", "Wed, 15 Jan 2020 12:00:00 CET",
                   "Wed, 15 Jan 2020 12:00:00 GMT and more", "Wed, 15 Foo 2020 12:00:00 GMT"):
        vid = pinned_vow(c, direct_vm, direct_alice)
        direct_vm.clear_mocks()
        mock_snapshot(direct_vm, TS, SNAP_PAGE_NO_DATE, headers={"memento-datetime": header})
        assert_not_a_snapshot(rule_on_pin(c, direct_vm, direct_alice, vid))


def test_a_capture_the_archive_could_not_serve_is_not_a_snapshot(direct_vm, direct_deploy, direct_alice):
    c = deploy(direct_deploy)
    for status in (404, 429, 500, 503):
        vid = pinned_vow(c, direct_vm, direct_alice)
        direct_vm.clear_mocks()
        mock_snapshot(direct_vm, TS, SNAP_PAGE_NO_DATE, status=status)
        r = rule_on_pin(c, direct_vm, direct_alice, vid)
        assert r["proposed"] == BROKEN and r["proof"] is None and "did not point to the page" in r["note"], status


def test_the_main_evidence_link_is_authenticated_like_a_pin(direct_vm, direct_deploy, direct_alice):
    """A vow whose own evidence link is a capture gets no special trust: the same mismatch is not a snapshot."""
    c = deploy(direct_deploy)
    vid = vow_on(c, direct_vm, direct_alice, SNAP)
    direct_vm.clear_mocks()
    mock_snapshot(direct_vm, TS, SNAP_PAGE_NO_DATE, served=late_capture())
    mock_verdict(direct_vm, "FULFILLED", source=1, quote=QUOTE, date_quote="", date="")
    warp_later(direct_vm, HOUR + 120)
    sender(direct_vm, direct_alice)
    c.judge(vid)
    assert_not_a_snapshot(row(c, vid))

    ok = vow_on(c, direct_vm, direct_alice, SNAP)
    direct_vm.clear_mocks()
    mock_snapshot(direct_vm, TS, SNAP_PAGE_NO_DATE)
    mock_verdict(direct_vm, "FULFILLED", source=1, quote=QUOTE, date_quote="", date="")
    warp_later(direct_vm, HOUR + 120)
    sender(direct_vm, direct_alice)
    c.judge(ok)
    r = row(c, ok)
    assert r["proposed"] == KEPT and r["proof"]["tier"] == "snapshot"


# ---- an unconfirmed capture is an editable page: it can still be judged, but never gets firm treatment -----------

def test_a_post_deadline_capture_with_a_dated_line_is_judged_as_an_editable_page(direct_vm, direct_deploy, direct_alice):
    """If the page served shows a dated completion by the deadline, the normal date check can pass. But the proof
    is recorded as editable: it gets the long review window and can be beaten by a firm record."""
    c = deploy(direct_deploy)
    vid = pinned_vow(c, direct_vm, direct_alice)
    direct_vm.clear_mocks()
    mock_snapshot(direct_vm, TS, GOOD_PAGE, served=late_capture())
    r = rule_on_pin(c, direct_vm, direct_alice, vid, quote="Chapter one of the essay series was published",
                    date_quote="published on 2020-01-15", date="2020-01-15")
    assert r["proposed"] == KEPT
    assert r["proof"]["tier"] == "mutable" and r["proof"]["date"] == "2020-01-15"
    assert r["review_end"] - r["proposed_at"] == 1200  # twice the window a confirmed capture gets


def test_a_page_dated_after_the_deadline_is_not_rescued_by_a_snapshot_link(direct_vm, direct_deploy, direct_alice):
    c = deploy(direct_deploy)
    vid = pinned_vow(c, direct_vm, direct_alice)
    direct_vm.clear_mocks()
    late = "Chapter one of the essay series was published on 2999-03-04 and it is finally here for everyone."
    mock_snapshot(direct_vm, TS, late, served=late_capture())
    r = rule_on_pin(c, direct_vm, direct_alice, vid, date_quote="published on 2999-03-04", date="2999-03-04")
    assert_not_a_snapshot(r)


# ---- counter-evidence and disputes -----------------------------------------------------------------------------

def test_an_unconfirmed_archive_link_cannot_pass_as_a_firm_counter_record(direct_vm, direct_deploy, direct_alice, direct_charlie):
    """A doubter submits a snapshot-shaped link that the archive answers with a capture it will not vouch for. It
    is an editable page: it cannot beat the keeper's confirmed capture, and against an editable page of the
    keeper it can only cancel the vow with a refund, never win the stake."""
    c = deploy(direct_deploy)

    # 1. The keeper pinned a confirmed capture. The doubter's forged "firm" record is ignored.
    vid = make_vow(c, direct_vm, direct_alice, stake=GEN)
    back(c, direct_vm, direct_charlie, vid, "doubt", GEN // 10)
    sender(direct_vm, direct_alice)
    c.pin_evidence(vid, SNAP)
    sender(direct_vm, direct_charlie)
    c.challenge(vid, SNAP_OLD)
    direct_vm.clear_mocks()
    mock_page(direct_vm, BAD_PAGE)
    mock_snapshot(direct_vm, TS, SNAP_PAGE_NO_DATE)
    mock_snapshot(direct_vm, TS_OLD, OLD_PAGE, served=late_capture())  # not the capture the link names
    mock_verdict(direct_vm, "FULFILLED", source=2, quote=QUOTE, date_quote="", date="")
    mock_counter_verdict(direct_vm, quote="The archive from 3 May shows an empty blog")
    warp_later(direct_vm, HOUR + 120)
    sender(direct_vm, direct_alice)
    c.judge(vid)
    r = row(c, vid)
    assert r["proposed"] == KEPT and r["proof"]["tier"] == "snapshot"

    # 2. The keeper's proof is an editable page. An unconfirmed archive link is an editable counter: refund.
    vid = make_vow(c, direct_vm, direct_alice, stake=GEN)
    back(c, direct_vm, direct_charlie, vid, "doubt", GEN // 10)
    sender(direct_vm, direct_charlie)
    c.challenge(vid, SNAP_OLD)
    direct_vm.clear_mocks()
    mock_page(direct_vm, GOOD_PAGE)
    mock_snapshot(direct_vm, TS_OLD, OLD_PAGE, served=late_capture())
    mock_verdict(direct_vm, "FULFILLED")
    mock_counter_verdict(direct_vm, quote="The archive from 3 May shows an empty blog")
    warp_later(direct_vm, HOUR + 120)
    sender(direct_vm, direct_alice)
    c.judge(vid)
    r = row(c, vid)
    assert r["state"] == UNCLEAR  # final at once: nobody is slashed and nobody wins the stake
    assert payout(c, vid, direct_alice) == GEN and payout(c, vid, direct_charlie) == GEN // 10

    # 3. The same link, confirmed by the archive, is a firm record and does win against an editable page.
    vid = make_vow(c, direct_vm, direct_alice, stake=GEN)
    back(c, direct_vm, direct_charlie, vid, "doubt", GEN // 10)
    sender(direct_vm, direct_charlie)
    c.challenge(vid, SNAP_OLD)
    direct_vm.clear_mocks()
    mock_page(direct_vm, GOOD_PAGE)
    mock_snapshot(direct_vm, TS_OLD, OLD_PAGE)
    mock_verdict(direct_vm, "FULFILLED")
    mock_counter_verdict(direct_vm, quote="The archive from 3 May shows an empty blog")
    warp_later(direct_vm, HOUR + 120)
    sender(direct_vm, direct_alice)
    c.judge(vid)
    r = row(c, vid)
    assert r["proposed"] == BROKEN and r["proof"] is None


def test_a_dispute_page_served_from_a_later_capture_does_not_rescue_a_broken_vow(direct_vm, direct_deploy, direct_alice):
    """The keeper answers a broken proposal with an old-looking archive link. The archive serves a capture taken
    after the deadline instead, so the page is not firm and shows no date: the broken verdict stands."""
    c = deploy(direct_deploy)
    vid = make_vow(c, direct_vm, direct_alice, stake=GEN)
    propose(c, direct_vm, direct_alice, vid, "BROKEN")
    sender(direct_vm, direct_alice)
    c.dispute(vid, SNAP)

    direct_vm.clear_mocks()
    mock_page(direct_vm, BAD_PAGE)
    mock_snapshot(direct_vm, TS, SNAP_PAGE_NO_DATE, served=late_capture(after_deadline=90))
    mock_verdict(direct_vm, "FULFILLED", source=2, quote=QUOTE, date_quote="", date="")
    settle(c, direct_vm, vid)
    r = row(c, vid)
    assert r["state"] == BROKEN and r["proof"] is None
    assert payout(c, vid, direct_alice) == 0


# ---- early confirmation -----------------------------------------------------------------------------------------

def test_early_confirmation_needs_a_confirmed_capture_too(direct_vm, direct_deploy, direct_alice):
    """An early check can only confirm. A pin the archive will not vouch for confirms nothing, and the vow simply
    stays open with a note, as it would for any page that does not show the work yet."""
    c = deploy(direct_deploy)
    vid = pinned_vow(c, direct_vm, direct_alice)
    direct_vm.clear_mocks()
    mock_page(direct_vm, BAD_PAGE)
    mock_snapshot(direct_vm, TS, SNAP_PAGE_NO_DATE, served=late_capture())
    mock_verdict(direct_vm, "FULFILLED", source=2, quote=QUOTE, date_quote="", date="")
    warp_later(direct_vm, HOUR // 2 + 100)  # halfway to the deadline, which is still ahead
    sender(direct_vm, direct_alice)
    c.judge(vid)
    r = row(c, vid)
    assert r["state"] == OPEN and r["note"].startswith("Checked early"), r

    direct_vm.clear_mocks()
    mock_page(direct_vm, BAD_PAGE)
    mock_snapshot(direct_vm, TS, SNAP_PAGE_NO_DATE)
    mock_verdict(direct_vm, "FULFILLED", source=2, quote=QUOTE, date_quote="", date="")
    warp_later(direct_vm, HOUR // 2 + 100 + 1000)  # past the gap between early checks
    c.judge(vid)
    r = row(c, vid)
    assert r["state"] == REVIEW and r["proposed"] == KEPT and r["proof"]["tier"] == "snapshot"


# ---- consensus --------------------------------------------------------------------------------------------------

def test_a_validator_that_gets_a_different_capture_does_not_agree(direct_vm, direct_deploy, direct_alice):
    """The leader is served the capture it asked for and rules KEPT on it. A validator whose own fetch is answered
    from another capture reaches a different verdict, so the leader's result is not accepted."""
    c = deploy(direct_deploy)
    vid = pinned_vow(c, direct_vm, direct_alice)
    direct_vm.clear_mocks()
    mock_snapshot(direct_vm, TS, SNAP_PAGE_NO_DATE)
    r = rule_on_pin(c, direct_vm, direct_alice, vid)
    assert r["proposed"] == KEPT
    assert direct_vm.run_validator() is True

    direct_vm.clear_mocks()
    mock_page(direct_vm, BAD_PAGE)
    mock_snapshot(direct_vm, TS, SNAP_PAGE_NO_DATE, served=late_capture())
    mock_verdict(direct_vm, "FULFILLED", source=2, quote=QUOTE, date_quote="", date="")
    assert direct_vm.run_validator() is False
