import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

test("the cache handler loads, and writes only during a build", async (t) => {
  const Handler = require("../scripts/read-only-cache.cjs");
  const parent = require("next/dist/server/lib/incremental-cache/file-system-cache.js").default;
  assert.ok(Handler.prototype instanceof parent);

  const serverDistDir = fs.mkdtempSync(path.join(os.tmpdir(), "markline-cache-"));
  t.after(() => fs.rmSync(serverDistDir, { recursive: true, force: true }));
  const cache = new Handler({ flushToDisk: true, serverDistDir, revalidatedTags: [], fs: { ...fs.promises, existsSync: fs.existsSync }, _appDir: true, _pagesDir: false, _requestHeaders: {} });
  const page = { kind: "APP_PAGE", html: "<p>x</p>", rscData: Buffer.from("r"), headers: {}, postponed: undefined, status: undefined, segmentData: undefined };
  const files = () => (fs.readdirSync(serverDistDir, { recursive: true, withFileTypes: true }) as fs.Dirent[]).filter((e) => e.isFile()).length;

  const phase = process.env.NEXT_PHASE;
  t.after(() => {
    if (phase === undefined) delete process.env.NEXT_PHASE;
    else process.env.NEXT_PHASE = phase;
  });
  delete process.env.NEXT_PHASE;
  await cache.set("/at-runtime", page, { isRoutePPREnabled: false, isFallback: false });
  assert.equal(files(), 0);

  process.env.NEXT_PHASE = "phase-production-build";
  await cache.set("/in-a-build", page, { isRoutePPREnabled: false, isFallback: false });
  assert.ok(files() > 0);
});
