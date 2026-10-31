import { test } from "node:test";
import assert from "node:assert/strict";
// lib/ imports resolve via test/setup.mjs, which `npm test` loads first.
import { collapseNullable, schemaFields, typeLabel } from "../lib/openapi-schema.ts";
import { sampleFromSchema } from "../lib/openapi.ts";
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
    secret: { type: "string", "x-fern-ignore": true },
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
    { hideExtensions: ["x-fern-ignore"] },
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
    ["A", ["stability", "speed", "secret"]],
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
