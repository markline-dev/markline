import { test } from "node:test";
import assert from "node:assert/strict";
// lib/ imports resolve via test/setup.mjs, which `npm test` loads first.
import { normalize, type NormalizeOptions } from "../lib/openapi.ts";
import { buildApiRefView } from "../lib/apiref-view.ts";

// The events a resource page shows, as rendered: one list (pageEvents) for the
// page's Events section, its sidebar, its ids and the command palette. Synthetic.

const op = (id: string, tags: string[], extra: Record<string, unknown> = {}) => ({ operationId: id, summary: id, tags, responses: { 200: { description: "ok" } }, ...extra });
const body = (props: Record<string, unknown>) => ({ requestBody: { content: { "application/json": { schema: { type: "object", properties: props } } } } });
const view = (spec: object, api: Record<string, unknown>, slug: string) => {
  const doc = normalize(spec, api as NormalizeOptions);
  return buildApiRefView(doc, spec, slug);
};
const pageEvents = (v: ReturnType<typeof buildApiRefView>) => v.resource.events.map((e) => [e.name, e.summary]);
const searched = (v: ReturnType<typeof buildApiRefView>) => v.search.filter((s) => s.href.includes("#event-")).map((s) => s.title).sort();

test("webhooks tagged for a page are among its events: the Events section, the sidebar and the palette", () => {
  const spec = {
    openapi: "3.1.0",
    info: { title: "t", version: "1" },
    tags: [{ name: "speech" }],
    paths: { "/s": { get: op("s", ["speech"]) } },
    webhooks: { "speech.done": { post: { summary: "Finished.", tags: ["speech"], ...body({ id: { type: "string" } }) } } },
  };
  const v = view(spec, {}, "speech");
  assert.deepEqual(pageEvents(v), [["speech.done", "Finished."]]);
  assert.ok(v.nav.flatMap((n) => (n.kind === "resource" ? n.ops : [])).some((o) => o.name === "speech.done" && o.evt));
  assert.deepEqual(searched(v), ["speech.done"]);
});

test("a webhook tagged with a tag merged into the page, or one of the page's URL, is on that page", () => {
  const spec = {
    openapi: "3.1.0",
    info: { title: "t", version: "1" },
    tags: [{ name: "speech" }, { name: "Speech" }, { name: "old" }],
    paths: { "/s": { get: op("s", ["speech"]) }, "/S": { get: op("S", ["Speech"]) }, "/o": { get: op("o", ["old"]) } },
    webhooks: {
      "via.merge": { post: { summary: "Via mergeInto.", tags: ["old"] } },
      "via.slug": { post: { summary: "Via the same URL.", tags: ["Speech"] } },
    },
  };
  const v = view(spec, { tags: { old: { mergeInto: "speech" } } }, "speech");
  assert.deepEqual(pageEvents(v), [["via.merge", "Via mergeInto."], ["via.slug", "Via the same URL."]]);
  assert.deepEqual(searched(v), ["via.merge", "via.slug"]);
});

test("one event from several sources: the first to give a field wins it, later ones fill gaps", () => {
  const spec = {
    openapi: "3.1.0",
    info: { title: "t", version: "1" },
    tags: [{ name: "speech", "x-events": { dup: { summary: "From the tag." } } }],
    paths: {
      "/s": {
        post: op("s", ["speech"], {
          callbacks: { dup: { "{$request.body#/url}": { post: { summary: "From the callback.", ...body({ fromcallback: { type: "string" } }) } } } },
        }),
      },
    },
    webhooks: { dup: { post: { summary: "From the webhook.", tags: ["speech"], ...body({ fromwebhook: { type: "string" } }) } } },
  };
  const v = view(spec, {}, "speech");
  const dup = v.resource.events.find((e) => e.name === "dup")!;
  // The tag gave the summary first; the callback gave the first payload.
  assert.equal(dup.summary, "From the tag.");
  assert.deepEqual(dup.attrs.map((a) => a.name), ["fromcallback"]);
  // The palette shows what the page shows.
  assert.equal(v.search.find((s) => s.title === "dup")!.snippet, "From the tag.");
});

test("tags merged into one page by mergeInto and by URL: the spec's first declaration of an event wins, on the page and in the palette", () => {
  const spec = {
    openapi: "3.1.0",
    info: { title: "t", version: "1" },
    tags: [{ name: "Dubbing" }, { name: "dubbing", "x-events": { same: { summary: "From dubbing." } } }, { name: "legacy", "x-events": { same: { summary: "From legacy." } } }],
    paths: { "/d": { get: op("d", ["Dubbing"]) }, "/dd": { get: op("dd", ["dubbing"]) }, "/l": { get: op("l", ["legacy"]) } },
  };
  const v = view(spec, { tags: { legacy: { mergeInto: "Dubbing" } } }, "dubbing");
  assert.deepEqual(pageEvents(v), [["same", "From dubbing."]]);
  assert.equal(v.search.find((s) => s.title === "same")!.snippet, "From dubbing.");
});
