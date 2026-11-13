"""The frontend copies a few things from the contract: the limits, the keeper tiers, the state numbers, the
payout rules and the wording of every refusal it explains to the user. These tests fail when a copy drifts.

Run:  pytest tests/direct/test_frontend_parity.py -v
"""

import ast
import json
import re
import shutil
import subprocess
from pathlib import Path

import pytest

from conftest import CONTRACT

ROOT = Path(__file__).resolve().parents[2]
FRONTEND = ROOT / "frontend"
SOURCE = (ROOT / CONTRACT).read_text()


def ts_constants():
    """`export const NAME = <expression>;` from limits.ts, with the expressions evaluated."""
    text = (FRONTEND / "src" / "limits.ts").read_text()
    out = {}
    for m in re.finditer(r"^export const ([A-Z_]+) = ([^;\n]+?);", text, re.M):
        expr = re.sub(r"(\d+)n\b", r"\1", m.group(2))
        if re.fullmatch(r"[\d\s*+()\-]+", expr.replace("**", "*")):
            out[m.group(1)] = eval(expr, {"__builtins__": {}})  # digits and arithmetic only, checked above
    return out


def ts_tiers():
    text = (FRONTEND / "src" / "limits.ts").read_text()
    block = text[text.index("export const TIERS"):]
    block = block[: block.index("];")]
    tiers = []
    for m in re.finditer(r'\{ name: "(\w+)", kept: (\d+), keptStake: ([^,]+), brokenDiv: (\d+) \}', block):
        stake = eval(re.sub(r"(\d+)n\b", r"\1", m.group(3)), {"__builtins__": {}})
        tiers.append({"name": m.group(1), "kept": int(m.group(2)), "kept_stake": str(stake), "broken_div": int(m.group(4))})
    return tiers


def contract_refusals():
    """Every message the contract raises as a UserError, except the validator-side [LLM_ERROR] ones. One helper
    (`_place`) takes its message as an argument, so the strings passed to it count as refusals too."""
    tree = ast.parse(SOURCE)
    found = set()
    for node in ast.walk(tree):
        if not (isinstance(node, ast.Call) and isinstance(node.func, ast.Attribute)):
            continue
        if node.func.attr == "UserError":
            arg = node.args[0]
            if isinstance(arg, ast.Constant) and isinstance(arg.value, str):
                found.add(arg.value)
            else:
                assert isinstance(arg, ast.Name) and arg.id == "full_msg", f"line {node.lineno}: refusals must be plain strings"
        elif node.func.attr == "_place":
            last = node.args[-1]
            assert isinstance(last, ast.Constant) and isinstance(last.value, str), f"line {node.lineno}: _place needs a plain message"
            found.add(last.value)
    return {m for m in found if not m.startswith("[LLM_ERROR]")}


def frontend_refusals():
    text = (FRONTEND / "src" / "chain.ts").read_text()
    block = text[text.index("const CONTRACT_ERRORS = ["):]
    block = block[: block.index("];")]
    return [json.loads(m.group(0)) for m in re.finditer(r'"(?:[^"\\]|\\.)*"', block)]


def test_limits_match_params(direct_vm, direct_deploy):
    p = json.loads(direct_deploy(CONTRACT).params())
    ts = ts_constants()
    checked = 0
    for name, value in ts.items():
        key = name.lower()
        if key in p and not isinstance(p[key], (dict, list)):
            assert int(p[key]) == int(value), f"limits.ts {name} = {value}, contract params()[{key!r}] = {p[key]}"
            checked += 1
    assert checked >= 22, f"only {checked} limits were compared"
    # every limit the contract reports is known to the frontend
    reported = {k for k, v in p.items() if k not in ("version", "tiers", "states") and not isinstance(v, (dict, list))}
    missing = sorted(k for k in reported if k.upper() not in ts)
    assert not missing, f"limits.ts does not define {missing}"


def test_tiers_match_params(direct_vm, direct_deploy):
    p = json.loads(direct_deploy(CONTRACT).params())
    assert ts_tiers() == p["tiers"]


def test_state_numbers_match_params(direct_vm, direct_deploy):
    p = json.loads(direct_deploy(CONTRACT).params())
    ts = ts_constants()
    for name, number in p["states"].items():
        assert ts[name.upper()] == number, f"state {name}: limits.ts {ts[name.upper()]}, contract {number}"


def test_every_refusal_is_explained_by_the_frontend():
    ours = set(frontend_refusals())
    missing = sorted(contract_refusals() - ours)
    assert not missing, f"the frontend does not know these refusals: {missing}"


def test_the_frontend_lists_no_refusal_the_contract_lacks():
    stale = sorted(set(frontend_refusals()) - contract_refusals())
    assert not stale, f"chain.ts lists refusals the contract never raises: {stale}"


def test_frontend_refusals_have_no_duplicates():
    msgs = frontend_refusals()
    assert len(msgs) == len(set(msgs))


def test_contract_refusals_are_found():
    assert len(contract_refusals()) >= 40


@pytest.mark.skipif(shutil.which("node") is None, reason="node is not installed")
def test_payout_preview_replays_the_contract_vectors():
    """frontend/scripts/payout-vectors.json holds outputs of the contract's `_owed`; payout.ts must reproduce them."""
    run = subprocess.run(
        ["node", "--experimental-strip-types", "scripts/check-payout.mjs"], cwd=FRONTEND, capture_output=True, text=True, timeout=120
    )
    assert run.returncode == 0, run.stderr[-800:]
    assert "payout preview ok" in run.stdout


def test_payout_vectors_are_current(tmp_path):
    """Regenerating the vectors from the contract gives the file that is committed."""
    import importlib.util

    spec = importlib.util.spec_from_file_location("gen_vectors", ROOT / "tests" / "tools" / "gen_payout_vectors.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    owed, ns = mod.load_owed()
    committed = json.loads((FRONTEND / "scripts" / "payout-vectors.json").read_text())
    assert len(committed) >= 200
    for state, keeper, f, d, stake, faith, doubt, want in committed:
        assert str(owed(state, keeper, int(f), int(d), int(stake), int(faith), int(doubt))) == want
    assert {r[0] for r in committed} == {ns["KEPT"], ns["BROKEN"], ns["UNCLEAR"], ns["RETRACTED"]}
