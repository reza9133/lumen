"""A bridge between the self-check of the live runner and the real contract.

The self-check (e2e/src/selfcheck.mjs) starts this file under pytest. It deploys contracts/lumen.py in direct mode,
answers one JSON command per line on stdin and prints one reply per line on stdout, each prefixed with "@@".
Web pages and the validators' judgment are mocked, so the runner's scenarios can be rehearsed against the real
contract code without a network. Nothing here is a live run.
"""

import importlib.util
import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
_spec = importlib.util.spec_from_file_location("lumen_conftest", ROOT / "tests" / "direct" / "conftest.py")
helpers = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(helpers)  # applies the harness compatibility shims

FIXTURES = ROOT / "evidence" / "fixtures"
# The harness swaps file descriptor 0 while it runs a contract call, so the command pipe is duplicated first.
COMMANDS = os.fdopen(os.dup(0), "r", encoding="utf-8")


def reply(obj):
    sys.__stdout__.write("@@" + json.dumps(obj) + "\n")
    sys.__stdout__.flush()


def address(hexstr):
    return bytes.fromhex(hexstr[2:])


def judge_replies(vm):
    """The validators of the rehearsal: a page that reports a publication on a dated day fulfils the vow."""
    ok = {
        "verdict": "FULFILLED",
        "note": "The page reports the publication.",
        "source": 1,
        "quote": "was published on 2026-01-15",
        "date_quote": "published on 2026-01-15",
        "completed_on": "2026-01-15",
    }
    no = {"verdict": "BROKEN", "note": "The page says the entry is not written yet."}
    vm.mock_llm(r"(?s)<source n=\"1\"[^>]*>[^<]*was published on 2026-01-15", json.dumps(json.dumps(ok)))
    vm.mock_llm(r"<source n=", json.dumps(json.dumps(no)))
    vm.mock_llm(r"<claim>", json.dumps(json.dumps({"contradicted": True, "counter": 1, "quote": "The latest entry on the page is 1.0.0"})))


def serve_fixtures(vm):
    for name in ("kept", "broken", "counter"):
        body = (FIXTURES / f"{name}.md").read_text()
        vm.mock_web(rf"/{name}\.md", {"status": 200, "body": body})


def test_bridge(direct_vm, direct_deploy):
    vm = direct_vm
    contract = direct_deploy(os.environ.get("LUMEN_CONTRACT") or helpers.CONTRACT)  # a mutated copy proves the runner notices bugs
    judge_replies(vm)
    serve_fixtures(vm)
    reply({"ready": True})
    for line in COMMANDS:
        line = line.strip()
        if not line:
            continue
        cmd = json.loads(line)
        if cmd["op"] == "quit":
            reply({"bye": True})
            return
        try:
            when = datetime.fromtimestamp(cmd["now"], tz=timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
            vm.warp(when)
            sender = address(cmd["sender"]) if cmd.get("sender") else address("0x" + "00" * 20)
            vm.sender = sender
            value = int(cmd.get("value", "0"))
            if value:
                helpers.fund(vm, sender, value + 10**18)
            vm.value = value
            if cmd["op"] == "write":
                snap = vm.snapshot()
                try:
                    getattr(contract, cmd["fn"])(*cmd["args"])
                except BaseException:
                    vm.revert(snap)  # a failed call leaves no trace, as on the network
                    raise
                vm.value = 0
                reply({"ok": True})
            else:
                vm.value = 0
                reply({"ok": True, "result": getattr(contract, cmd["fn"])(*cmd["args"])})
        except BaseException as e:  # a rejected call is an answer, not a crash
            vm.value = 0
            reply({"ok": False, "error": str(getattr(e, "message", None) or e)})
