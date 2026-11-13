import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// Its own file, so the route reads this test's config, not one cached by another.

test("the route counts readers by the address the nearest proxy reports", async (t) => {
  const site = fs.mkdtempSync(path.join(os.tmpdir(), "markline-ai-ip-"));
  fs.mkdirSync(path.join(site, "docs"));
  fs.writeFileSync(path.join(site, "markline.json"), JSON.stringify({ name: "t", ai: { enabled: true, mode: "proxy", provider: "openai", rateLimit: { perMinute: 100, perDay: 1 } } }));
  const env = { MARKLINE_CONTENT: process.env.MARKLINE_CONTENT, MARKLINE_CONFIG: process.env.MARKLINE_CONFIG, MARKLINE_AI_KEY: process.env.MARKLINE_AI_KEY };
  process.env.MARKLINE_CONTENT = site;
  process.env.MARKLINE_CONFIG = path.join(site, "markline.json");
  process.env.MARKLINE_AI_KEY = "test-key";
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async () => Response.json({ choices: [{ message: { content: "answer" } }] })) as typeof fetch;
  t.after(() => {
    globalThis.fetch = realFetch;
    for (const [k, v] of Object.entries(env)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
    fs.rmSync(site, { recursive: true, force: true });
  });
  const { POST } = await import("../app/api/ai/route");
  const ask = (xff: string) =>
    POST(new Request("http://site.test/api/ai", { method: "POST", headers: { "x-forwarded-for": xff }, body: JSON.stringify({ question: "hi" }) }));
  assert.equal((await ask("1.1.1.1, 198.51.100.9")).status, 200);
  assert.equal((await ask("2.2.2.2, 198.51.100.9")).status, 429, "a different entry on the left is the same reader");
});
