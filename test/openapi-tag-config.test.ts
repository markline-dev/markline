import { test } from "node:test";
import assert from "node:assert/strict";
// lib/ imports resolve via test/setup.mjs, which `npm test` loads first.
import { normalize, type NormalizeOptions } from "../lib/openapi.ts";
import { isHiddenOperation, planTags, primaryTag, resolveTag } from "../lib/openapi-tag-config.ts";

type Op = Record<string, unknown>;
const op = (operationId: string, extra: Op = {}): Op => ({ operationId, responses: { "200": { description: "OK" } }, ...extra });

test("tags that differ only by case share one page and keep every operation", () => {
  const doc = normalize({
    tags: [{ name: "dubbing", description: "Dub audio." }],
    paths: {
      "/a": { get: op("a", { tags: ["dubbing"] }) },
      "/b": { get: op("b", { tags: ["Dubbing"] }) },
      "/c": { post: op("c", { tags: ["Dubbing"] }) },
    },
  });
  assert.deepEqual(doc.tags.map((t) => t.name), ["dubbing"]);
  assert.deepEqual(doc.tags[0].operations.map((o) => o.operationId), ["a", "b", "c"]);
  assert.equal(doc.operationsById.b.tag, "dubbing");
  assert.equal(doc.warnings.length, 1);
  assert.match(doc.warnings[0], /"dubbing", "Dubbing" share the URL \/api-reference\/dubbing/);
});

test("an explicit mergeInto merges without a warning", () => {
  const doc = normalize(
    { paths: { "/a": { get: op("a", { tags: ["dubbing"] }) }, "/b": { get: op("b", { tags: ["Dubbing"] }) } } },
    { tags: { Dubbing: { mergeInto: "dubbing" } } },
  );
  assert.deepEqual(doc.tags.map((t) => t.operations.length), [2]);
  assert.deepEqual(doc.warnings, []);
});

test("api.tags renames, hides, merges and reorders", () => {
  const opts: NormalizeOptions = {
    tags: {
      smb: { label: "Small business", description: "For teams." },
      "access:all": { hidden: true },
      "Conversational AI": { mergeInto: "Agents Platform" },
      default: { mergeInto: "Workspace/Misc" },
    },
    tagOrder: ["Agents Platform"],
  };
  const doc = normalize(
    {
      tags: [{ name: "smb", description: "spec text" }, { name: "Conversational AI" }, { name: "Agents Platform" }],
      paths: {
        "/s": { get: op("s", { tags: ["smb"] }) },
        "/x": { get: op("x", { tags: ["access:all"] }) },
        "/y": { get: op("y", { tags: ["access:all", "smb"] }) },
        "/c": { get: op("c", { tags: ["Conversational AI"] }) },
        "/p": { get: op("p", { tags: ["Agents Platform"] }) },
        "/d": { get: op("d", { tags: ["default"] }) },
      },
    },
    opts,
  );
  assert.deepEqual(doc.tags.map((t) => t.name), ["Agents Platform", "smb", "Workspace/Misc"]);
  const smb = doc.tags.find((t) => t.name === "smb")!;
  assert.equal(smb.displayName, "Small business");
  assert.equal(smb.description, "For teams.");
  assert.deepEqual(smb.operations.map((o) => o.operationId), ["s", "y"]);
  assert.equal(doc.operationsById.x, undefined, "an op whose only tag is hidden has no page");
  assert.deepEqual(doc.tags[0].operations.map((o) => o.operationId), ["c", "p"]);
  assert.equal(doc.tagLabels.smb, "Small business");
});

test("resolveTag follows mergeInto chains and stops on a cycle", () => {
  const opts = { tags: { a: { mergeInto: "b" }, b: { mergeInto: "c" }, x: { mergeInto: "y" }, y: { mergeInto: "x" } } };
  assert.equal(resolveTag("a", opts), "c");
  assert.equal(resolveTag("x", opts), "x");
  assert.equal(resolveTag("a", { tags: { a: { mergeInto: "b" }, b: { hidden: true } } }), null);
  assert.equal(resolveTag("constructor", {}), "constructor");
});

test("primaryTag files untagged ops under Default and skips hidden tags", () => {
  assert.equal(primaryTag(undefined), "Default");
  assert.equal(primaryTag([], { tags: { Default: { label: "Other" } } }), "Default");
  assert.equal(primaryTag(["h", "b"], { tags: { h: { hidden: true } } }), "b");
  assert.equal(primaryTag(["h"], { tags: { h: { hidden: true } } }), null);
});

test("planTags keeps the declared name when tagOrder pins the other variant", () => {
  const plan = planTags(["Dubbing", "dubbing"], ["dubbing"], { tagOrder: ["Dubbing"] });
  assert.deepEqual(plan.order, ["dubbing"]);
  assert.equal(plan.alias.get("Dubbing"), "dubbing");
});

test("hide extensions and deprecated operations", () => {
  assert.equal(isHiddenOperation({ "x-internal": true }), true);
  assert.equal(isHiddenOperation({ "x-fern-ignore": true }), false);
  assert.equal(isHiddenOperation({ "x-fern-ignore": true }, ["x-fern-ignore"]), true);
  assert.equal(isHiddenOperation({ deprecated: true }), false);
  assert.equal(isHiddenOperation({ deprecated: true }, [], false), true);
  const doc = normalize(
    { paths: { "/a": { get: op("a", { deprecated: true }), post: op("b", { "x-fern-ignore": true }) } } },
    { hideExtensions: ["x-fern-ignore"] },
  );
  assert.deepEqual(Object.keys(doc.operationsById), ["a"]);
  assert.equal(doc.operationsById.a.deprecated, true);
});

test("api.auth replaces the spec's security, except on explicitly public ops", () => {
  const doc = normalize(
    {
      components: { securitySchemes: { bearer: { type: "http", scheme: "bearer" } } },
      security: [{ bearer: [] }],
      paths: { "/a": { get: op("a"), post: op("b", { security: [] }) } },
    },
    { auth: { header: "xi-api-key" } },
  );
  assert.deepEqual(doc.operationsById.a.security, [{ name: "markline", scheme: { type: "apiKey", in: "header", name: "xi-api-key", description: undefined } }]);
  assert.deepEqual(doc.operationsById.b.security, []);
  assert.deepEqual(Object.keys(doc.securitySchemes), ["markline"]);
});

test("the build script's resource plan matches normalize() under api config", async () => {
  const modulePath = "../scripts/openapi-order.mjs";
  const { resourcePlan } = (await import(modulePath)) as {
    resourcePlan: (spec: object, api?: object) => { tags: string[]; ops: { op: { operationId: string }; tag: string }[] };
  };
  const api = {
    tags: { "access:all": { hidden: true }, Old: { mergeInto: "New/Group" } },
    tagOrder: ["zeta"],
    hideExtensions: ["x-fern-ignore"],
    showDeprecated: false,
  };
  const spec = {
    tags: [{ name: "alpha" }, { name: "Old" }, { name: "zeta" }],
    paths: {
      "/a": { get: op("a", { tags: ["alpha"] }), post: op("a2", { tags: ["ALPHA"] }) },
      "/o": { get: op("o", { tags: ["Old"] }), delete: op("gone", { tags: ["Old"], deprecated: true }) },
      "/z": { get: op("z", { tags: ["zeta"] }), put: op("ign", { tags: ["zeta"], "x-fern-ignore": true }) },
      "/x": { get: op("x", { tags: ["access:all"] }) },
      "/h": { get: op("h") },
    },
  };
  const doc = normalize(spec, api as NormalizeOptions);
  const plan = resourcePlan(spec, api);
  assert.deepEqual(plan.tags, doc.tags.map((t) => t.name));
  assert.deepEqual(
    plan.ops.map((o) => [o.op.operationId, o.tag]),
    Object.values(doc.operationsById).map((o) => [o.operationId, o.tag]),
  );
});

test("a header parameter that duplicates the API-key auth header is dropped", () => {
  const doc = normalize(
    { paths: { "/a": { get: op("a", { parameters: [{ name: "xi-api-key", in: "header" }, { name: "x-trace", in: "header" }] }) } } },
    { auth: { header: "xi-api-key" } },
  );
  assert.deepEqual(doc.operationsById.a.parameters.header.map((p) => p.name), ["x-trace"]);
});
