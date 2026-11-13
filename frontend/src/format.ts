const fmt = new Intl.NumberFormat("en", { maximumFractionDigits: 3 });

export const gen = (wei: string | bigint) => fmt.format(Number(BigInt(wei)) / 1e18);

// Digits typed on other keyboards (Eastern Arabic and Extended Arabic-Indic) and a comma or Arabic
// decimal separator are accepted, so "0,5" and the same number in local digits both work.
export function normalizeNumber(s: string): string {
  let out = "";
  for (const ch of s.trim()) {
    const c = ch.codePointAt(0)!;
    if (c >= 0x660 && c <= 0x669) out += String(c - 0x660);
    else if (c >= 0x6f0 && c <= 0x6f9) out += String(c - 0x6f0);
    else if (ch === "," || c === 0x66b) out += ".";
    else out += ch;
  }
  return out;
}

export function parseWei(s: string): bigint | null {
  const t = normalizeNumber(s);
  if (!/^\d*\.?\d*$/.test(t) || t === "" || t === ".") return null;
  const [a, b = ""] = t.split(".");
  return BigInt(a || "0") * 10n ** 18n + BigInt((b + "0".repeat(18)).slice(0, 18));
}

export const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

export function left(deadline: number, now: number) {
  const s = deadline - now;
  if (s <= 0) return "Deadline passed";
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d) return `${d}d ${h}h left`;
  if (h) return `${h}h ${m}m left`;
  return `${m}m ${s % 60}s left`;
}

const FIRST = ["Amber", "Ember", "Quiet", "Silver", "Copper", "Velvet", "Hollow", "Bright", "Slow", "Wild", "Gentle", "Iron", "Pale", "Lucky", "Northern", "Tidal"];
const SECOND = ["Heron", "Fox", "Lantern", "Sparrow", "Willow", "Comet", "Otter", "Moth", "Reed", "Finch", "Harbor", "Thistle", "Owl", "Kestrel", "Juniper", "Marten"];

export function hash01(s: string, salt = 0): number {
  let h = 2166136261 ^ salt;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 100000) / 100000;
}

export const alias = (addr: string) => {
  const a = addr.toLowerCase();
  return `${FIRST[Math.floor(hash01(a, 1) * FIRST.length)]} ${SECOND[Math.floor(hash01(a, 2) * SECOND.length)]}`;
};

export type Phase = "burning" | "due" | "review" | "kept" | "broken" | "unclear" | "retracted";
export const phaseOf = (state: number, deadline: number, now: number): Phase =>
  state === 4 ? "review" : state === 1 ? "kept" : state === 2 ? "broken" : state === 3 ? "unclear" : state === 5 ? "retracted" : now >= deadline ? "due" : "burning";

export const PHASE_LABEL: Record<Phase, string> = {
  burning: "Burning",
  due: "Awaiting verdict",
  review: "In review",
  kept: "Kept",
  broken: "Broken",
  unclear: "Unclear",
  retracted: "Retracted",
};

// What the activity feed calls each thing that can happen to a vow.
export const ACTION_LABEL: Record<string, string> = {
  made: "lit a vow",
  faith: "backed a vow",
  doubt: "doubted a vow",
  update: "posted a progress note",
  pinned: "pinned firm proof",
  challenged: "added counter-evidence",
  checked: "checked early",
  retry: "could not read the evidence",
  proposed: "had a verdict proposed",
  disputed: "was disputed",
  kept: "was kept",
  broken: "was broken",
  unclear: "ended unclear",
  retracted: "was retracted",
  released: "was released",
  claimed: "paid out a claim",
};

const AGO: [number, string][] = [[86400, "d"], [3600, "h"], [60, "m"]];
// "5m ago", "3h ago", "2d ago".
export function ago(at: number, now: number): string {
  const s = Math.max(0, now - at);
  for (const [n, u] of AGO) if (s >= n) return `${Math.floor(s / n)}${u} ago`;
  return "just now";
}

export const dateOf = (secs: number) => new Date(secs * 1000).toLocaleDateString("en", { year: "numeric", month: "short", day: "numeric" });
