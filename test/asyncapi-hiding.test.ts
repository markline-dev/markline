import { after, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
// lib/ imports resolve via test/setup.mjs, which `npm test` loads first.
import { hideChannelFields, normalizeAsyncApi, readAsyncApiFile, type AsyncChannel } from "../lib/asyncapi.ts";
import { pruneExample, pruneSchema } from "../lib/openapi-prune.ts";
import { asyncApiReport } from "../scripts/asyncapi-build.mjs";

// What api.hideExtensions and showDeprecated leave of an AsyncAPI document.
// Synthetic specs only.

const EXTS = ["x-internal", "x-hidden"];
const names = (c: AsyncChannel | undefined) => (c?.messages ?? []).map((m) => `${m.direction}:${m.name}`);
const byId = (channels: AsyncChannel[], id: string) => channels.find((c) => c.id === id);

const v2 = {
  asyncapi: "2.6.0",
  info: { title: "t", version: "1" },
  channels: {
    "/secret": { "x-internal": true, publish: { message: { name: "a" } } },
    "/half": {
      publish: { "x-internal": true, message: { name: "in" } },
      subscribe: { message: { oneOf: [{ $ref: "#/components/messages/Out" }, { $ref: "#/components/messages/Debug" }] } },
    },
    "/gone": { publish: { "x-hidden": true, message: { name: "a" } }, subscribe: { "x-internal": true, message: { name: "b" } } },
    "/kinds": {
      publish: {
        message: {
          name: "client",
          payload: { oneOf: [{ title: "Start", type: "object" }, { title: "Trace", "x-internal": true, type: "object" }] },
        },
      },
    },
    "/bare": { description: "No operations at all." },
  },
  components: { messages: { Out: { name: "out" }, Debug: { name: "debug", "x-internal": true } } },
};

test("2.x: a flagged channel, operation, message or oneOf kind is left out", () => {
  const doc = normalizeAsyncApi(v2, { hideExtensions: EXTS });
  assert.deepEqual(doc.channels.map((c) => c.id), ["/half", "/kinds", "/bare"]);
  // The hidden publish takes its message; the flagged component is hidden through its $ref.
  assert.deepEqual(names(byId(doc.channels, "/half")), ["receive:out"]);
  assert.deepEqual(names(byId(doc.channels, "/kinds")), ["send:Start"]);
  // Without the setting, nothing is hidden.
  assert.equal(normalizeAsyncApi(v2).channels.length, 5);
});

const v3 = {
  asyncapi: "3.0.0",
  info: { title: "t", version: "1" },
  channels: {
    live: { address: "/live", messages: { Up: { name: "up" }, Down: { name: "down" }, Admin: { name: "admin" }, Both: { name: "both" } } },
    ops: { address: "/ops", messages: { X: { name: "x" } } },
    flagged: { address: "/flagged", "x-hidden": true, messages: { Y: { name: "y" } } },
    loose: { address: "/loose", messages: { Z: { name: "z" } } },
  },
  operations: {
    up: { action: "receive", channel: { $ref: "#/channels/live" }, messages: [{ $ref: "#/channels/live/messages/Up" }, { $ref: "#/channels/live/messages/Both" }] },
    down: { action: "send", channel: { $ref: "#/channels/live" }, messages: [{ $ref: "#/channels/live/messages/Down" }] },
    admin: { action: "send", "x-internal": true, channel: { $ref: "#/channels/live" }, messages: [{ $ref: "#/channels/live/messages/Admin" }, { $ref: "#/channels/live/messages/Both" }] },
    onlyHidden: { action: "send", "x-internal": true, channel: { $ref: "#/channels/ops" } },
  },
};

test("3.0: a hidden operation takes the messages only it uses, and a channel only it uses", () => {
  const doc = normalizeAsyncApi(v3, { hideExtensions: EXTS });
  // "flagged" by its own flag, "ops" because its one operation is hidden; "loose" has none, so it stays.
  assert.deepEqual(doc.channels.map((c) => c.id), ["live", "loose"]);
  // "admin" goes; "both" stays, for the visible operation that uses it.
  assert.deepEqual(names(byId(doc.channels, "live")), ["send:up", "receive:down", "send:both"]);
  assert.deepEqual(names(byId(doc.channels, "loose")), ["unspecified:z"]);
});

test("showDeprecated: false leaves out deprecated channels and messages", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "markline-asyncapi-dep-"));
  after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const file = path.join(dir, "asyncapi.json");
  fs.writeFileSync(
    file,
    JSON.stringify({
      asyncapi: "2.6.0",
      info: { title: "t", version: "1" },
      channels: {
        "/old": { deprecated: true, publish: { message: { name: "a" } } },
        "/live": { publish: { message: { oneOf: [{ name: "keep" }, { name: "legacy", deprecated: true }] } } },
      },
    }),
  );
  const shown = readAsyncApiFile(file)!;
  assert.deepEqual(shown.channels.map((c) => [c.id, names(c)]), [["/old", ["send:a"]], ["/live", ["send:keep", "send:legacy"]]]);
  assert.equal(shown.channels[1].messages[1].deprecated, true);
  const left = readAsyncApiFile(file, { showDeprecated: false })!;
  assert.deepEqual(left.channels.map((c) => [c.id, names(c)]), [["/live", ["send:keep"]]]);
});

test("pruneSchema and pruneExample: hidden fields go from a resolved schema and its examples", () => {
  const schema = {
    type: "object",
    required: ["text", "trace"],
    properties: {
      text: { type: "string" },
      trace: { type: "string", "x-internal": true },
      nested: { type: "object", properties: { keep: { type: "integer" }, debug: { type: "boolean", "x-hidden": true } } },
    },
    example: { text: "hi", trace: "t", nested: { keep: 1, debug: true } },
  };
  const pruned = pruneSchema(schema, EXTS)!;
  assert.deepEqual(Object.keys(pruned.properties), ["text", "nested"]);
  assert.deepEqual(pruned.required, ["text"]);
  assert.deepEqual(Object.keys(pruned.properties.nested.properties), ["keep"]);
  assert.deepEqual(pruned.example, { text: "hi", nested: { keep: 1 } });
  assert.deepEqual(pruneExample({ text: "a", trace: "b", other: 1 }, schema, EXTS), { text: "a", other: 1 });
  // A schema hidden whole is gone; no extensions changes nothing.
  assert.equal(pruneSchema({ type: "object", "x-internal": true }, EXTS), undefined);
  assert.equal(pruneSchema(schema, []), schema);
});

test("the build hides what the pages hide: default extensions, api.hideExtensions and showDeprecated", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "markline-asyncapi-hide-"));
  after(() => fs.rmSync(dir, { recursive: true, force: true }));
  fs.mkdirSync(path.join(dir, "api"));
  const spec = { openapi: "3.0.0", info: { title: "t", version: "1" }, paths: { "/things": { get: { tags: ["things"], responses: {} } } } };
  const write = (channels: Record<string, unknown>) =>
    fs.writeFileSync(path.join(dir, "api", "asyncapi.json"), JSON.stringify({ asyncapi: "2.6.0", info: { title: "t", version: "1" }, channels }));
  // Only channels with nowhere to go make a WebSockets page, so hiding them removes it.
  write({ "/firehose": { "x-internal": true, subscribe: { message: { name: "all" } } } });
  assert.deepEqual(asyncApiReport(dir, spec, {}).pages, []);
  write({ "/firehose": { "x-fern-ignore": true, subscribe: { message: { name: "all" } } } });
  assert.equal(asyncApiReport(dir, spec, {}).pages.length, 1);
  assert.deepEqual(asyncApiReport(dir, spec, { hideExtensions: ["x-fern-ignore"] }).pages, []);
});

test("a field hidden beside its $ref is hidden there, and only there: payload, query and headers", () => {
  const shared = { type: "object", properties: { code: { type: "string" } } };
  const hiddenUse = { $ref: "#/components/schemas/Shared", "x-internal": true };
  const plainUse = { $ref: "#/components/schemas/Shared" };
  const doc = normalizeAsyncApi(
    {
      asyncapi: "2.6.0",
      info: { title: "t", version: "1" },
      channels: {
        "/x": {
          bindings: {
            ws: {
              query: { type: "object", properties: { qsecret: hiddenUse, qshown: plainUse } },
              headers: { type: "object", properties: { hsecret: hiddenUse, hshown: plainUse } },
            },
          },
          publish: {
            message: {
              name: "m",
              payload: { type: "object", properties: { secret: hiddenUse, shown: plainUse, note: { ...plainUse, description: "Its own words." } } },
              examples: [{ payload: { secret: { code: "s" }, shown: { code: "v" } } }],
            },
          },
        },
      },
      components: { schemas: { Shared: shared } },
    },
    { hideExtensions: EXTS },
  );
  const raw = doc.channels[0];
  // Read: the flag (and any other key) beside the $ref is kept on that use.
  assert.equal(raw.messages[0].payload?.properties?.secret["x-internal"], true);
  assert.equal(raw.messages[0].payload?.properties?.shown["x-internal"], undefined);
  assert.equal(raw.messages[0].payload?.properties?.note.description, "Its own words.");
  const c = hideChannelFields(raw, EXTS);
  assert.deepEqual(Object.keys(c.messages[0].payload?.properties ?? {}), ["shown", "note"]);
  assert.deepEqual(Object.keys(c.query?.properties ?? {}), ["qshown"]);
  assert.deepEqual(Object.keys(c.headers?.properties ?? {}), ["hshown"]);
  // The examples lose the hidden field too.
  assert.deepEqual(c.messages[0].examples, [{ shown: { code: "v" } }]);
  // The Shared schema itself is untouched for its visible uses.
  assert.deepEqual(c.messages[0].payload?.properties?.shown.properties, { code: { type: "string" } });
});

test("hideChannelFields: path parameters stay, a payload hidden whole drops its examples, no extensions change nothing", () => {
  const channel = {
    id: "/x/{id}",
    address: "/x/{id}",
    tags: [],
    servers: [],
    parameters: [{ name: "id", schema: { type: "string", "x-internal": true } }],
    messages: [
      { id: "a", name: "a", direction: "send", examples: [{ k: 1 }], payload: { type: "object", "x-hidden": true, properties: { k: { type: "integer" } } } },
      { id: "b", name: "b", direction: "send", examples: [{ k: 1, t: 2 }], payload: { type: "object", properties: { k: { type: "integer" }, t: { type: "integer", "x-internal": true } } } },
    ],
  } as AsyncChannel;
  const c = hideChannelFields(channel, EXTS);
  assert.deepEqual(c.parameters.map((p) => [p.name, p.schema]), [["id", undefined]]);
  assert.deepEqual(c.messages.map((m) => [m.payload === undefined, m.examples]), [[true, []], [false, [{ k: 1 }]]]);
  assert.equal(hideChannelFields(channel, []), channel);
});
