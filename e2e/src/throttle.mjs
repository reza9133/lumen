// Studionet's RPC answers at most 30 requests per minute per client. The runner plays several scenarios side by side and
// every transaction is polled until the network has decided, so without a limit of its own it is refused with
// "Rate limit exceeded". This wraps fetch for requests to the RPC address only: calls are spaced evenly, and a call
// that is refused anyway is repeated after a pause. Nothing else (the evidence pages, GitHub) goes through it.

export const RATE_LIMITED = /rate limit/i;

export function createThrottle({ fetchFn, rpcUrl, perMinute = 24, maxRetries = 8, sleep = (ms) => new Promise((r) => setTimeout(r, ms)), now = () => Date.now(), onWait = () => {} }) {
  const spacing = Math.ceil(60000 / Math.max(1, perMinute));
  const origin = new URL(rpcUrl).origin;
  let next = 0; // the earliest time the next request may start
  const stats = { sent: 0, refused: 0 };

  async function slot() {
    const at = Math.max(now(), next);
    next = at + spacing; // reserved synchronously, so concurrent callers queue in order
    const wait = at - now();
    if (wait > 0) await sleep(wait);
  }

  async function throttled(input, init) {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input?.url ?? "";
    if (!url.startsWith(origin)) return fetchFn(input, init);
    for (let attempt = 0; ; attempt++) {
      await slot();
      stats.sent++;
      const res = await fetchFn(input, init);
      let refused = res.status === 429;
      if (!refused) {
        const text = await res.clone().text().catch(() => "");
        refused = text.length < 2000 && RATE_LIMITED.test(text);
      }
      if (!refused) return res;
      stats.refused++;
      if (attempt >= maxRetries) return res;
      const pause = Math.min(60000, 8000 * (attempt + 1));
      onWait(pause, attempt + 1);
      next = Math.max(next, now() + pause); // everyone waits, not only this caller
      await sleep(pause);
    }
  }
  throttled.stats = stats;
  return throttled;
}

export function installThrottle(rpcUrl, perMinute, log = console.log) {
  const original = globalThis.fetch;
  let lastLine = 0;
  const wrapped = createThrottle({
    fetchFn: original.bind(globalThis),
    rpcUrl,
    perMinute,
    onWait: (ms, n) => {
      if (Date.now() - lastLine > 30000) {
        log(`   the RPC asked for a pause; waiting ${Math.round(ms / 1000)}s (retry ${n})`);
        lastLine = Date.now();
      }
    },
  });
  globalThis.fetch = wrapped;
  return wrapped;
}
