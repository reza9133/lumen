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
    pay(vm, keeper, stake)
    c.make_vow(text, PROOF_URL, int(time.time()) + secs)
    vm.value = 0
    return json.loads(c.stats())["total"] - 1


def back(c, vm, who, vow_id, side, wei):
    pay(vm, who, wei)
    c.back(vow_id, side)
    vm.value = 0


def mock_page(vm, body="Chapter one was published on the blog.", status=200):
    vm.mock_web(r".*proof\.example\.org.*", {"status": status, "body": body})


def mock_verdict(vm, verdict, note="The page shows the result."):
    # Double-encoded: the harness decodes the mock once, the SDK decodes it again.
    vm.mock_llm(r".*", json.dumps(json.dumps({"verdict": verdict, "note": note})))


def judge(c, vm, caller, vow_id, verdict="FULFILLED", after=3600 + 120):
    mock_page(vm, "x" * 400 if verdict != "BROKEN" else "A page about something else entirely, with plenty of text.")
    mock_verdict(vm, verdict)
    warp_later(vm, after)
    vm.sender = caller
    c.judge(vow_id)


def mock_counter(vm, body="The chapter was never published. The archive from 3 May shows an empty blog.", status=200):
    vm.mock_web(r".*counter\.example\.net.*", {"status": status, "body": body})


def sender(vm, who):
    vm.sender = who
    vm.value = 0
