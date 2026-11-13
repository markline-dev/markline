import { test } from "node:test";
import assert from "node:assert/strict";
// lib/ imports resolve via test/setup.mjs, which `npm test` loads first.
import { uniqueAnchors } from "../scripts/apiref-anchors.mjs";
import { buildApiRefView, operationAnchors } from "../lib/apiref-view.ts";
import { normalize } from "../lib/openapi.ts";

test("a repeat is numbered; the first, and any operation's own slug, are left alone", () => {
  assert.deepEqual(uniqueAnchors(["a", "b", "c"]), ["a", "b", "c"]);
  assert.deepEqual(uniqueAnchors(["x", "x", "x"]), ["x", "x-1", "x-2"]);
  // "x 1" is its own operation's slug, so the repeat skips it.
  assert.deepEqual(uniqueAnchors(["x", "x", "x-1"]), ["x", "x-2", "x-1"]);
  // The page's own ids are never taken.
  assert.deepEqual(uniqueAnchors(["voices", "voices"], ["voices", "voices-1"]), ["voices-2", "voices-3"]);
});

const op = (operationId: string, summary: string, method = "get", extra: Record<string, unknown> = {}) => ({
  operationId,
  summary,
  tags: ["text-to-speech"],
  responses: { "200": { description: "OK" } },
  ...extra,
});

// What the ElevenLabs sample has: two operations with one summary, and an operation
// named like its resource. Plus an event, whose id is on the page too.
const spec = {
  openapi: "3.1.0",
  info: { title: "t", version: "1" },
  tags: [{ name: "text-to-speech" }],
  paths: {
    "/tts": { post: op("tts", "Text To Speech", "post") },
    "/a/dependents": { get: op("docDependents", "Get Dependent Agents List") },
    "/b/dependents": { get: op("toolDependents", "Get Dependent Agents List") },
    "/c": { get: op("listOne", "List") },
    "/d": { get: op("listTwo", "List") },
    "/e": { get: op("listOneLabelled", "List 1") },
    "/f": {
      // A repeat too, so "emitted by" has to use the numbered id.
      post: op("eventful", "List", "post", {
        "x-events": { "event.done": { payload: { type: "object", properties: { id: { type: "string" } } } } },
      }),
    },
  },
};

test("operationAnchors: one id each, the first keeps its own, and the page's ids are skipped", () => {
  const doc = normalize(spec, {});
  const byOp = operationAnchors(doc.tags[0], doc);
  const anchors = { get: (id: string) => byOp.get(doc.operationsById[id]), values: () => byOp.values(), size: byOp.size };
  assert.equal(anchors.get("docDependents"), "get-dependent-agents-list", "the first keeps its id");
  assert.equal(anchors.get("toolDependents"), "get-dependent-agents-list-1");
  // The resource itself is #text-to-speech, so the operation of that name moves.
  assert.equal(anchors.get("tts"), "text-to-speech-1");
  // "List 1" is its own operation's slug: the second "List" skips it.
  assert.equal(anchors.get("listOne"), "list");
  assert.equal(anchors.get("listOneLabelled"), "list-1");
  assert.equal(anchors.get("listTwo"), "list-2");
  assert.equal(anchors.get("eventful"), "list-3");
  assert.equal(new Set(anchors.values()).size, anchors.size);
});

test("every id on the page is unique, and every link to an operation lands on it", () => {
  const doc = normalize(spec, {});
  const view = buildApiRefView(doc, spec, "text-to-speech");
  const r = view.resource;
  const sectionIds = r.sections.map((s) => s.id);
  const pageIds = [r.slug, `${r.slug}-object`, `ep-panels-${r.slug}`, ...r.events.map((e) => e.id), ...sectionIds];
  assert.equal(new Set(pageIds).size, pageIds.length, pageIds.join(", "));
  // The endpoint list, the sidebar's jumps, events' "emitted by" and search all use the sections' ids.
  assert.deepEqual(r.endpoints.map((e) => e.id), sectionIds);
  const active = view.nav.find((n) => n.kind === "resource" && n.active);
  assert.ok(active && active.kind === "resource");
  assert.deepEqual(active.ops.filter((o) => o.verb).map((o) => o.id), sectionIds);
  // The sidebar heading jumps to the intro (#<slug>); no operation takes that id from it.
  assert.equal(active.ops.some((o) => o.id === r.slug), false);
  // "Emitted by" points at the section of the operation that emits it.
  const done = r.events.find((ev) => ev.name === "event.done");
  assert.deepEqual(done?.emittedBy.map((e) => e.id), [r.sections.find((sec) => sec.opId === "eventful")!.id]);
  const searched = view.search.filter((s) => s.verb).map((s) => s.href.split("#")[1]);
  assert.deepEqual(searched, sectionIds);
});

test("a spec with no repeats keeps every id it had", () => {
  const plain = {
    ...spec,
    paths: { "/a": { get: op("a", "Get Agent") }, "/b": { post: op("b", "Create Agent", "post") } },
  };
  const doc = normalize(plain, {});
  assert.deepEqual([...operationAnchors(doc.tags[0], doc).values()], ["get-agent", "create-agent"]);
});

test("two operations with one operationId: a warning, and still two anchors on the page", () => {
  const dup = {
    ...spec,
    paths: {
      "/a": { get: op("same", "Get Thing") },
      "/b": { post: op("same", "Get Thing", "post") },
    },
  };
  const doc = normalize(dup, {});
  assert.ok(doc.warnings.some((w) => w.includes('operationId "same" is used by both GET /a and POST /b')));
  const ops = doc.tags[0].operations;
  assert.equal(ops.length, 2, "the resource page shows both");
  const ids = [...operationAnchors(doc.tags[0], doc).values()];
  assert.deepEqual(ids, ["get-thing", "get-thing-1"]);
  const view = buildApiRefView(doc, dup, "text-to-speech");
  assert.deepEqual(view.resource.sections.map((s) => s.id), ids);
});
