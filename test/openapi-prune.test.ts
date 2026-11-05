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

const ref = (n: string) => ({ $ref: `#/components/schemas/${n}` });
const json = (schema: unknown, extra: object = {}) => ({ content: { "application/json": { schema, ...extra } } });
// The common ways a hidden schema gets referred to.
const shapes = {
  paths: {
    "/fields": {
      post: op("fields", {
        requestBody: json(ref("Leak")),
        responses: {
          "200": { description: "ok", ...json(ref("Leak")) },
          default: { description: "err", ...json({ type: "object", properties: { code: { type: "string" }, MARK_DEFAULT_RESPONSE: { type: "string", "x-internal": true } } }) },
        },
      }),
    },
    "/direct": { post: op("direct", { requestBody: json(ref("HiddenBig")), responses: { "200": { description: "kept", ...json(ref("HiddenBig")) } } }) },
    "/inline": { post: op("inline", { requestBody: json({ type: "object", "x-internal": true, properties: { MARK_INLINE: { type: "string" } } }) }) },
    "/params/{id}": {
      get: op("params", {
        parameters: [
          { name: "id", in: "path", required: true, schema: ref("HiddenBig") },
          { name: "q_hidden_schema", in: "query", schema: ref("HiddenBig") },
          { name: "q_ok", in: "query", schema: { type: "string" } },
        ],
      }),
    },
    "/examples": {
      post: op("examples", {
        requestBody: json(ref("WithExample"), {
          example: { vis: "v", secret: "MARK_MEDIA_EXAMPLE" },
          examples: { one: { value: { vis: "v", secret: "MARK_NAMED_EXAMPLE" } } },
        }),
      }),
    },
  },
  components: {
    schemas: {
      HiddenBig: { type: "object", "x-internal": true, properties: { MARK_HIDDEN_FIELD: { type: "string" } } },
      WrapHidden: { anyOf: [ref("HiddenBig"), NULL] },
      WrapWrap: { allOf: [ref("WrapHidden")] },
      A: { type: "object", properties: { aa: { type: "string" } } },
      default: { type: "object", properties: { ok: { type: "string" }, MARK_DEFAULT_SCHEMA: { type: "string", "x-internal": true } } },
      WithExample: {
        type: "object",
        example: { vis: "v", secret: "MARK_SCHEMA_EXAMPLE", nested: { MARK_NESTED: "x", kept: 1 }, list: [{ MARK_IN_LIST: 1, kept: 2 }] },
        properties: {
          vis: { type: "string" },
          secret: { type: "string", "x-internal": true },
          nested: { type: "object", properties: { MARK_NESTED: { type: "string", "x-internal": true }, kept: { type: "integer" } } },
          list: { type: "array", items: { type: "object", properties: { MARK_IN_LIST: { type: "string", "x-internal": true }, kept: { type: "integer" } } } },
        },
      },
      Leak: {
        type: "object",
        properties: {
          keep: { type: "string" },
          f_allof: { allOf: [ref("HiddenBig")], description: "MARK_ROW_ALLOF" },
          f_allof_desc: { allOf: [ref("HiddenBig"), { nullable: true, description: "MARK_ROW_ALLOF2" }] },
          f_addl: { type: "object", additionalProperties: ref("HiddenBig"), description: "MARK_ROW_ADDL" },
          f_arr31: { type: ["array", "null"], items: ref("HiddenBig"), description: "MARK_ROW_ARR31" },
          f_wrap: ref("WrapHidden"),
          f_wrapwrap: ref("WrapWrap"),
          f_disc: { oneOf: [ref("A"), ref("HiddenBig")], discriminator: { propertyName: "kind", mapping: { a: "#/components/schemas/A", MARK_MAPPING: "#/components/schemas/HiddenBig" } } },
          f_default: ref("default"),
          // Names that are keywords elsewhere are only names here.
          example: { type: "string", "x-internal": true, description: "MARK_FIELD_EXAMPLE" },
          parameters: { type: "string", description: "field called parameters" },
          enum: { type: "string", description: "field called enum" },
        },
      },
    },
  },
};

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

const deepFreeze = <T>(v: T): T => {
  if (v && typeof v === "object") {
    Object.values(v).forEach(deepFreeze);
    Object.freeze(v);
  }
  return v;
};

test("the input isn't changed, and no extensions means no work", () => {
  const before = JSON.stringify(spec);
  // Frozen, so a write anywhere in the walk throws.
  pruneSpec(deepFreeze(structuredClone(spec)), EXTS);
  pruneSpec(deepFreeze(structuredClone(shapes)), EXTS);
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

test("no route can resolve a hidden schema, however it's referred to", () => {
  const pruned = pruneSpec(shapes as any, EXTS);
  const text = JSON.stringify(pruned);
  assert.deepEqual([...new Set(text.match(/MARK_[A-Z_0-9]+/g) ?? [])], []);
  assert.ok(!("HiddenBig" in pruned.components.schemas));
  assert.ok(!("WrapHidden" in pruned.components.schemas));
  assert.ok(!("WrapWrap" in pruned.components.schemas));
  assert.ok(!text.includes("#/components/schemas/HiddenBig"), "nothing left points at it");
  assert.deepEqual(Object.keys(pruned.components.schemas.Leak.properties), ["keep", "f_disc", "f_default", "parameters", "enum"]);
});

test("a status or schema called default is pruned like any other", () => {
  const pruned = pruneSpec(shapes as any, EXTS);
  assert.deepEqual(Object.keys(pruned.paths["/fields"].post.responses.default.content["application/json"].schema.properties), ["code"]);
  assert.deepEqual(Object.keys(pruned.components.schemas.default.properties), ["ok"]);
});

test("a whole hidden schema: the operation stays, without a body", () => {
  const doc = normalize(shapes, { hideExtensions: EXTS });
  const direct = doc.operationsById.direct;
  assert.equal(direct.requestBody, undefined);
  assert.equal(direct.responses[0].description, "kept");
  assert.equal(direct.responses[0].schema, undefined);
  assert.equal(doc.operationsById.inline.requestBody, undefined);
  const params = doc.operationsById.params.parameters;
  assert.deepEqual(params.query.map((p) => p.name), ["q_ok"]);
  assert.deepEqual([params.path[0].name, params.path[0].schema], ["id", undefined]);
});

test("object examples lose hidden keys, at every level", () => {
  const pruned = pruneSpec(shapes as any, EXTS);
  assert.deepEqual(pruned.components.schemas.WithExample.example, { vis: "v", nested: { kept: 1 }, list: [{ kept: 2 }] });
  const media = pruned.paths["/examples"].post.requestBody.content["application/json"] as { example: unknown; examples: { one: { value: unknown } } };
  assert.deepEqual(media.example, { vis: "v" });
  assert.deepEqual(media.examples.one.value, { vis: "v" });
  // What the samples and Try it read.
  assert.deepEqual(sampleFromSchema(ref("WithExample"), pruned), { vis: "v", nested: { kept: 1 }, list: [{ kept: 2 }] });
});

test("examples written as strings aren't rewritten, as the docs say", () => {
  const s = { components: { schemas: { S: { type: "string", example: "secret text" } } } };
  assert.equal(pruneSpec(s, EXTS).components.schemas.S.example, "secret text");
});

test("schemas left with only deleted ones go too, whatever order they're declared in", () => {
  const pruned = pruneSpec(
    {
      components: {
        schemas: {
          C: { allOf: [ref("B")] },
          B: { anyOf: [ref("A"), NULL] },
          A: { type: "object", "x-internal": true },
          Uses: { type: "object", properties: { keep: { type: "string" }, c: ref("C") } },
        },
      },
    } as any,
    EXTS,
  );
  assert.deepEqual(Object.keys(pruned.components.schemas), ["Uses"]);
  assert.deepEqual(Object.keys(pruned.components.schemas.Uses.properties), ["keep"]);
});
