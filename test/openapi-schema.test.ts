import { test } from "node:test";
import assert from "node:assert/strict";
// lib/ imports resolve via test/setup.mjs, which `npm test` loads first.
import { collapseNullable, isDeprecatedParam, paramField, schemaFields, typeLabel } from "../lib/openapi-schema.ts";
import { resolveSchema, sampleFromSchema } from "../lib/openapi.ts";
import type { JSONSchema } from "../lib/openapi.ts";

const NULL = { type: "null" };

test("anyOf [X, null] reads as X, nullable, keeping the wrapper's description", () => {
  const { schema, nullable } = collapseNullable({ anyOf: [{ type: "integer", minimum: 0 }, NULL], description: "Seed" });
  assert.equal(nullable, true);
  assert.deepEqual(schema, { type: "integer", minimum: 0, description: "Seed" });
});

test("other nullable spellings: type arrays, nullable: true, oneOf, one-member allOf", () => {
  assert.equal(typeLabel({ type: ["string", "null"] }), "string");
  assert.equal(collapseNullable({ type: ["string", "null"] }).nullable, true);
  assert.equal(collapseNullable({ type: "string", nullable: true }).nullable, true);
  assert.equal(typeLabel({ oneOf: [NULL, { type: "boolean" }] }), "boolean");
  assert.equal(typeLabel({ allOf: [{ type: "object", properties: { a: {} } }] }), "object");
  assert.equal(collapseNullable({ anyOf: [{ allOf: [{ type: "number" }] }, NULL] }).schema.type, "number");
});

test("real unions list their members; null is dropped from the label", () => {
  assert.equal(typeLabel({ anyOf: [{ type: "string" }, { type: "integer" }, NULL] }), "string | integer");
  assert.equal(
    typeLabel({ anyOf: [{ type: "object", title: "TextSource", properties: {} }, { type: "object", title: "UrlSource", properties: {} }] }),
    "TextSource | UrlSource",
  );
  assert.equal(typeLabel({ type: "array", items: { anyOf: [{ type: "string" }, NULL] } }), "array<string>");
});

const voiceSettings: JSONSchema = {
  type: "object",
  title: "VoiceSettings",
  required: ["stability"],
  properties: {
    stability: { anyOf: [{ type: "number" }, NULL], description: "How stable." },
    speed: { type: "number", deprecated: true },
  },
};

test("schemaFields gives a nullable object field its nested fields", () => {
  const fields = schemaFields(
    {
      type: "object",
      properties: {
        voice_settings: { anyOf: [voiceSettings, NULL], description: "Voice settings." },
        seed: { anyOf: [{ type: "integer" }, NULL] },
      },
    },
  );
  assert.equal(fields[0].type, "object");
  assert.equal(fields[0].nullable, true);
  assert.equal(fields[0].description, "Voice settings.");
  assert.deepEqual(fields[0].children!.map((c) => [c.name, c.type, c.required, !!c.nullable, !!c.deprecated]), [
    ["stability", "number", true, true, false],
    ["speed", "number", false, false, true],
  ]);
  assert.deepEqual([fields[1].type, fields[1].nullable, fields[1].children], ["integer", true, undefined]);
});

test("unions of objects become variants; depth is limited", () => {
  const [src] = schemaFields({
    type: "object",
    properties: {
      source: { anyOf: [{ ...voiceSettings, title: "A" }, { type: "object", title: "B", properties: { url: { type: "string" } } }, NULL] },
    },
  });
  assert.deepEqual(src.variants!.map((v) => [v.label, v.fields.map((f) => f.name)]), [
    ["A", ["stability", "speed"]],
    ["B", ["url"]],
  ]);
  const deep: JSONSchema = { type: "object", properties: { a: { type: "object", properties: { b: { type: "object", properties: { c: { type: "string" } } } } } } };
  const [a] = schemaFields(deep, { depth: 1 });
  assert.equal(a.children![0].name, "b");
  assert.equal(a.children![0].children, undefined);
});

test("array items of objects are listed as children; enums drop null", () => {
  const [f] = schemaFields({
    type: "object",
    properties: {
      locators: { anyOf: [{ type: "array", items: { type: "object", properties: { id: { type: "string" } } } }, NULL] },
    },
  });
  assert.equal(f.type, "array<object>");
  assert.deepEqual(f.children!.map((c) => c.name), ["id"]);
  const [e] = schemaFields({ type: "object", properties: { m: { anyOf: [{ type: "string", enum: ["a", "b"] }, NULL] } } });
  assert.deepEqual(e.enums, ["a", "b"]);
});

test("samples skip the null member of a union", () => {
  assert.equal(sampleFromSchema({ anyOf: [NULL, { type: "integer", minimum: 3 }] }), 3);
});

test("edge spellings: only-null type, const null, null-first type arrays", () => {
  assert.equal(typeLabel({ type: ["null"] }), "null");
  assert.equal(collapseNullable({ type: ["null"] }).nullable, false);
  const c = collapseNullable({ anyOf: [{ type: "string" }, { const: null }] });
  assert.deepEqual([c.schema.type, c.nullable], ["string", true]);
  assert.equal(sampleFromSchema({ type: ["null", "integer"], minimum: 2 }), 2);
});

test("allOf keeps the ref's fields beside its own, and any part's nullable", () => {
  const [f] = schemaFields({
    type: "object",
    properties: { x: { allOf: [{ type: "object", properties: { a: { type: "string" } } }], properties: { extra: { type: "string" } } } },
  });
  assert.deepEqual(f.children!.map((c) => c.name), ["a", "extra"]);
  const [g] = schemaFields({
    type: "object",
    properties: { y: { allOf: [{ type: "object", properties: { a: { type: "string" } } }, { nullable: true, description: "Why" }] } },
  });
  assert.deepEqual([g.nullable, g.description], [true, "Why"]);
});

test("an array of a union of objects lists its variants", () => {
  const [f] = schemaFields({
    type: "object",
    properties: {
      list: {
        type: "array",
        items: { anyOf: [{ type: "object", title: "A", properties: { a: {} } }, { type: "object", title: "B", properties: { b: {} } }] },
      },
    },
  });
  assert.deepEqual(f.variants!.map((v) => v.label), ["A", "B"]);
});

test("keys beside a $ref describe this use of it", () => {
  const root = { components: { schemas: { Inner: { type: "object", description: "Inner", properties: { a: { type: "string" } } } } } };
  const s = resolveSchema({ $ref: "#/components/schemas/Inner", description: "Here", deprecated: true } as JSONSchema, root)!;
  assert.deepEqual([s.description, s.deprecated, Object.keys(s.properties!)], ["Here", true, ["a"]]);
  assert.equal(resolveSchema({ $ref: "#/components/schemas/Inner" } as JSONSchema, root)!.description, "Inner");
});

test("paramField reads deprecated and nullable from the parameter or its schema", () => {
  const onParam = paramField({ name: "q", deprecated: true, schema: { type: "string" } }, false);
  assert.deepEqual([onParam.deprecated, onParam.nullable, onParam.optional], [true, undefined, true]);
  const onSchema = paramField({ name: "q", schema: { anyOf: [{ type: "string", enum: ["a"] }, NULL], deprecated: true, description: "D" } }, true);
  assert.deepEqual([onSchema.deprecated, onSchema.nullable, onSchema.enums, onSchema.description], [true, true, ["a"], "D"]);
});

test("fields beside a $ref add to the target's", () => {
  const root = { components: { schemas: { Sib: { type: "object", required: ["s"], properties: { s: { type: "string" } } } } } };
  const r = resolveSchema({ $ref: "#/components/schemas/Sib", required: ["extra"], properties: { extra: { type: "string" } } } as JSONSchema, root)!;
  assert.deepEqual(Object.keys(r.properties!), ["s", "extra"]);
  assert.deepEqual(r.required, ["s", "extra"]);
});

test("a parameter is deprecated by itself or by its schema", () => {
  assert.equal(isDeprecatedParam(true, { type: "string" }, { type: "string" }), true);
  assert.equal(isDeprecatedParam(undefined, { deprecated: true }, {}), true);
  assert.equal(isDeprecatedParam(undefined, { anyOf: [] }, { deprecated: true }), true);
  assert.equal(isDeprecatedParam(false, { type: "string" }, { type: "string" }), false);
});
