import { after, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
// lib/ imports resolve via test/setup.mjs, which `npm test` loads first.
import { normalize, placeChannels, type NormalizeOptions } from "../lib/openapi.ts";
import { operationAnchors } from "../lib/apiref-view.ts";
import { tagSlug } from "../lib/openapi-tags.ts";
import { channelExtras, channelLlms, channelPages, channelRecords } from "../scripts/asyncapi-build.mjs";

// The build's links to WebSocket channels (search records, llms files) land on
// the ids the pages render: the same placement and the same anchor rule.
// Synthetic specs only.

const op = (id: string, summary: string, tags: string[], extra: Record<string, unknown> = {}) => ({ operationId: id, summary, tags, responses: { 200: { description: "ok" } }, ...extra });
const spec = {
  openapi: "3.0.0",
  info: { title: "t", version: "1" },
  tags: [{ name: "speech" }],
  paths: {
    "/v1/speech/{id}": { get: op("getSpeech", "Stream input", ["speech"]), post: op("makeSpeech", "Make speech", ["speech"], { "x-nav-order": 1 }) },
    "/v1/other": { get: op("other", "Other", ["other"]) },
  },
};
const asyncDoc = {
  asyncapi: "2.6.0",
  info: { title: "t", version: "1" },
  servers: { live: { url: "api.acme.test/", protocol: "wss" } },
  channels: {
    // Titled like an operation on its page: numbered after it.
    "/v1/speech/{id}/stream-input": { description: "Text in, **audio** out.", parameters: { id: { description: "Which one." } }, publish: { message: { name: "text", description: "Some text." } }, subscribe: { message: { name: "audio", deprecated: true } } },
    "/v1/speech/{id}/stream-input-2": { "x-title": "Stream input", subscribe: { message: { name: "audio2" } } },
    "/firehose": { subscribe: { message: { name: "all" } } },
    "/firehose2": { "x-title": "Firehose", subscribe: { message: { name: "all2" } } },
    // Tagged for the WebSockets page, though its path matches speech: it joins WebSockets.
    "/v1/speech/{id}/live": { "x-title": "Live", subscribe: { tags: [{ name: "WebSockets" }], message: { name: "live" } } },
    // Titled like an operation on another page ("Other"): not numbered past it.
    "/v1/speech/{id}/other": { "x-title": "Other", subscribe: { message: { name: "o" } } },
  },
};
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "markline-asyncapi-search-"));
after(() => fs.rmSync(dir, { recursive: true, force: true }));
fs.mkdirSync(path.join(dir, "api"));
fs.writeFileSync(path.join(dir, "api", "asyncapi.json"), JSON.stringify(asyncDoc));

/** What the page renders: each channel's page slug and id. */
function onPages(api: Record<string, unknown>) {
  const placement = channelExtras(dir, spec, api);
  const doc = normalize(spec, { ...(api as NormalizeOptions), extras: placement.extras });
  placeChannels(doc, placement, api as NormalizeOptions);
  return doc.tags.flatMap((tag) => {
    const ids = operationAnchors(tag, doc);
    return (tag.channels ?? []).map((c) => [c.id, `/api-reference/${tagSlug(tag.name)}#${ids.get(c)}`]);
  });
}

test("each channel's link is its page and its id there, as the page renders them", () => {
  for (const api of [
    {},
    { tags: { WebSockets: { label: "Realtime" } } },
    { tags: { WebSockets: { mergeInto: "other" } } },
    { tags: { WebSockets: { mergeInto: "Realtime" } } },
    { tagOrder: ["WebSockets"] },
  ]) {
    const built = channelPages(dir, spec, api).map((p) => [p.channel.id, p.url]);
    assert.deepEqual(built, onPages(api), JSON.stringify(api));
  }
  // Numbered past the operation it shares a title with, and past each other.
  assert.deepEqual(
    channelPages(dir, spec, {}).map((p) => p.url),
    [
      "/api-reference/speech#stream-input-1",
      "/api-reference/speech#stream-input-2",
      "/api-reference/speech#other",
      "/api-reference/websockets#live",
      "/api-reference/websockets#firehose",
      "/api-reference/websockets#firehose-1",
    ],
  );
});

test("search records: one per channel, its text, under API reference", () => {
  const records = channelRecords(dir, spec, {}, (s) => s.replace(/\*\*/g, ""));
  assert.equal(records.length, 6);
  assert.deepEqual(records[0], {
    url: "/api-reference/speech#stream-input-1",
    title: "Stream input",
    content: "Stream input Text in, audio out. WSS /v1/speech/{id}/stream-input text Some text. audio",
    meta: "API reference",
  });
});

test("llms: a list of channels for llms.txt, and a section for llms-full.txt with each message's fields and example", () => {
  const { index, full } = channelLlms(dir, spec, {}, (u) => `https://docs.test${u}`);
  assert.match(index, /### WebSocket channels\n\n- \[Stream input\]\(https:\/\/docs\.test\/api-reference\/speech#stream-input-1\): `wss:\/\/api\.acme\.test\/v1\/speech\/\{id\}\/stream-input`/);
  assert.match(full, /# WebSocket channels\n\n## Stream input\n\n\[Speech › Stream input\]\(https:\/\/docs\.test\/api-reference\/speech#stream-input-1\) · `WSS wss:\/\/api\.acme\.test\/v1\/speech\/\{id\}\/stream-input`/);
  assert.match(full, /Path parameters:\n\n- `id`: Which one\./);
  assert.match(full, /### Send: text\n\nSome text\.\n\n/);
  assert.match(full, /### Receive: audio \(deprecated\)\n\n/);
  // No document, nothing.
  assert.deepEqual(channelLlms(path.join(dir, "none"), spec, {}), { index: "", full: "" });
});

test("llms-full: query, headers and fields with type, required and deprecated; a long example cut at a line", () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), "markline-asyncapi-llms-"));
  after(() => fs.rmSync(d, { recursive: true, force: true }));
  fs.mkdirSync(path.join(d, "api"));
  const big = { items: Array.from({ length: 30 }, (_, i) => ({ id: i })) };
  fs.writeFileSync(
    path.join(d, "api", "asyncapi.json"),
    JSON.stringify({
      asyncapi: "2.6.0",
      info: { title: "t", version: "1" },
      channels: {
        "/v1/speech/{id}/q": {
          bindings: {
            ws: {
              query: { type: "object", required: ["token"], properties: { token: { type: "string", description: "Your key." }, mode: { type: ["string", "null"] } } },
              headers: { type: "object", properties: { "x-trace": { type: "string", deprecated: true } } },
            },
          },
          subscribe: {
            message: {
              name: "m",
              payload: { type: "object", required: ["a"], properties: { a: { type: "integer", description: "The a.\nOn two lines." }, old: { type: "string", deprecated: true } } },
              examples: [{ payload: big }],
            },
          },
        },
      },
    }),
  );
  const { full } = channelLlms(d, spec, {});
  assert.match(full, /Query parameters:\n\n- `token` \(string, required\): Your key\.\n- `mode` \(string \| null\)\n\n/);
  assert.match(full, /Headers:\n\n- `x-trace` \(string, deprecated\)\n\n/);
  assert.match(full, /- `a` \(integer, required\): The a\. On two lines\.\n- `old` \(string, deprecated\)\n\n/);
  const fence = full.match(/```json\n([\s\S]*?)\n```/)![1].split("\n");
  assert.equal(fence.length, 41);
  assert.equal(fence[40], "…");
  assert.deepEqual(fence.slice(0, 40), JSON.stringify(big, null, 2).split("\n").slice(0, 40));
});

test("llms-full prints fields and examples with the pages' hiding: hidden fields and their values never appear", () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), "markline-asyncapi-llms-hide-"));
  after(() => fs.rmSync(d, { recursive: true, force: true }));
  fs.mkdirSync(path.join(d, "api"));
  fs.writeFileSync(
    path.join(d, "api", "asyncapi.json"),
    JSON.stringify({
      asyncapi: "2.6.0",
      info: { title: "t", version: "1" },
      channels: {
        "/v1/speech/{id}/h": {
          bindings: { ws: { query: { type: "object", properties: { qshown: { type: "string" }, qsecret: { type: "string", "x-internal": true } } } } },
          subscribe: {
            message: {
              name: "m",
              payload: {
                type: "object",
                properties: {
                  shownfield: { type: "string" },
                  secretfield: { type: "string", "x-internal": true },
                  refsecret: { $ref: "#/components/schemas/Shared", "x-internal": true },
                  refshown: { $ref: "#/components/schemas/Shared" },
                },
              },
              examples: [{ payload: { shownfield: "seen", secretfield: "secretvalue", refsecret: { code: "refvalue" }, refshown: { code: "ok" } } }],
            },
          },
        },
      },
      components: { schemas: { Shared: { type: "object", properties: { code: { type: "string" } } } } },
    }),
  );
  const { full } = channelLlms(d, spec, {});
  for (const shown of ["`qshown`", "`shownfield`", "`refshown`", '"shownfield": "seen"', '"refshown"']) assert.ok(full.includes(shown), shown);
  assert.doesNotMatch(full, /qsecret|secretfield|secretvalue|refsecret|refvalue/);
});
