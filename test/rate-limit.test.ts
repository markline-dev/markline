import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import * as route from "../lib/ai/rate-limit";
import * as worker from "../templates/ai-worker/src/rate-limit";

// The Ask AI limits: one counter, in the built-in route and the Worker template.

const MINUTE = 60_000;
const DAY = 86_400_000;
/** 2026-11-10, 23:59:00 UTC. */
const LATE = Date.UTC(2026, 10, 10, 23, 59);

test("the route and the Worker have the same counter", () => {
  const here = path.dirname(new URL(import.meta.url).pathname);
  assert.equal(
    fs.readFileSync(path.join(here, "../templates/ai-worker/src/rate-limit.ts"), "utf8"),
    fs.readFileSync(path.join(here, "../lib/ai/rate-limit.ts"), "utf8"),
  );
});

for (const [name, mod] of [["route", route], ["Worker", worker]] as const) {
  const clock = (start: number) => {
    const c = { t: start, now: () => c.t };
    return c;
  };

  test(`${name}: perMinute limits any 60 seconds, and says when to retry`, () => {
    const c = clock(LATE - 30 * MINUTE);
    const limit = mod.createRateLimiter(c.now);
    const lim = { perMinute: 2 };
    assert.equal(limit("a", lim), undefined);
    c.t += 10_000;
    assert.equal(limit("a", lim), undefined);
    c.t += 10_000;
    assert.equal(limit("a", lim), 50); // the second request ages out at +70s
    assert.equal(limit("b", lim), undefined, "another caller has its own count");
    c.t += 50_000;
    assert.equal(limit("a", lim), undefined, "allowed after the wait it gave");
    assert.equal(limit("a", lim), 60, "a denied request counts too");
    c.t += 60_000;
    assert.equal(limit("a", lim), undefined);
  });

  test(`${name}: perDay limits a UTC day, and resets at midnight`, () => {
    const c = clock(LATE - 10 * MINUTE);
    const limit = mod.createRateLimiter(c.now);
    const lim = { perMinute: 100, perDay: 2 };
    assert.equal(limit("a", lim), undefined);
    assert.equal(limit("a", lim), undefined);
    assert.equal(limit("a", lim), 11 * 60, "seconds to midnight");
    c.t = LATE + 2 * MINUTE; // 00:01 the next day
    assert.equal(limit("a", lim), undefined);
  });

  test(`${name}: requests stopped by perMinute don't use up the day`, () => {
    const c = clock(LATE - 30 * MINUTE);
    const limit = mod.createRateLimiter(c.now);
    const lim = { perMinute: 1, perDay: 2 };
    assert.equal(limit("a", lim), undefined);
    assert.notEqual(limit("a", lim), undefined);
    assert.notEqual(limit("a", lim), undefined);
    c.t += 2 * MINUTE;
    assert.equal(limit("a", lim), undefined, "the second of the day");
    c.t += 2 * MINUTE;
    assert.ok((limit("a", lim) ?? 0) > 60, "the day is used up");
  });

  test(`${name}: no perDay means no daily limit`, () => {
    const c = clock(LATE - 20 * 60 * MINUTE);
    const limit = mod.createRateLimiter(c.now);
    for (let i = 0; i < 500; i++) {
      c.t += MINUTE;
      assert.equal(limit("a", { perMinute: 1 }), undefined);
    }
  });

  test(`${name}: limits come from whole positive numbers only`, () => {
    for (const ok of [1, 10, "10", " 5 "]) assert.equal(mod.limitOf(ok), Number(ok));
    for (const bad of [undefined, null, "", "x", 0, -1, 1.5, "1.5", Infinity, true, {}]) assert.equal(mod.limitOf(bad), undefined, String(bad));
  });

  test(`${name}: callers with nothing left to count are forgotten`, () => {
    const c = clock(LATE - 2 * DAY);
    const seen: Map<string, unknown>[] = [];
    const real = Map;
    // Watch the limiter's map: the first one made while creating it.
    globalThis.Map = class extends real<string, unknown> {
      constructor() {
        super();
        seen.push(this);
      }
    } as MapConstructor;
    let limit: ReturnType<typeof mod.createRateLimiter>;
    try {
      limit = mod.createRateLimiter(c.now);
    } finally {
      globalThis.Map = real;
    }
    const hits = seen[0];
    for (let i = 0; i < 50; i++) limit(`ip${i}`, { perMinute: 5, perDay: 5 });
    assert.equal(hits.size, 50);
    c.t += DAY;
    limit("late", { perMinute: 5, perDay: 5 });
    assert.equal(hits.size, 1);
  });
}

test("the route answers 429 with Retry-After once perDay is used up", async (t) => {
  const site = fs.mkdtempSync(path.join(os.tmpdir(), "markline-ai-"));
  fs.mkdirSync(path.join(site, "docs"));
  fs.writeFileSync(
    path.join(site, "markline.json"),
    JSON.stringify({ name: "t", ai: { enabled: true, mode: "proxy", provider: "openai", rateLimit: { perMinute: 100, perDay: 2 } } }),
  );
  const env = { MARKLINE_CONTENT: process.env.MARKLINE_CONTENT, MARKLINE_CONFIG: process.env.MARKLINE_CONFIG, MARKLINE_AI_KEY: process.env.MARKLINE_AI_KEY };
  process.env.MARKLINE_CONTENT = site;
  process.env.MARKLINE_CONFIG = path.join(site, "markline.json");
  process.env.MARKLINE_AI_KEY = "test-key";
  const realFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = (async () => {
    calls++;
    return Response.json({ choices: [{ message: { content: "answer" } }] });
  }) as typeof fetch;
  t.after(() => {
    globalThis.fetch = realFetch;
    for (const [k, v] of Object.entries(env)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
    fs.rmSync(site, { recursive: true, force: true });
  });

  const { POST } = await import("../app/api/ai/route");
  const ask = (ip: string) =>
    POST(new Request("http://site.test/api/ai", { method: "POST", headers: { "x-forwarded-for": ip }, body: JSON.stringify({ question: "hi" }) }));

  assert.equal((await ask("1.1.1.1")).status, 200);
  assert.equal((await ask("1.1.1.1")).status, 200);
  const over = await ask("1.1.1.1");
  assert.equal(over.status, 429);
  assert.ok(Number(over.headers.get("retry-after")) > 0);
  assert.equal(calls, 2, "the provider isn't called once the day is used up");
  assert.equal((await ask("2.2.2.2")).status, 200);
});
