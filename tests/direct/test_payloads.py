"""How much a client reads from the chain to stay in sync, and how that cost grows.

Version 1 of the app re-read `stats` plus the whole first page of `list_vows` every twelve seconds. Version 2 asks
`pulse` (a revision number) and fetches only the vows that changed. These tests keep that promise as a bound and
print the sizes, so the numbers in docs/PERFORMANCE.md can be reproduced:

    pytest tests/direct/test_payloads.py -s

Set LUMEN_V1_CONTRACT=/path/to/the/version-1/lumen.py to print the version 1 page size next to them.
"""

import json
import os

import pytest

from conftest import CONTRACT, GEN, back, make_vow, pay

VOWS = 60  # one full page, the most the app loads at start
KEEPERS = 6


def size(text: str) -> int:
    return len(text.encode())


def fill(c, vm, accounts, n=VOWS):
    """n vows spread over the accounts, most of them backed on both sides, a few with progress notes."""
    for i in range(n):
        keeper = accounts[i % KEEPERS]
        other = accounts[(i + 1) % KEEPERS]
        third = accounts[(i + 2) % KEEPERS]
        vid = make_vow(c, vm, keeper, GEN, f"Vow number {i}: publish the next chapter of my essay series", 7200 + i)
        if i % 3 != 2:
            back(c, vm, other, vid, "faith", GEN // 5)
            back(c, vm, third, vid, "doubt", GEN // 10)
        if i % 5 == 0 and hasattr(c, "post_update"):
            pay(vm, keeper, 0)
            c.post_update(vid, "Outline is done and the first draft is half written.")
            vm.value = 0


@pytest.fixture
def accounts(direct_accounts):
    return list(direct_accounts[:KEEPERS])


def test_an_idle_poll_is_tiny_and_does_not_grow_with_the_number_of_vows(direct_vm, direct_deploy, accounts):
    c = direct_deploy(CONTRACT)
    fill(c, direct_vm, accounts, 6)
    small = size(c.pulse())
    fill(c, direct_vm, accounts, VOWS)
    large = size(c.pulse())
    full_page = size(c.list_vows(0, VOWS)) + size(c.stats())
    print(f"\n  pulse with 6 vows: {small} B, with {6 + VOWS} vows: {large} B; stats + list_vows page: {full_page} B")
    assert large <= 60
    assert large - small <= 4  # only the digits of the counters can grow
    assert large * 100 < full_page


def test_a_poll_after_one_change_carries_only_that_vow(direct_vm, direct_deploy, accounts):
    c = direct_deploy(CONTRACT)
    fill(c, direct_vm, accounts)
    rev = json.loads(c.pulse())["rev"]
    back(c, direct_vm, accounts[3], 0, "doubt", GEN // 50)
    delta = c.changes_since(rev)
    body = json.loads(delta)
    page = size(c.list_vows(0, VOWS))
    print(f"\n  changes_since after one change: {size(delta)} B ({len(body['rows'])} vow), full page: {page} B")
    assert body["reset"] is False and [r["id"] for r in body["rows"]] == [0]
    assert size(delta) * 20 < page  # at most a twentieth of reloading the page


def test_the_cost_of_a_quiet_minute(direct_vm, direct_deploy, accounts):
    """Per minute the old client read the page five times; the new one reads a revision five times and, when
    something changed, the changed vows once."""
    c = direct_deploy(CONTRACT)
    fill(c, direct_vm, accounts)
    page = size(c.list_vows(0, VOWS)) + size(c.stats())
    old_per_minute = 5 * page
    new_per_minute = 5 * size(c.pulse())
    print(f"\n  quiet minute, old client: {old_per_minute} B; new client: {new_per_minute} B")
    assert new_per_minute * 200 < old_per_minute


def test_version_1_page_size_for_comparison(direct_vm, direct_deploy, accounts):
    """The harness loads one contract per test, so this one measures version 1 alone; compare with the numbers above."""
    path = os.environ.get("LUMEN_V1_CONTRACT")
    if not path:
        pytest.skip("LUMEN_V1_CONTRACT is not set")
    old = direct_deploy(path)
    fill(old, direct_vm, accounts)
    page = size(old.list_vows(0, VOWS)) + size(old.stats())
    print(f"\n  version 1 stats + list_vows page: {page} B (every poll, every twelve seconds)")
    assert page > 0
