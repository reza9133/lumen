// Run with: node --experimental-strip-types scripts/check-evidence.mjs   (Node 22.6 or newer)
import assert from "node:assert/strict";
import { MAX_URL, canDispute, canFinalize, canJudgeEarly, canRelease, cleanText, evidenceKind, isEvidenceUrl, isPinnable, isVowText, normalizeUrl, provenanceOf, reviewOpen, snapshotTime } from "../src/evidence.ts";

for (const ok of ["https://proof.example.org/log", "http://example.com", "https://a.b.example.co.uk/x?y=1#z", "https://example.com:443/p", "HTTPS://Example.com/x", "https://xn--e1afmkfd.xn--p1ai/x"]) {
  assert.equal(isEvidenceUrl(ok), true, ok);
}
for (const bad of ["ftp://x.com", "https://localhost/x", "http://127.0.0.1/x", "https://example.com:8080/", "https://user@example.com/", "https://a.com@127.0.0.1/", "https://example.local/x", "https://exa mple.com", "https://example.com/a\nb", "https://example", "http://127.0.0.1.nip.io/x", "https://localtest.me/", "http://169.254.169.254.example.com/", "https://foo.test/", "https://A.NIP.IO/x"]) {
  assert.equal(isEvidenceUrl(bad), false, bad);
}

assert.equal(normalizeUrl("HTTPS://Example.com:443/x"), "https://example.com/x");
assert.equal(normalizeUrl("https://example.com/a b"), null);
assert.equal(isEvidenceUrl("https://\u043f\u0440\u0438\u043c\u0435\u0440.\u0440\u0444/x"), true);
assert.equal(evidenceKind("https://github.com/o/r/commit/abc123"), "record");
assert.equal(evidenceKind("https://github.com/o/r/releases/tag/v1"), "record");
assert.equal(evidenceKind("https://github.com/o/r"), "editable");
assert.equal(evidenceKind("https://web.archive.org/web/20261001000000/https://example.com/"), "archive");
assert.equal(evidenceKind("https://archive.ph/abcde"), "archive");
assert.equal(evidenceKind("https://myblog.example.com/post"), "editable");

// URL length is measured on the normalized address, as the contract sees it.
assert.equal(isEvidenceUrl("https://example.com/" + "a".repeat(MAX_URL - 20)), true);
assert.equal(isEvidenceUrl("https://example.com/" + "a".repeat(MAX_URL)), false);
const long = "https://example.com/" + "\u00e9".repeat(120); // 140 typed characters, longer once percent-encoded
assert.ok(normalizeUrl(long).length > MAX_URL);
assert.equal(isEvidenceUrl(long), false);

// Vow text is counted the way the contract counts it.
assert.equal(cleanText("a  b  c  d"), "a b c d");
assert.equal(isVowText("a  b  c  d"), false); // 7 characters once cleaned
assert.equal(isVowText("a  b  c  d  e"), true);
assert.equal(cleanText("x<y>z\n\tw\u200b."), "x(y)z w .");
assert.equal(cleanText("  hello   world  "), "hello world");
assert.equal(Array.from(cleanText("z".repeat(400))).length, 280);
assert.equal(isVowText("short"), false);

const v = { state: 0, created: 1000, deadline: 1000 + 3600, doubt: "0" };
assert.equal(canJudgeEarly(v, 1000 + 1799), false);
assert.equal(canJudgeEarly(v, 1000 + 1800), true);
assert.equal(canJudgeEarly(v, 1000 + 3600), false);
assert.equal(canJudgeEarly({ ...v, doubt: "1" }, 1000 + 2000), false);
assert.equal(canJudgeEarly({ ...v, state: 1 }, 1000 + 2000), false);
const day = 86400;
assert.equal(canRelease({ state: 0, deadline: 1000 }, 1000 + 30 * day - 1), false);
assert.equal(canRelease({ state: 0, deadline: 1000 }, 1000 + 30 * day), true);
assert.equal(canRelease({ state: 1, deadline: 1000 }, 1000 + 40 * day), false);

// Provenance: the same shapes the contract recognises.
const snap = "https://web.archive.org/web/20200115120000/https://blog.example.org/chapter-one";
const sha = "a".repeat(40);
assert.equal(provenanceOf(snap), "snapshot");
assert.equal(provenanceOf("https://web.archive.org/web/2/https://blog.example.org/x"), "mutable"); // "latest", not a capture
assert.equal(provenanceOf(`https://github.com/o/r/commit/${sha}`), "permalink");
assert.equal(provenanceOf(`https://github.com/o/r/blob/${sha}/README.md`), "permalink");
assert.equal(provenanceOf("https://github.com/o/r/blob/main/README.md"), "mutable"); // a branch moves
assert.equal(provenanceOf("https://github.com/o/r/releases/tag/v1"), "mutable");
assert.equal(provenanceOf("https://gw.example.org/ipfs/Qm" + "1".repeat(44)), "permalink");
assert.equal(provenanceOf("https://myblog.example.com/post"), "mutable");
assert.equal(snapshotTime(snap), Date.UTC(2020, 0, 15, 12, 0, 0) / 1000);
assert.equal(snapshotTime("https://example.com/"), null);
const deadline = Date.UTC(2026, 9, 10) / 1000;
assert.equal(isPinnable(snap, deadline - 60, deadline), true);
assert.equal(isPinnable("https://web.archive.org/web/20990101000000/https://blog.example.org/x", deadline - 60, deadline), false); // from the future
assert.equal(isPinnable("https://blog.example.org/x", deadline - 60, deadline), false);
assert.equal(isPinnable(`https://github.com/o/r/commit/${sha}`, deadline - 60, deadline), true);

// Review window: who may dispute, when a verdict can be finalized or released.
const rv = { state: 4, review_end: 5000, proposed: 1, deadline: 3000 };
assert.equal(reviewOpen(rv, 4999), true);
assert.equal(reviewOpen(rv, 5000), false);
assert.equal(canFinalize(rv, 4999), false);
assert.equal(canFinalize(rv, 5000), true);
assert.equal(canFinalize({ ...rv, state: 1 }, 6000), false);
const doubter = { faith: "0", doubt: "10", disputed: false };
const backer = { faith: "10", doubt: "0", disputed: false };
assert.equal(canDispute(rv, doubter, false, 4000), true);
assert.equal(canDispute(rv, backer, false, 4000), false); // a kept verdict is disputed by doubters
assert.equal(canDispute(rv, doubter, false, 5000), false); // window closed
assert.equal(canDispute(rv, { ...doubter, disputed: true }, false, 4000), false);
assert.equal(canDispute({ ...rv, proposed: 2 }, backer, false, 4000), true); // a broken verdict: faith or keeper
assert.equal(canDispute({ ...rv, proposed: 2 }, { faith: "0", doubt: "0", disputed: false }, true, 4000), true);
assert.equal(canDispute({ ...rv, proposed: 2 }, doubter, false, 4000), false);
assert.equal(canRelease({ state: 4, deadline: 1000, review_end: 2000 }, 2000 + 30 * day - 1), false);
assert.equal(canRelease({ state: 4, deadline: 1000, review_end: 2000 }, 2000 + 30 * day), true);
console.log("evidence helpers ok");
