import assert from "node:assert/strict";
import test from "node:test";
import { createThrottle } from "../src/throttle.mjs";

const RPC = "https://rpc.example/api";
const ok = () => new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result: "0x1" }), { status: 200 });
const limited = () => new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, error: { message: "Rate limit exceeded: 30 requests per minute" } }), { status: 200 });

function clock() {
  let t = 0;
  // sleeping callers wake at their own time, so concurrent sleeps do not add up
  return { now: () => t, sleep: async (ms) => { const wake = t + ms; await Promise.resolve(); t = Math.max(t, wake); } };
}

test("requests to the RPC are spaced evenly, even when started together", async () => {
  const starts = [];
  const f = createThrottle({ fetchFn: async () => { starts.push(Date.now()); return ok(); }, rpcUrl: RPC, perMinute: 600 }); // one every 100 ms, real timers
  await Promise.all(Array.from({ length: 5 }, () => f(RPC, {})));
  for (let i = 1; i < starts.length; i++) assert.ok(starts[i] - starts[i - 1] >= 90, `gap ${starts[i] - starts[i - 1]} ms`);
});

test("a refused call is repeated after a pause and the caller sees the good answer", async () => {
  const c = clock();
  let n = 0;
  const f = createThrottle({ fetchFn: async () => (++n < 3 ? limited() : ok()), rpcUrl: RPC, perMinute: 30, ...c });
  const body = await (await f(RPC, {})).json();
  assert.equal(body.result, "0x1");
  assert.equal(f.stats.refused, 2);
  assert.ok(c.now() >= 8000 + 16000);
});

test("an HTTP 429 is treated like the JSON-RPC refusal", async () => {
  const c = clock();
  let n = 0;
  const f = createThrottle({ fetchFn: async () => (++n < 2 ? new Response("slow down", { status: 429 }) : ok()), rpcUrl: RPC, ...c });
  assert.equal((await f(RPC, {})).status, 200);
});

test("it gives up after the retries and returns the refusal", async () => {
  const c = clock();
  const f = createThrottle({ fetchFn: async () => limited(), rpcUrl: RPC, maxRetries: 2, ...c });
  const body = await (await f(RPC, {})).json();
  assert.match(body.error.message, /Rate limit/);
  assert.equal(f.stats.sent, 3);
});

test("other hosts are not slowed down or inspected", async () => {
  const c = clock();
  const f = createThrottle({ fetchFn: async () => limited(), rpcUrl: RPC, ...c });
  await f("https://raw.githubusercontent.com/x/y/main/a.md", {});
  assert.equal(c.now(), 0);
  assert.equal(f.stats.sent, 0);
});

import { receiptFailed } from "../src/chain.mjs";

test("a receipt is read as failed when it carries an error result or a rollback", () => {
  assert.equal(receiptFailed('{"consensus_data":{"leader_receipt":[{"execution_result":"ERROR"}]}}'), true);
  assert.equal(receiptFailed('{"result":{"status":"rollback","payload":"x"}}'), true);
  assert.equal(receiptFailed('{"txExecutionResultName":"FINISHED_WITH_ERROR"}'), true);
  assert.equal(receiptFailed('{"consensus_data":{"leader_receipt":[{"execution_result":"SUCCESS"}]}}'), false);
  assert.equal(receiptFailed(""), false);
});
