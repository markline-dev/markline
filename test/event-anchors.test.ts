import { after, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
// lib/ imports resolve via test/setup.mjs, which `npm test` loads first.
import { normalize, placeChannels, type NormalizeOptions } from "../lib/openapi.ts";
import { operationAnchors } from "../lib/apiref-view.ts";
import { tagSlug } from "../lib/openapi-tags.ts";
import { pageEvents } from "../scripts/openapi-events.mjs";
import { pruneSpec } from "../scripts/openapi-prune.mjs";
import { channelExtras, channelPages } from "../scripts/asyncapi-build.mjs";

// The events on a page reserve their ids (event-<name>), so a channel titled like
// one is numbered past it. pageEvents is the one rule for which events those are,
// for the page and for the build's links. Synthetic specs only.

const op = (id: string, tags: string[], extra: Record<string, unknown> = {}) => ({ operationId: id, summary: id, tags, responses: { 200: { description: "ok" } }, ...extra });
const cb = (summary: string, extra: Record<string, unknown> = {}) => ({ "{$request.body#/url}": { post: { summary, ...extra } } });
const spec = {
  openapi: "3.1.0",
  info: { title: "t", version: "1" },
  tags: [{ name: "speech", "x-events": { tagged: { summary: "From the tag." } } }, { name: "old", "x-events": { merged: { summary: "From a merged tag." } } }],
  paths: {
    "/v1/speech/{id}": { post: op("make", ["speech"], { callbacks: { called: cb("A callback."), secretcb: { ...cb("Hidden."), "x-internal": true } }, "x-events": { opevent: { summary: "From the op." } } }) },
    "/v1/old": { get: op("legacy", ["old"]) },
  },
  webhooks: {
    hooked: { post: { summary: "A webhook.", tags: ["speech"] } },
    secretwh: { post: { summary: "Hidden.", tags: ["speech"], "x-internal": true } },
  },
};
const api = { tags: { old: { mergeInto: "speech" } } };
const titles = ["tagged", "merged", "called", "opevent", "hooked", "secretwh", "secretcb", "nothing"];

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "markline-event-anchors-"));
after(() => fs.rmSync(dir, { recursive: true, force: true }));
fs.mkdirSync(path.join(dir, "api"));
fs.writeFileSync(
  path.join(dir, "api", "asyncapi.json"),
  JSON.stringify({
    asyncapi: "2.6.0",
    info: { title: "t", version: "1" },
    channels: Object.fromEntries(titles.map((t) => [`/v1/speech/{id}/${t}`, { "x-title": `Event ${t}`, subscribe: { message: { name: t } } }])),
  }),
);

test("pageEvents: a page's events come from its tags' x-events, its operations, and the webhooks tagged for it; hidden ones go", () => {
  const raw = pruneSpec(spec, ["x-internal", "x-hidden"]);
  const events = pageEvents(raw, {
    tags: raw.tags,
    ops: [{ page: "speech", op: raw.paths["/v1/speech/{id}"].post }, { page: "speech", op: raw.paths["/v1/old"].get }],
    pageOf: (t: string) => (t === "old" ? "speech" : t),
  });
  assert.deepEqual(
    events.get("speech")!.map((e) => e.name),
    ["called", "hooked", "merged", "opevent", "tagged"],
  );
});

test("a channel titled like one of its page's events is numbered past it, on the page and in the build's links", () => {
  const placement = channelExtras(dir, spec, api);
  const doc = normalize(spec, { ...(api as NormalizeOptions), extras: placement.extras });
  placeChannels(doc, placement);
  const speech = doc.tags.find((t) => t.name === "speech")!;
  const ids = operationAnchors(speech, doc);
  const onPage = Object.fromEntries(speech.channels!.map((c) => [c.title, `/api-reference/${tagSlug(speech.name)}#${ids.get(c)}`]));
  const built = Object.fromEntries(channelPages(dir, spec, api).map((p) => [p.channel.title, p.url]));
  const expected = Object.fromEntries(
    titles.map((t) => [
      `Event ${t}`,
      // Each source's event reserves its id; a hidden one, or none, doesn't.
      `/api-reference/speech#event-${t}${["secretwh", "secretcb", "nothing"].includes(t) ? "" : "-1"}`,
    ]),
  );
  assert.deepEqual(onPage, expected);
  assert.deepEqual(built, expected);
});
