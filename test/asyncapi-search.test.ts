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
  const { read, extras } = channelExtras(dir, spec, api);
  const doc = normalize(spec, { ...(api as NormalizeOptions), extras });
  placeChannels(doc, read!, api as NormalizeOptions);
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

test("llms: a list of channels for llms.txt, and a section for llms-full.txt without fields or examples", () => {
  const { index, full } = channelLlms(dir, spec, {}, (u) => `https://docs.test${u}`);
  assert.match(index, /### WebSocket channels\n\n- \[Stream input\]\(https:\/\/docs\.test\/api-reference\/speech#stream-input-1\): `wss:\/\/api\.acme\.test\/v1\/speech\/\{id\}\/stream-input`/);
  assert.match(full, /# WebSocket channels\n\n## Stream input\n\n\[Speech › Stream input\]\(https:\/\/docs\.test\/api-reference\/speech#stream-input-1\) · `WSS wss:\/\/api\.acme\.test\/v1\/speech\/\{id\}\/stream-input`/);
  assert.match(full, /Path parameters:\n\n- `id`: Which one\./);
  assert.match(full, /Messages:\n\n- Send `text`: Some text\.\n- Receive `audio` \(deprecated\)/);
  assert.doesNotMatch(full, /```/);
  // No document, nothing.
  assert.deepEqual(channelLlms(path.join(dir, "none"), spec, {}), { index: "", full: "" });
});
