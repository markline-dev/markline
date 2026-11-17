import { after, test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { stringify } from "yaml";
// lib/ imports resolve via test/setup.mjs, which `npm test` loads first.
import { readAsyncApiFile, readYaml } from "../scripts/asyncapi-core.mjs";
import { asyncApiFile, channelExtras } from "../scripts/asyncapi-build.mjs";

// AsyncAPI documents written in YAML: read as their JSON twins, safely, and found
// beside the spec as api/asyncapi.json, .yaml or .yml. Synthetic specs only.

const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "markline-asyncapi-yaml-")));
after(() => fs.rmSync(root, { recursive: true, force: true }));
let n = 0;
const folder = (files: Record<string, string>) => {
  const dir = path.join(root, String(n++));
  for (const [name, text] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(dir, name)), { recursive: true });
    fs.writeFileSync(path.join(dir, name), text);
  }
  return dir;
};

const v26 = {
  asyncapi: "2.6.0",
  info: { title: "t", version: "1" },
  servers: { live: { url: "live.acme.test", protocol: "wss" } },
  tags: [{ name: "speech", description: "Speech." }],
  channels: {
    "/v1/speak/{id}": {
      parameters: { id: { description: "Which." } },
      publish: { message: { $ref: "#/components/messages/Text" } },
      subscribe: { message: { name: "audio", payload: { type: "object", properties: { audio: { type: "string" } } }, examples: [{ payload: { audio: "AAAA" } }] } },
    },
  },
  components: { messages: { Text: { name: "text", payload: { type: "object", properties: { text: { type: "string" } } } } } },
};
const v30 = {
  asyncapi: "3.0.0",
  info: { title: "t", version: "1" },
  channels: { live: { address: "/live", messages: { Up: { name: "up", payload: { type: "string" } } } } },
  operations: { up: { action: "receive", channel: { $ref: "#/channels/live" }, messages: [{ $ref: "#/channels/live/messages/Up" }] } },
};

test("a YAML document is read exactly as its JSON twin, 2.x and 3.0", () => {
  for (const doc of [v26, v30]) {
    const dir = folder({ "a.json": JSON.stringify(doc), "a.yaml": stringify(doc), "a.yml": stringify(doc) });
    const json = readAsyncApiFile(path.join(dir, "a.json"));
    assert.deepEqual(readAsyncApiFile(path.join(dir, "a.yaml")), json);
    assert.deepEqual(readAsyncApiFile(path.join(dir, "a.yml")), json);
    assert.ok(json!.channels.length > 0);
  }
});

test("YAML anchors and aliases work; an alias bomb, duplicate keys and broken YAML are refused with a reason", () => {
  assert.deepEqual(readYaml("base: &b { type: string }\nx: *b\n").value, { base: { type: "string" }, x: { type: "string" } });
  const bomb = ["a: &a [x,x,x,x,x,x,x,x,x]", "b: &b [*a,*a,*a,*a,*a,*a,*a,*a,*a]", "c: &c [*b,*b,*b,*b,*b,*b,*b,*b,*b]", "d: [*c,*c,*c,*c,*c,*c,*c,*c,*c]"].join("\n");
  assert.match(readYaml(bomb).error!, /alias/i);
  assert.equal(readYaml("a: 1\nb: 2\na: 3\n").error, "line 3: Map keys must be unique");
  assert.match(readYaml("a: [1,\n").error!, /^line 2: /);
  // Plain data only: no YAML 1.1 types or custom tags turn into anything else.
  assert.deepEqual(readYaml("t: !!binary aGk=\nx: !custom 1\n").value, { t: "aGk=", x: "1" });
  const dir = folder({ "api/asyncapi.yaml": "asyncapi: 2.6.0\nchannels:\n  a: 1\n  a: 2\n" });
  assert.deepEqual(readAsyncApiFile(path.join(dir, "api", "asyncapi.yaml")), {
    channels: [],
    warnings: ["[markline] asyncapi.yaml isn't valid YAML (line 4: Map keys must be unique), so its channels aren't shown."],
  });
  const other = folder({ "api/asyncapi.toml": "x = 1" });
  assert.match(readAsyncApiFile(path.join(other, "api", "asyncapi.toml"))!.warnings[0], /only JSON and YAML AsyncAPI documents are read/);
});

test("the document is api/asyncapi.json, else .yaml, else .yml; a second one is reported as ignored", () => {
  const y = folder({ "api/asyncapi.yaml": stringify(v30) });
  assert.equal(asyncApiFile(y, {}), path.join(y, "api", "asyncapi.yaml"));
  const yml = folder({ "api/asyncapi.yml": stringify(v30) });
  assert.equal(asyncApiFile(yml, {}), path.join(yml, "api", "asyncapi.yml"));
  assert.equal(asyncApiFile(folder({}), {}).endsWith(path.join("api", "asyncapi.json")), true);
  // api.asyncapi.file names any of them, and nothing is said about the others.
  const both = folder({ "api/asyncapi.json": JSON.stringify(v30), "api/asyncapi.yaml": stringify(v26) });
  assert.equal(asyncApiFile(both, {}), path.join(both, "api", "asyncapi.json"));
  assert.deepEqual(channelExtras(both, null, {}).read!.warnings, [
    "[markline] api/asyncapi.json and api/asyncapi.yaml both exist; asyncapi.json is read and asyncapi.yaml is ignored.",
  ]);
  const chosen = channelExtras(both, null, { asyncapi: { file: "api/asyncapi.yaml" } }).read!;
  assert.deepEqual([chosen.warnings, chosen.channels.map((c) => c.id)], [[], ["/v1/speak/{id}"]]);
});

test("a build reads a YAML-only site: its warnings and its pages", () => {
  const site = folder({
    "docs/index.mdx": "---\ntitle: Home\n---\n\nHome.\n",
    "api/asyncapi.yaml": stringify(v30),
    "v1/api/asyncapi.yml": "asyncapi: 2.6.0\nx: [1,\n",
    "markline.json": JSON.stringify({
      name: "Y",
      seo: { metadataBase: "https://docs.y.test" },
      versions: [{ id: "v2" }, { id: "v1" }],
      navigation: { tabs: [{ id: "api", label: "API", href: "/api-reference", match: ["/api-reference"], openapi: true }] },
    }),
  });
  const cwd = folder({ "public/.keep": "" });
  const script = path.join(import.meta.dirname, "..", "scripts", "build-search.mjs");
  const r = spawnSync(process.execPath, [script], { cwd, encoding: "utf8", env: { ...process.env, MARKLINE_CONTENT: site, NODE_TEST_CONTEXT: "" } });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stderr + r.stdout, /\[markline\] \(version v1\) asyncapi\.yml isn't valid YAML \(line 3: /);
  assert.match(fs.readFileSync(path.join(cwd, "public", "sitemap.xml"), "utf8"), /https:\/\/docs\.y\.test\/api-reference\/websockets</);
});
