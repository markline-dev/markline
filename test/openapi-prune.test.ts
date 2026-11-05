import { test } from "node:test";
import assert from "node:assert/strict";
// lib/ imports resolve via test/setup.mjs, which `npm test` loads first.
import { pruneSpec } from "../lib/openapi-prune.ts";
import { normalize, sampleFromSchema } from "../lib/openapi.ts";
import { schemaFields } from "../lib/openapi-schema.ts";
import { resolveSchema } from "../lib/openapi.ts";

const EXTS = ["x-internal", "x-fern-ignore"];
const NULL = { type: "null" };
const op = (operationId: string, extra: Record<string, unknown> = {}) => ({ operationId, responses: { "200": { description: "OK" } }, ...extra });

const spec = {
  paths: {
    "/open/{id}": {
      parameters: [{ name: "id", in: "path", required: true, "x-internal": true, schema: { type: "string" } }],
      get: op("open", {
        parameters: [
          { name: "q_ok", in: "query", schema: { type: "string" } },
          { name: "q_hidden", in: "query", "x-internal": true, schema: { type: "string" } },
          { $ref: "#/components/parameters/HiddenParam" },
        ],
      }),
      post: op("hiddenOp", { "x-fern-ignore": true }),
      put: op("withBody", {
        requestBody: { content: { "application/json": { schema: { $ref: "#/components/schemas/Top" } } } },
        "x-events": { shown: { summary: "s" }, hiddenEvent: { "x-internal": true } },
        callbacks: { cbGone: { "{$url}": { post: op("cbHidden", { "x-internal": true }) } }, cbKept: { "{$other}": { post: op("cbShown") } } },
      }),
    },
    "/hidden-item": { "x-internal": true, get: op("hiddenItem") },
  },
  webhooks: {
    hiddenHook: { post: { summary: "h", "x-internal": true } },
    okHook: { post: { summary: "ok" } },
  },
  components: {
    parameters: { HiddenParam: { name: "q_ref", in: "query", "x-internal": true, schema: { type: "string" } } },
    schemas: {
      HiddenObj: { type: "object", "x-internal": true, properties: { secret: { type: "string" } } },
      Inner: { type: "object", properties: { a: { type: "string" }, gone: { type: "string", "x-fern-ignore": true } }, required: ["a", "gone"] },
      Top: {
        type: "object",
        required: ["keep", "flagged"],
        properties: {
          keep: { type: "string" },
          flagged: { type: "string", "x-internal": true },
          sib: { $ref: "#/components/schemas/Inner", "x-internal": true },
          ref: { $ref: "#/components/schemas/HiddenObj" },
          member: { anyOf: [{ $ref: "#/components/schemas/HiddenObj" }, NULL] },
          arr: { type: "array", items: { $ref: "#/components/schemas/HiddenObj" } },
          partial: { anyOf: [{ $ref: "#/components/schemas/HiddenObj" }, { $ref: "#/components/schemas/Inner" }, NULL] },
          nested: { $ref: "#/components/schemas/Inner" },
          parameters: { type: "string", example: { "x-internal": true } },
        },
      },
    },
  },
};

const top = (pruned: typeof spec) => pruned.components.schemas.Top;

test("hidden fields go, in every spelling, and leave `required`", () => {
  const pruned = pruneSpec(spec, EXTS);
  assert.deepEqual(Object.keys(top(pruned).properties), ["keep", "partial", "nested", "parameters"]);
  assert.deepEqual(top(pruned).required, ["keep"]);
  assert.deepEqual(pruned.components.schemas.Inner.required, ["a"]);
  assert.equal(top(pruned).properties.partial.anyOf.length, 2, "a visible member of the union stays");
});

test("the walk treats property names as names and leaves examples alone", () => {
  const pruned = pruneSpec(spec, EXTS);
  assert.deepEqual((top(pruned).properties.parameters as { example: unknown }).example, { "x-internal": true });
});

test("the input isn't changed, and no extensions means no work", () => {
  const before = JSON.stringify(spec);
  pruneSpec(spec, EXTS);
  assert.equal(JSON.stringify(spec), before);
  assert.equal(pruneSpec(spec, []), spec);
});

test("normalize drops hidden operations, path items, parameters, events and webhooks", () => {
  const doc = normalize(spec, { hideExtensions: EXTS });
  assert.deepEqual(Object.keys(doc.operationsById), ["open", "withBody"]);
  assert.deepEqual(doc.operationsById.open.parameters.query.map((p) => p.name), ["q_ok"]);
  assert.deepEqual(doc.operationsById.open.parameters.path.map((p) => p.name), ["id"], "a path parameter stays: the URL needs it");
  assert.deepEqual(doc.webhooks.map((w) => w.name), ["okHook"]);
  assert.deepEqual(doc.operationsById.withBody.events.map((e) => e.name), ["shown", "cbKept"]);
});

test("samples and field rows built from the pruned root can't publish hidden fields", () => {
  const pruned = pruneSpec(spec, EXTS);
  const body = { $ref: "#/components/schemas/Top" };
  assert.ok(!JSON.stringify(sampleFromSchema(body, pruned)).includes("flagged"));
  const names = schemaFields(resolveSchema(body, pruned)).map((f) => f.name);
  assert.ok(names.includes("keep") && !names.includes("sib") && !names.includes("member"));
  const nested = schemaFields(resolveSchema(body, pruned)).find((f) => f.name === "nested")!;
  assert.deepEqual(nested.children!.map((c) => c.name), ["a"]);
});
