"""Shared helpers for the direct-mode suite (genlayer-test fixtures)."""

import json
import time
from datetime import datetime, timezone

CONTRACT = "contracts/lumen.py"
GEN = 10**18
PROOF_URL = "https://proof.example.org/log"
COUNTER_URL = "https://counter.example.net/what-happened"


def hexof(a) -> str:
    v = getattr(a, "as_hex", None)
    if isinstance(v, str):
        return v.lower()
    b = getattr(a, "as_bytes", None)
    if b is not None:
        return "0x" + bytes(b).hex()
    return str(a).lower()


def fund(vm, who, amount=100 * GEN):
    try:
        vm.deal(who, amount)
    except Exception:
        pass


def warp_later(vm, seconds: int) -> None:
    later = datetime.fromtimestamp(time.time() + seconds, tz=timezone.utc)
    vm.warp(later.strftime("%Y-%m-%dT%H:%M:%SZ"))


def pay(vm, who, wei):
    """Attach value to the next call made by `who`."""
    fund(vm, who)
    vm.sender = who
    vm.value = wei


def make_vow(c, vm, keeper, stake=GEN, text="Publish the first chapter of my essay series", secs=3600):
    warp_later(vm, 0)  # vows are always made "now", also after an earlier step moved the clock forward
    pay(vm, keeper, stake)
    c.make_vow(text, PROOF_URL, int(time.time()) + secs)
    vm.value = 0
    return json.loads(c.stats())["total"] - 1


def back(c, vm, who, vow_id, side, wei):
    pay(vm, who, wei)
    c.back(vow_id, side)
    vm.value = 0


GOOD_QUOTE = "Chapter one of the essay series was published"
GOOD_DATE_QUOTE = "published on 2020-01-15"
GOOD_DATE = "2020-01-15"
GOOD_PAGE = f"{GOOD_QUOTE} on the blog, published on 2020-01-15. Read it and share it with a friend."
BAD_PAGE = "A page about something else entirely, with plenty of text."
REVIEW_WAIT = 1300  # longer than the review window of a one hour vow with editable evidence (1200 s)


def mock_page(vm, body=GOOD_PAGE, status=200):
    vm.mock_web(r".*proof\.example\.org.*", {"status": status, "body": body})


def verdict_reply(verdict, note="The page shows the result.", source=1, quote=GOOD_QUOTE, date_quote=GOOD_DATE_QUOTE, date=GOOD_DATE):
    out = {"verdict": verdict, "note": note}
    if verdict == "FULFILLED":
        out.update({"source": source, "quote": quote, "date_quote": date_quote, "completed_on": date})
    return out


def mock_verdict(vm, verdict, note="The page shows the result.", **proof):
    """The judge's first answer (about the keeper's evidence). It only matches the first prompt, which
    carries <source> blocks. The reply is double-encoded: the harness decodes the mock once, the SDK again."""
    vm.mock_llm(r"<source n=", json.dumps(json.dumps(verdict_reply(verdict, note, **proof))))


def mock_counter_verdict(vm, contradicted=True, counter=1, quote="The archive from 3 May shows an empty blog."):
    """The judge's second answer (about counter-evidence). It only matches the prompt that carries <claim>."""
    vm.mock_llm(r"<claim>", json.dumps(json.dumps({"contradicted": contradicted, "counter": counter, "quote": quote})))


def propose(c, vm, caller, vow_id, verdict="FULFILLED", after=3600 + 120):
    mock_page(vm, GOOD_PAGE if verdict != "BROKEN" else BAD_PAGE)
    mock_verdict(vm, verdict)
    warp_later(vm, after)
    vm.sender = caller
    vm.value = 0
    c.judge(vow_id)


def settle(c, vm, vow_id, at=3600 + 120 + REVIEW_WAIT, caller=None):
    """End the review window and close the vow."""
    warp_later(vm, at)
    vm.sender = caller if caller is not None else vm.sender
    vm.value = 0
    c.finalize(vow_id)


def judge(c, vm, caller, vow_id, verdict="FULFILLED", after=3600 + 120):
    """Propose a verdict and let the review window pass. UNCLEAR is final straight away."""
    propose(c, vm, caller, vow_id, verdict, after)
    if json.loads(c.get_vow(vow_id))["state"] == 4:
        settle(c, vm, vow_id, after + REVIEW_WAIT)


def mock_counter(vm, body="The chapter was never published. The archive from 3 May shows an empty blog.", status=200):
    vm.mock_web(r".*counter\.example\.net.*", {"status": status, "body": body})


def sender(vm, who):
    vm.sender = who
    vm.value = 0
