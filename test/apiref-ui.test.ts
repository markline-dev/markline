import { test } from "node:test";
import assert from "node:assert/strict";
// lib/ imports resolve via test/setup.mjs, which `npm test` loads first.
import { normalize } from "../lib/openapi.ts";
import { buildApiRefView } from "../lib/apiref-view.ts";

const ok = (content?: Record<string, unknown>) => ({ description: "OK", ...(content ? { content } : {}) });
const json = { "application/json": { schema: { type: "object" } } };
const sse = { "text/event-stream": { schema: { type: "string" } } };

const spec = {
  openapi: "3.1.0",
  info: { title: "t", version: "1" },
  tags: [{ name: "speech" }],
  components: { responses: { Streamed: ok(sse) } },
  paths: {
    "/fern": { post: { operationId: "fern", summary: "Fern", tags: ["speech"], "x-fern-streaming": true, responses: { "200": ok(json) } } },
    "/both": { post: { operationId: "both", summary: "Both", tags: ["speech"], responses: { "200": ok({ ...json, ...sse }) } } },
    "/charset": { get: { operationId: "charset", summary: "Charset", tags: ["speech"], responses: { "200": ok({ "text/event-stream; charset=utf-8": {} }) } } },
    "/ref": { get: { operationId: "ref", summary: "Ref", tags: ["speech"], responses: { "200": { $ref: "#/components/responses/Streamed" } } } },
    "/error-only": { get: { operationId: "errorOnly", summary: "Error only", tags: ["speech"], responses: { "200": ok(json), "500": ok(sse) } } },
    "/plain/{id}": { get: { operationId: "plain", summary: "Plain", tags: ["speech"], responses: { "200": ok(json) } } },
  },
};

test("STREAM comes from the spec alone: x-fern-streaming, or a 2xx event stream beside anything else", () => {
  const doc = normalize(spec, {});
  const streaming = Object.values(doc.operationsById)
    .filter((o) => o.streaming)
    .map((o) => o.operationId)
    .sort();
  assert.deepEqual(streaming, ["both", "charset", "fern", "ref"]);
  assert.equal(doc.operationsById.errorOnly.streaming, undefined, "only a 2xx stream counts");
});

test("the view carries STREAM to the endpoint list, the sidebar and the section", () => {
  const doc = normalize(spec, {});
  const view = buildApiRefView(doc, spec, "speech");
  const r = view.resource;
  const flagged = (list: { streaming?: boolean }[]) => list.filter((x) => x.streaming).length;
  assert.equal(flagged(r.endpoints), 4);
  assert.equal(flagged(r.sections), 4);
  const active = view.nav.find((n) => n.kind === "resource" && n.active);
  assert.ok(active && active.kind === "resource");
  assert.equal(flagged(active.ops), 4);
});

test("the breadcrumb names the section, and stays out of ids and search titles", () => {
  const doc = normalize(spec, { sections: [{ title: "Voice", tags: ["speech"] }] });
  const view = buildApiRefView(doc, spec, "speech");
  assert.equal(view.resource.section, "Voice");
  assert.equal(buildApiRefView(normalize(spec, {}), spec, "speech").resource.section, undefined);
  // Ids and search titles come from the operation alone.
  assert.deepEqual(
    view.resource.sections.map((s) => s.id),
    ["fern", "both", "charset", "ref", "error-only", "plain"],
  );
  assert.ok(view.search.filter((s) => s.verb).every((s) => !s.title.includes("Voice")));
});

test("the active resource is named once in the sidebar: its heading, not a first jump too", () => {
  const view = buildApiRefView(normalize(spec, {}), spec, "speech");
  const active = view.nav.find((n) => n.kind === "resource" && n.active);
  assert.ok(active && active.kind === "resource");
  assert.equal(active.ops.some((o) => o.id === active.slug || o.name === active.name), false);
  assert.equal(active.ops.length, view.resource.sections.length);
});
