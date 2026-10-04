"""Pure tests for page handling and the evidence-address rule. No VM needed: the helpers are loaded
straight from the contract source.

Run:  pytest tests/direct/test_hardening.py -v
"""

import re
import time
from pathlib import Path

PAGE_CHARS = 6000
MAX_RAW = 300_000


def load():
    src = (Path(__file__).resolve().parents[2] / "contracts" / "lumen.py").read_text()
    ns = {"re": re, "PAGE_CHARS": PAGE_CHARS, "MAX_RAW": MAX_RAW}
    exec(src[src.index("# A public web address"):src.index("@gl.evm.contract_interface")], ns)
    exec(src[src.index("def _clean"):src.index("def _entries")], ns)
    return ns["_strip_markup"], ns["_valid_url"]


def test_markup_is_removed_and_text_is_kept():
    strip, _ = load()
    html = "<html><head><style>p{color:red}</style><SCRIPT>var a = '<b>';</SCRIPT></head><body><p>Chapter <b>one</b> is out.</p><noscript>no js</noscript></body></html>"
    assert strip(html) == "Chapter one is out."


def test_only_exact_tag_names_are_dropped():
    strip, _ = load()
    assert strip("<p>Read the <scripture>text</scripture> here</p>") == "Read the text here"
    assert strip("<p>A <styled>block</styled> here</p>") == "A block here"


def test_a_lone_angle_bracket_is_text_not_a_tag():
    strip, _ = load()
    assert strip("<p>I shipped 3 items, so a < b but c > d.</p>") == "I shipped 3 items, so a ( b but c ) d."


def test_comments_are_removed_whole():
    strip, _ = load()
    assert strip("<p>Hello</p><!-- a > b hidden -->visible") == "Hello visible"


def test_an_unclosed_script_drops_the_rest_of_the_page():
    strip, _ = load()
    assert strip("Before <script>alert(1) and then everything else") == "Before"


def test_hostile_pages_are_handled_in_linear_time():
    strip, _ = load()
    pages = [
        "<script>" * 40_000,                      # many unclosed script tags
        "<script></script" * 20_000,              # closing tags without '>'
        "<" * 300_000,                            # lone angle brackets
        "<a " * 100_000 + ">" ,                   # one huge tag
        "<style>" * 20_000 + "text " * 40_000,
    ]
    for page in pages:
        t = time.time()
        strip(page)
        assert time.time() - t < 1.0, page[:20]


def test_only_the_first_part_of_a_huge_page_is_read():
    strip, _ = load()
    out = strip("a " * 10**6)
    assert len(out) <= PAGE_CHARS


def test_evidence_address_rule():
    _, valid = load()
    for ok in ["https://proof.example.org/log", "http://example.com", "https://a.b.example.co.uk/x?y=1#z", "https://example.com:443/p", "https://xn--e1afmkfd.xn--p1ai/x"]:
        assert valid(ok), ok
    for bad in [
        "ftp://x.com", "https://localhost/x", "http://127.0.0.1/x", "https://example.com:8080/", "https://user@example.com/",
        "https://a.com@127.0.0.1/", "https://example.local/x", "https://exa mple.com", "https://example", "HTTPS://example.com",
        # names that resolve to private addresses, or look like addresses
        "http://127.0.0.1.nip.io/x", "http://169.254.169.254.nip.io/latest/meta-data", "https://localtest.me/",
        "http://169.254.169.254.example.com/", "https://foo.test/", "https://A.NIP.IO/x", "https://x.sslip.io/",
    ]:
        assert not valid(bad), bad
