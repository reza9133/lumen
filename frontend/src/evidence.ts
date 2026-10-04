import type { Vow } from "./chain";

// Same rule as the contract: a named domain, no IP address, credentials or custom port.
const URL_RE =
  /^https?:\/\/((?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?\.)+([A-Za-z]{2,24}|xn--[A-Za-z0-9-]{1,59}))(?::(?:80|443))?(?:[/?#]\S*)?$/;
const BLOCKED_TLDS = [
  "local", "localhost", "internal", "lan", "home", "corp", "intranet",
  "test", "invalid", "example", "onion", "arpa", "localdomain",
];
const BLOCKED_SUFFIXES = ["nip.io", "sslip.io", "xip.io", "localtest.me", "lvh.me", "traefik.me"];
// Limits the contract enforces (MAX_TEXT, MIN text length, MAX_URL).
export const MAX_TEXT = 280;
export const MIN_TEXT = 8;
export const MAX_URL = 300;
const IP_LABELS = /(?:^|\.)\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}(?:\.|$)/;

// The address as the contract wants it: lower-case scheme, punycode host, default port dropped.
// Returns null for anything that is not a plain http(s) link without whitespace.
export function normalizeUrl(raw: string): string | null {
  const t = raw.trim();
  if (t === "" || /[\s\u0000-\u001f]/.test(t)) return null;
  try {
    const u = new URL(t);
    return u.protocol === "http:" || u.protocol === "https:" ? u.href : null;
  } catch {
    return null;
  }
}

// The same text the contract stores: unprintable characters become spaces, < and > become
// parentheses, runs of whitespace collapse, and the result is cut to MAX_TEXT characters.
// Showing and submitting this form keeps the length check identical on both sides.
export function cleanText(raw: string): string {
  const spaced = raw.replace(/[\p{C}\p{Z}]/gu, (ch) => (ch === " " ? ch : " "));
  const out = spaced.replace(/</g, "(").replace(/>/g, ")").split(/\s+/).filter(Boolean).join(" ");
  return Array.from(out).slice(0, MAX_TEXT).join("");
}

export const isVowText = (raw: string): boolean => Array.from(cleanText(raw)).length >= MIN_TEXT;

export const URL_HINT = `Use a link to a named website, without an IP address, login or custom port, and at most ${MAX_URL} characters.`;

export function isEvidenceUrl(raw: string): boolean {
  const url = normalizeUrl(raw);
  if (url === null || url.length > MAX_URL) return false;
  const m = URL_RE.exec(url);
  if (m === null) return false;
  const host = m[1].toLowerCase();
  if (BLOCKED_TLDS.includes(m[2].toLowerCase()) || IP_LABELS.test(host)) return false;
  return !BLOCKED_SUFFIXES.some((s) => host === s || host.endsWith(`.${s}`));
}

export type EvidenceKind = "record" | "archive" | "editable";

// A hint, not a check: it only looks at the shape of the address.
export function evidenceKind(raw: string): EvidenceKind {
  let u: URL;
  try {
    u = new URL(raw.trim());
  } catch {
    return "editable";
  }
  const host = u.hostname.toLowerCase().replace(/^www\./, "");
  if (host === "web.archive.org" && /^\/web\/\d{4,}/.test(u.pathname)) return "archive";
  if (["archive.ph", "archive.today", "archive.is"].includes(host)) return "archive";
  if (
    ["github.com", "gitlab.com", "codeberg.org", "bitbucket.org"].includes(host) &&
    /\/(commit|commits|pull|pulls|issues|merge_requests|releases)(\/|$)/.test(u.pathname)
  ) {
    return "record";
  }
  return "editable";
}

export const KIND_LABEL: Record<EvidenceKind, string> = {
  record: "public record",
  archive: "archived snapshot",
  editable: "editable by its owner",
};

export const EDITABLE_HINT =
  "Whoever controls this page can change it. A public commit, a release or an archived snapshot makes a stronger vow.";

// A vow still open this long after its deadline can be released: everyone is refunded.
export const RELEASE_AFTER = 30 * 86400;
export const canRelease = (v: Pick<Vow, "state" | "deadline">, now: number): boolean =>
  v.state === 0 && now >= v.deadline + RELEASE_AFTER;

// Early judging only confirms a vow: halfway to the deadline, and only while nobody doubts it.
export function canJudgeEarly(v: Pick<Vow, "state" | "created" | "deadline" | "doubt">, now: number): boolean {
  if (v.state !== 0 || now >= v.deadline || BigInt(v.doubt) > 0n) return false;
  return now >= v.created + Math.floor((v.deadline - v.created) / 2);
}
