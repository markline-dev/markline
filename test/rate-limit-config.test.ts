import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// Its own file, so loadConfig() reads this config, not one cached by another test.

test("loading a config with a bad rate limit warns", async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "markline-rate-"));
  fs.writeFileSync(path.join(dir, "markline.json"), JSON.stringify({ name: "t", ai: { enabled: true, rateLimit: { perMinute: 5, perDay: "10abc" } } }));
  const env = { MARKLINE_CONTENT: process.env.MARKLINE_CONTENT, MARKLINE_CONFIG: process.env.MARKLINE_CONFIG };
  process.env.MARKLINE_CONTENT = dir;
  process.env.MARKLINE_CONFIG = path.join(dir, "markline.json");
  const said: string[] = [];
  const warn = console.warn;
  console.warn = (...args: unknown[]) => void said.push(args.join(" "));
  t.after(() => {
    console.warn = warn;
    for (const [k, v] of Object.entries(env)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
    fs.rmSync(dir, { recursive: true, force: true });
  });

  const { loadConfig } = await import("../lib/config");
  loadConfig();
  const rate = said.filter((m) => m.includes("ai.rateLimit"));
  assert.equal(rate.length, 1, said.join("\n"));
  assert.match(rate[0], /ai\.rateLimit\.perDay .* ignoring "10abc"/);
});
