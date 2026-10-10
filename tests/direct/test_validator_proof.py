"""Validators cross-check the proof a leader hands back, not just its verdict and quote. No VM needed: the
module-level code of the contract is loaded with a stubbed `genlayer`, and `_adjudicate` is driven with a fake
consensus step (the leader runs, then a validator re-runs and judges the leader's result).

A leader that rules KEPT on a page and labels it a "snapshot" (or gives it another capture day) would otherwise
get the stronger standing and the shorter review window the tier carries, with the verdict still matching.

Run:  pytest tests/direct/test_validator_proof.py -v
"""

import json
import sys
import types
from datetime import datetime, timezone
from pathlib import Path
from unittest.mock import MagicMock

import pytest

QUOTE = "Chapter one of the essay series was published"
PAGE = f"<html><body>{QUOTE} on the blog. " + "More text. " * 30 + "</body></html>"
TS = "20200115120000"
DEADLINE = int(datetime(2020, 2, 1, tzinfo=timezone.utc).timestamp())
NOW = int(datetime(2020, 3, 1, tzinfo=timezone.utc).timestamp())
MAIN = "https://blog.example.org/post"
SNAP = f"https://web.archive.org/web/{TS}/https://blog.example.org/post"


class Return:
    def __init__(self, calldata):
        self.calldata = calldata


class Res:
    def __init__(self, status=200, headers=None, body=PAGE):
        self.status, self.headers, self.body = status, headers or {}, body


def memento(ts):
    return datetime.strptime(ts, "%Y%m%d%H%M%S").strftime("%a, %d %b %Y %H:%M:%S GMT")


@pytest.fixture()
def lumen(monkeypatch):
    gl = MagicMock()
    gl.vm.Return = Return
    gl.vm.Result = object
    gl.vm.UserError = type("UserError", (Exception,), {})
    stub = types.ModuleType("genlayer")
    for name in ("Address", "DynArray", "TreeMap", "u8", "u32", "u64", "u256"):
        setattr(stub, name, MagicMock())
    stub.allow_storage = lambda cls: cls
    stub.gl = gl
    monkeypatch.setitem(sys.modules, "genlayer", stub)

    src = (Path(__file__).resolve().parents[2] / "contracts" / "lumen.py").read_text()
    src = src.replace("from genlayer import *", "from genlayer import gl, Address, DynArray, TreeMap, allow_storage, u8, u32, u64, u256")
    ns = {"__name__": "lumen"}
    exec(compile(src[: src.index("class Lumen(")], "lumen.py", "exec"), ns)
    return ns, gl


def fake_consensus(gl):
    """run_nondet_unsafe: the leader runs, then one validator checks the leader's result. Returns (result, agreed)."""
    def run(leader_fn, validator_fn):
        return leader_fn(), validator_fn
    gl.vm.run_nondet_unsafe = run


def adjudicate(lumen, replies, web, validator_web=None, forge=None):
    """Run the leader on `web`, optionally forge fields of its proof, then let a validator (served `validator_web`,
    by default the same pages) judge the leader's result. Returns (leader result, validator accepted it)."""
    ns, gl = lumen
    fake_consensus(gl)
    gl.nondet.web.get = lambda url: web[url]
    gl.nondet.web.render = MagicMock(return_value="")
    gl.nondet.exec_prompt = lambda prompt, response_format=None: json.dumps(replies)
    result, validator_fn = ns["_adjudicate"](
        "Publish the first chapter of my essay series", [MAIN, SNAP], DEADLINE, [], False, 20, NOW
    )
    assert result["verdict"] == "FULFILLED", result
    if forge:
        result = {**result, "proof": {**result["proof"], **forge}}
    pages = validator_web if validator_web is not None else web
    gl.nondet.web.get = lambda url: pages[url]
    return result, validator_fn(Return(result))


REPLY = {"verdict": "FULFILLED", "note": "ok", "source": 2, "quote": QUOTE, "date_quote": "", "completed_on": ""}
BAD_MAIN = Res(body="<html>A page about something else entirely, with plenty of text in it.</html>")


def archive(served_ts=TS):
    return Res(headers={"Memento-Datetime": memento(served_ts)})


def test_an_honest_leader_on_a_confirmed_snapshot_is_accepted(lumen):
    result, ok = adjudicate(lumen, REPLY, {MAIN: BAD_MAIN, SNAP: archive()})
    assert ok is True
    assert result["proof"]["tier"] == "snapshot" and result["proof"]["date"] == "2020-01-15"


def test_a_validator_served_another_capture_does_not_accept_the_snapshot_label(lumen):
    """The pinned page itself shows a dated line, so the verdict is KEPT whichever way the capture is read. The
    leader is served the exact capture (tier snapshot). The validator is served a capture from after the deadline,
    reads the same page as editable and still reaches KEPT, but it cannot confirm the snapshot, so the result is
    not accepted. Before the tier was cross-checked, verdict and quote matched and it was."""
    dated = Res(headers={"Memento-Datetime": memento(TS)}, body=f"<html>{QUOTE}, published on 2020-01-15. " + "More text. " * 30 + "</html>")
    late = Res(headers={"Memento-Datetime": memento("20200215120000")}, body=dated.body)
    reply = {**REPLY, "date_quote": "published on 2020-01-15", "completed_on": "2020-01-15"}
    result, ok = adjudicate(lumen, reply, {MAIN: BAD_MAIN, SNAP: dated})
    assert ok is True and result["proof"]["tier"] == "snapshot"

    result, ok = adjudicate(lumen, reply, {MAIN: BAD_MAIN, SNAP: dated}, validator_web={MAIN: BAD_MAIN, SNAP: late})
    assert result["proof"]["tier"] == "snapshot"
    assert ok is False


def test_a_forged_tier_is_rejected_even_when_the_verdict_matches(lumen):
    """The page is a plain editable one and the model rules KEPT on a dated line. The leader relabels the proof
    as a snapshot. Verdict and quote match the validator's own run; only the tier is false."""
    dated = Res(body=f"<html>{QUOTE}, published on 2020-01-15. " + "More text. " * 30 + "</html>")
    reply = {**REPLY, "source": 1, "date_quote": "published on 2020-01-15", "completed_on": "2020-01-15"}
    result, ok = adjudicate(lumen, reply, {MAIN: dated, SNAP: archive()})
    assert ok is True and result["proof"]["tier"] == "mutable"

    _, ok = adjudicate(lumen, reply, {MAIN: dated, SNAP: archive()}, forge={"tier": "snapshot"})
    assert ok is False
    _, ok = adjudicate(lumen, reply, {MAIN: dated, SNAP: archive()}, forge={"tier": "permalink"})
    assert ok is False


def test_a_forged_snapshot_date_is_rejected(lumen):
    _, ok = adjudicate(lumen, REPLY, {MAIN: BAD_MAIN, SNAP: archive()}, forge={"date": "2019-12-31"})
    assert ok is False


def test_a_forged_downgrade_is_rejected_too(lumen):
    """A proof that really is a snapshot cannot be relabelled either way; the validator's own tier is the truth."""
    _, ok = adjudicate(lumen, REPLY, {MAIN: BAD_MAIN, SNAP: archive()}, forge={"tier": "mutable"})
    assert ok is False


@pytest.mark.parametrize("bad", [None, 7, ["x"], {"a": 1}])
def test_a_malformed_proof_url_is_rejected_without_error(lumen, bad):
    _, ok = adjudicate(lumen, REPLY, {MAIN: BAD_MAIN, SNAP: archive()}, forge={"url": bad})
    assert ok is False


def test_a_proof_that_is_not_an_object_is_rejected(lumen):
    _, ok = adjudicate(lumen, REPLY, {MAIN: BAD_MAIN, SNAP: archive()}, forge=None)
    assert ok is True  # sanity: the honest result passes
    ns, gl = lumen
    fake_consensus(gl)
    gl.nondet.web.get = lambda url: {MAIN: BAD_MAIN, SNAP: archive()}[url]
    result, validator_fn = ns["_adjudicate"]("Publish the first chapter of my essay series", [MAIN, SNAP], DEADLINE, [], False, 20, NOW)
    assert validator_fn(Return({**result, "proof": "snapshot"})) is False
