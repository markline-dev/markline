import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// The route resolves `$ref`s against this root, so if it isn't pruned, every
// table and sample can publish what `api.hideExtensions` hides. Modules read the
// content folder and cache, so this file gets its own site, set before importing.
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "markline-root-"));
fs.mkdirSync(path.join(dir, "api"));
fs.writeFileSync(path.join(dir, "markline.json"), JSON.stringify({ name: "t", api: { hideExtensions: ["x-fern-ignore"] } }));
fs.writeFileSync(
  path.join(dir, "api", "openapi.json"),
  JSON.stringify({
    paths: {},
    components: {
      schemas: {
        Gone: { type: "object", "x-fern-ignore": true },
        Kept: { type: "object", properties: { a: { type: "string" }, b: { type: "string", "x-fern-ignore": true }, c: { type: "string", "x-internal": true } } },
      },
    },
  }),
);
process.env.MARKLINE_CONTENT = dir;
process.env.MARKLINE_CONFIG = path.join(dir, "markline.json");

test("loadOpenApiRoot prunes with the configured extensions, and caches", async () => {
  const { loadOpenApiRoot } = await import("../lib/openapi.ts");
  const root = loadOpenApiRoot();
  assert.ok(!("Gone" in root.components.schemas));
  // The configured list replaced the default, so x-internal isn't hidden here.
  assert.deepEqual(Object.keys(root.components.schemas.Kept.properties), ["a", "c"]);
  assert.equal(loadOpenApiRoot(), root);
  fs.rmSync(dir, { recursive: true, force: true });
});
