import { test } from "node:test";
import assert from "node:assert/strict";
// lib/ imports resolve via test/setup.mjs, which `npm test` loads first.
import { normalize, type NormalizeOptions } from "../lib/openapi.ts";
import { isHiddenOperation, planTags, primaryTag, resolveTag } from "../lib/openapi-tag-config.ts";
import { parseOpenApiTag, tagSlug } from "../lib/openapi-tags.ts";
import { codeSamples } from "../lib/openapi-codegen.ts";
import { curlSample } from "../lib/openapi-samples.ts";
import { buildPlaygroundSpec } from "../lib/playground-spec.ts";

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

type Mirror = {
  resourcePlan: (spec: object, api?: object) => { tags: string[]; ops: { op: { operationId: string }; tag: string }[]; warnings: string[] };
  resourcePages: (spec: object, api?: object) => { name: string; slug: string; title: string; description?: string }[];
  apiSearchRecords: (spec: object, api?: object) => { url: string; content: string }[];
  specWarnings: (spec: object, cfg: object, read: (id: string) => object | null) => string[];
};
const mirror = async () => (await import("../scripts/openapi-order.mjs" as string)) as Mirror;

const parityApi = {
  tags: {
    "access:all": { hidden: true },
    Old: { mergeInto: "New/Group", label: "Moved" },
    Dubbing: { label: "Dub" },
    typo: { hidden: true },
    Into: { mergeInto: "alpha", description: "from-config" },
    labelled: { label: "Picked" },
  },
  tagOrder: ["zeta", "ALPHA", "nope"],
  hideExtensions: ["x-fern-ignore"],
  showDeprecated: false,
};
const paritySpec = {
  tags: [
    { name: "alpha", description: "alpha-desc" },
    { name: "Old", description: "old-desc", "x-displayName": "Old Disp" },
    { name: "zeta" },
    { name: "Into", description: "into-desc" },
    { name: "dubbing" },
    { name: "labelled", "x-displayName": "Spec Label" },
    { name: "api-keys" },
  ],
  paths: {
    "/a": { get: op("a", { tags: ["alpha"] }), post: op("a2", { tags: ["ALPHA"] }) },
    "/o": { get: op("o", { tags: ["Old"] }), delete: op("gone", { tags: ["Old"], deprecated: true }) },
    "/z": { get: op("z", { tags: ["zeta"] }), put: op("ign", { tags: ["zeta"], "x-fern-ignore": true }) },
    "/x": { get: op("x", { tags: ["access:all"] }) },
    "/y": { get: op("y", { tags: ["access:all", "zeta"] }) },
    "/h": { get: op("h") },
    "/i": { get: op("i", { tags: ["Into"] }) },
    "/d": { get: op("d", { tags: ["dubbing"] }), post: op("D", { tags: ["Dubbing"] }) },
    "/l": { get: op("l", { tags: ["labelled"] }) },
    "/k": { get: op("k", { tags: ["api-keys"] }) },
    "/item": { "x-fern-ignore": true, get: op("item", { tags: ["zeta"] }) },
  },
};

test("the build script's plan, titles, descriptions and warnings match normalize()", async () => {
  const { resourcePlan, resourcePages } = await mirror();
  const doc = normalize(paritySpec, parityApi as NormalizeOptions);
  const plan = resourcePlan(paritySpec, parityApi);
  assert.deepEqual(plan.tags, doc.tags.map((t) => t.name));
  assert.deepEqual(
    plan.ops.map((o) => [o.op.operationId, o.tag]),
    Object.values(doc.operationsById).map((o) => [o.operationId, o.tag]),
  );
  assert.deepEqual(plan.warnings, doc.warnings);
  assert.ok(doc.warnings.length >= 4);
  assert.deepEqual(
    resourcePages(paritySpec, parityApi).map((p) => [p.name, p.slug, p.title, p.description]),
    doc.tags.map((t) => [t.name, tagSlug(t.name), parseOpenApiTag(t.name, doc.tagLabels).displayName, t.description]),
  );
});

test("search leaves out hidden operations, path items and hidden tags' names", async () => {
  const { apiSearchRecords } = await mirror();
  const records = apiSearchRecords(paritySpec, parityApi);
  const urls = records.map((r) => r.url);
  for (const gone of ["ign", "gone", "x", "item"]) assert.ok(!urls.includes(`/api-reference/${gone}`), gone);
  assert.ok(urls.includes("/api-reference/y"));
  assert.ok(!JSON.stringify(records).includes("access:all"));
});

test("the build script survives the same odd specs as normalize", async () => {
  const { resourcePlan } = await mirror();
  const odd = { tags: [null, "stray"], paths: { "/null": null, "/a": { get: op("a") } } };
  assert.deepEqual(resourcePlan(odd).tags, normalize(odd).tags.map((t) => t.name));
});

test("a build warns about every version's spec, not just the default", async () => {
  const { specWarnings } = await mirror();
  const dup = { paths: { "/a": { get: op("a", { tags: ["dup"] }) }, "/b": { get: op("b", { tags: ["Dup"] }) } } };
  const clean = { paths: { "/a": { get: op("a", { tags: ["a"] }) } } };
  const cfg = { versions: [{ id: "v2" }, { id: "v1" }, { id: "v0" }] };
  const read = (id: string) => (id === "v1" ? dup : null);
  const warnings = specWarnings(clean, cfg, read);
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /^\[markline\] \(version v1\) API tags "dup", "Dup"/);
  assert.equal(specWarnings(dup, {}, read).length, 1);
});

test("a merged tag's description never replaces the target's own", () => {
  const doc = normalize(paritySpec, parityApi as NormalizeOptions);
  assert.equal(doc.tags.find((t) => t.name === "alpha")!.description, "alpha-desc");
  const only = normalize(
    { tags: [{ name: "Old", description: "old" }, { name: "New" }], paths: { "/o": { get: op("o", { tags: ["Old"] }) }, "/n": { get: op("n", { tags: ["New"] }) } } },
    { tags: { Old: { mergeInto: "New" } } },
  );
  assert.equal(only.tags[0].description, "old", "falls back when the target has none");
});

test("one label rule: own label, then a merged tag's, then x-displayName", () => {
  const doc = normalize(paritySpec, parityApi as NormalizeOptions);
  const label = (name: string) => doc.tags.find((t) => t.name === name)!.displayName;
  assert.equal(label("dubbing"), "Dub", "a collision loser's label names the page");
  assert.equal(label("New/Group"), "Moved");
  assert.equal(label("labelled"), "Picked");
  assert.equal(doc.tagLabels.dubbing, "Dub");
  const spec = normalize({ tags: [{ name: "a", "x-displayName": "Spec" }], paths: { "/a": { get: op("a", { tags: ["a"] }) } } });
  assert.equal(spec.tags[0].displayName, "Spec");
});

test("names in api.tags and api.tagOrder that do nothing are reported", () => {
  const spec = { tags: [{ name: "real" }, { name: "dubbing" }], paths: { "/r": { get: op("r", { tags: ["real"] }) }, "/a": { get: op("a", { tags: ["dubbing"] }) }, "/b": { get: op("b", { tags: ["Dubbing"] }) } } };
  const { warnings } = normalize(spec, {
    tags: { "acces:all": { hidden: true }, real: { mergeInto: "Rael" } },
    tagOrder: ["nope", "Dubbing"],
  });
  assert.ok(warnings.some((w) => /"acces:all" matches no tag/.test(w)));
  assert.ok(warnings.some((w) => /"real" merges into "Rael".*Did you mean "real"\?/.test(w)));
  assert.ok(warnings.some((w) => /tagOrder: "nope" matches no tag/.test(w)));
  assert.ok(warnings.some((w) => /tagOrder: "Dubbing" was merged into "dubbing"/.test(w)));
  // A label on a nav-only group path is a real target, not a typo.
  const grouped = normalize({ paths: { "/g": { get: op("g", { tags: ["Team/Sub"] }) } } }, { tags: { Team: { label: "People" } } });
  assert.deepEqual(grouped.warnings, []);
});

test("a real rename is silent; a near miss, a cycle or a hidden target warns", async () => {
  const paths = { "/b": { get: op("b", { tags: ["billing"] }) }, "/v": { get: op("v", { tags: ["voices"] }) }, "/h": { get: op("h", { tags: ["hidden-tag"] }) }, "/x": { get: op("x", { tags: ["xa"] }) }, "/y": { get: op("y", { tags: ["yb"] }) } };
  const spec = { tags: [{ name: "billing" }, { name: "voices" }], paths };
  const warned = (tags: NonNullable<NormalizeOptions["tags"]>) => normalize(spec, { tags }).warnings;
  assert.deepEqual(warned({ billing: { mergeInto: "Workspace/Small business" } }), []);
  assert.match(warned({ billing: { mergeInto: "Voices" } }).join("\n"), /Did you mean "voices"\?/);
  assert.match(warned({ billing: { mergeInto: "voicse" } })[0], /Did you mean "voices"\?/);
  assert.match(warned({ xa: { mergeInto: "yb" }, yb: { mergeInto: "xa" } })[0], /"xa" is part of a mergeInto cycle/);
  assert.match(warned({ billing: { mergeInto: "hidden-tag" }, "hidden-tag": { hidden: true } })[0], /"billing" merges into "hidden-tag", which is hidden/);
  // Short names are too close to everything for distance to mean a typo.
  assert.deepEqual(warned({ xa: { mergeInto: "xb" } }), []);
  const { resourcePlan } = await mirror();
  const configs: NonNullable<NormalizeOptions["tags"]>[] = [{ billing: { mergeInto: "voicse" } }, { xa: { mergeInto: "yb" }, yb: { mergeInto: "xa" } }, { billing: { mergeInto: "hidden-tag" }, "hidden-tag": { hidden: true } }];
  for (const tags of configs) {
    assert.deepEqual(resourcePlan(spec, { tags }).warnings, warned(tags));
  }
});

test("tagOrder naming a collision's loser pins the page it merged into", () => {
  const doc = normalize(
    { tags: [{ name: "a" }, { name: "dubbing" }], paths: { "/a": { get: op("a", { tags: ["a"] }) }, "/d": { get: op("d", { tags: ["dubbing"] }) }, "/e": { get: op("e", { tags: ["Dubbing"] }) } } },
    { tagOrder: ["Dubbing"] },
  );
  assert.deepEqual(doc.tags.map((t) => t.name), ["dubbing", "a"]);
});

test("webhooks follow their tag to the page it merged into", () => {
  const doc = normalize(
    {
      paths: { "/n": { get: op("n", { tags: ["New"] }) } },
      webhooks: {
        moved: { post: { tags: ["Old"], summary: "moved" } },
        gone: { post: { tags: ["secret"], summary: "gone" } },
        lower: { post: { tags: ["New"], summary: "same" } },
      },
    },
    { tags: { Old: { mergeInto: "New" }, secret: { hidden: true } } },
  );
  assert.deepEqual(doc.webhooks.map((w) => [w.name, w.tags]), [["moved", ["New"]], ["gone", []], ["lower", ["New"]]]);
});

test("api.auth reaches the cURL samples on both surfaces", () => {
  const spec = { paths: { "/a": { get: op("a", { parameters: [{ name: "xi-api-key", in: "header" }] }) }, "/b": { get: op("b", { security: [] }) } } };
  const doc = normalize(spec, { auth: { header: "xi-api-key" } });
  const a = doc.operationsById.a;
  assert.match(JSON.stringify(codeSamples(a, doc, spec, "https://x.test", ["curl"])), /xi-api-key: \$API_KEY/);
  assert.match(curlSample(a, doc, spec), /--header 'xi-api-key: <api-key>'/);
  assert.doesNotMatch(curlSample(doc.operationsById.b, doc, spec), /xi-api-key/);
  assert.equal(doc.operationsById.b.public, true);
});

test("Try it: an explicitly public operation offers no key, and a key header is one masked input", () => {
  const spec = {
    components: { securitySchemes: { key: { type: "apiKey", in: "header", name: "X-Api-Key" }, bearer: { type: "http", scheme: "bearer" } } },
    security: [{ key: [] }],
    paths: {
      "/a": { get: op("a", { parameters: [{ name: "x-api-KEY", in: "header", schema: { type: "string" } }, { name: "X-Trace", in: "header", schema: { type: "string" } }] }) },
      "/b": { get: op("b", { security: [] }) },
    },
  };
  const doc = normalize(spec);
  const a = buildPlaygroundSpec(doc.operationsById.a, doc, spec);
  assert.deepEqual(a.apiKeyHeaders, [{ name: "X-Api-Key" }]);
  assert.deepEqual(a.headerParams.map((p) => p.name), ["X-Trace"]);
  // An operation that under-declares its security is offered the key anyway,
  // and its own differently-cased parameter still isn't a second input.
  const under = { ...spec, security: undefined };
  const underDoc = normalize(under);
  const c = buildPlaygroundSpec(underDoc.operationsById.a, underDoc, under);
  assert.deepEqual(c.apiKeyHeaders, [{ name: "X-Api-Key" }]);
  assert.deepEqual(c.headerParams.map((p) => p.name), ["X-Trace"]);
  const b = buildPlaygroundSpec(doc.operationsById.b, doc, spec);
  assert.deepEqual(b.apiKeyHeaders, []);
  assert.equal(b.bearer, false);
});

test("bearer auth folds a declared Authorization parameter", () => {
  const doc = normalize(
    { paths: { "/a": { get: op("a", { parameters: [{ name: "Authorization", in: "header" }, { name: "X-Other", in: "header" }] }) } } },
    { auth: { type: "bearer" } },
  );
  assert.deepEqual(doc.operationsById.a.parameters.header.map((p) => p.name), ["X-Other"]);
});

test("a header parameter that duplicates the API-key auth header is dropped", () => {
  const doc = normalize(
    { paths: { "/a": { get: op("a", { parameters: [{ name: "xi-api-key", in: "header" }, { name: "x-trace", in: "header" }] }) } } },
    { auth: { header: "xi-api-key" } },
  );
  assert.deepEqual(doc.operationsById.a.parameters.header.map((p) => p.name), ["x-trace"]);
});
