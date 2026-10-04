// Behavior for the documentation page: mobile menu, section highlight in the sidebar,
// and copy buttons on code blocks. The page itself is plain HTML and works without any of this.

const body = document.body;
const menuBtn = document.getElementById("menu-btn") as HTMLButtonElement | null;
const scrim = document.getElementById("scrim") as HTMLElement | null;
const links = Array.from(document.querySelectorAll<HTMLAnchorElement>(".sidebar a[href^='#']"));

function setMenu(open: boolean) {
  body.classList.toggle("nav-open", open);
  menuBtn?.setAttribute("aria-expanded", String(open));
  if (scrim) scrim.hidden = !open;
}

menuBtn?.addEventListener("click", () => setMenu(!body.classList.contains("nav-open")));
scrim?.addEventListener("click", () => setMenu(false));
links.forEach((a) => a.addEventListener("click", () => setMenu(false)));
window.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && body.classList.contains("nav-open")) {
    setMenu(false);
    menuBtn?.focus();
  }
});
window.matchMedia("(min-width: 961px)").addEventListener("change", (e) => {
  if (e.matches) setMenu(false);
});

// Highlight the section that is currently being read.
const byId = new Map(links.map((a) => [a.getAttribute("href")!.slice(1), a]));
const sections = Array.from(byId.keys())
  .map((id) => document.getElementById(id))
  .filter((el): el is HTMLElement => el !== null);

function mark(id: string) {
  links.forEach((a) => {
    if (a === byId.get(id)) {
      a.setAttribute("aria-current", "true");
      a.scrollIntoView({ block: "nearest" });
    } else {
      a.removeAttribute("aria-current");
    }
  });
}

if ("IntersectionObserver" in window && sections.length) {
  const visible = new Set<string>();
  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (e.isIntersecting) visible.add(e.target.id);
        else visible.delete(e.target.id);
      }
      const first = sections.find((s) => visible.has(s.id));
      if (first) mark(first.id);
    },
    { rootMargin: "-80px 0px -60% 0px" },
  );
  sections.forEach((s) => io.observe(s));
}
mark((location.hash.slice(1) && byId.has(location.hash.slice(1)) ? location.hash.slice(1) : sections[0]?.id) ?? "");

// Copy buttons.
document.querySelectorAll<HTMLPreElement>("main pre").forEach((pre) => {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "copy";
  btn.textContent = "Copy";
  btn.addEventListener("click", async () => {
    const text = pre.querySelector("code")?.textContent ?? pre.textContent ?? "";
    try {
      await navigator.clipboard.writeText(text);
      btn.textContent = "Copied";
    } catch {
      btn.textContent = "Press Ctrl+C";
      const range = document.createRange();
      range.selectNodeContents(pre.querySelector("code") ?? pre);
      const sel = window.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(range);
    }
    setTimeout(() => (btn.textContent = "Copy"), 1600);
  });
  pre.appendChild(btn);
});

// Wide tables scroll inside their own box instead of widening the page.
document.querySelectorAll<HTMLTableElement>("main table").forEach((table) => {
  const wrap = document.createElement("div");
  wrap.className = "table-wrap" + (table.classList.contains("args") ? " args" : "");
  table.replaceWith(wrap);
  wrap.appendChild(table);
});
