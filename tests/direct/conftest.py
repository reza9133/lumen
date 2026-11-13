"""Shared helpers for the direct-mode suite (genlayer-test fixtures)."""

import json
import re
import time
from datetime import datetime, timezone

# Harness compatibility. In genlayer-test 0.29.x the first mock whose pattern matches wins, so a test that
# registers a second answer for the same pattern would silently keep getting the first one. The suite is
# written for "the latest mock wins", so registering a pattern again replaces the earlier registration.
try:
    from gltest.direct.vm import VMContext as _VMContext

    _orig_mock_llm = _VMContext.mock_llm
    _orig_mock_web = _VMContext.mock_web

    def _mock_llm_latest(self, prompt_pattern, response):
        self._llm_mocks[:] = [(p, r) for p, r in self._llm_mocks if p.pattern != prompt_pattern]
        _orig_mock_llm(self, prompt_pattern, response)

    def _mock_web_latest(self, url_pattern, response):
        method = response.get("method", "GET")
        self._web_mocks[:] = [(p, r) for p, r in self._web_mocks if not (p.pattern == url_pattern and r.get("method", "GET") == method)]
        _orig_mock_web(self, url_pattern, response)

    _VMContext.mock_llm = _mock_llm_latest
    _VMContext.mock_web = _mock_web_latest
except Exception:  # a harness without these internals keeps its own behaviour
    pass

# The same harness drops the "headers" of a flat web mock. Archive authentication reads Memento-Datetime and
# Location, so the mock has to hand them to the contract.
try:
    from gltest.direct import wasi_mock as _wasi_mock

    _orig_web_request = _wasi_mock._handle_web_request

    def _web_request_with_headers(vm, data):
        out = _orig_web_request(vm, data)
        try:
            mock = vm._match_web_mock(data.get("url", ""), data.get("method", "GET"))
            if mock and "response" not in mock and mock.get("headers"):
                out["ok"]["response"]["headers"] = dict(mock["headers"])
        except Exception:
            pass
        return out

    _wasi_mock._handle_web_request = _web_request_with_headers
except Exception:
    pass

CONTRACT = "contracts/lumen.py"
GEN = 10**18
PROOF_URL = "https://proof.example.org/log"
COUNTER_URL = "https://counter.example.net/what-happened"


def hexof(a) -> str:
    if isinstance(a, (bytes, bytearray)):  # the fixtures are raw 20-byte accounts in some harness versions
        return "0x" + bytes(a).hex()
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


# ---- Wayback Machine replays ---------------------------------------------------------------------------------
# A replay of an exact capture carries a Memento-Datetime header, set by the archive. A link for a time without a
# capture is answered with the nearest one, either by a redirect or by serving that capture directly.

ARCHIVE_PAGE = "https://blog.example.org/chapter-one"


def memento(ts: str) -> str:
    """"20200115120000" -> "Wed, 15 Jan 2020 12:00:00 GMT" (the format of the archive's Memento-Datetime header)."""
    return datetime.strptime(ts, "%Y%m%d%H%M%S").strftime("%a, %d %b %Y %H:%M:%S GMT")


def snapshot_url(ts: str, flag: str = "") -> str:
    return f"https://web.archive.org/web/{ts}{flag}/{ARCHIVE_PAGE}"


def mock_snapshot(vm, ts, body, served=None, status=200, headers=None, flag=""):
    """The archive answers a request for capture `ts`. By default it serves exactly that capture; `served` names
    the capture it really serves instead. A `headers` value of None removes that header."""
    h = {"memento-datetime": memento(served or ts), "content-type": "text/html"}
    h.update(headers or {})
    h = {k: v for k, v in h.items() if v is not None}
    vm.mock_web(r"web\.archive\.org/web/" + ts + flag + "/", {"status": status, "body": body, "headers": h})


def mock_redirect(vm, ts, to, status=302, location=None, flag=""):
    """The archive redirects a request for capture `ts` to another address (by default the capture `to`)."""
    loc = location if location is not None else f"/web/{to}/{ARCHIVE_PAGE}"
    vm.mock_web(r"web\.archive\.org/web/" + ts + flag + "/", {"status": status, "body": "", "headers": {"location": loc}})
