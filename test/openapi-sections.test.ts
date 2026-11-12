import { test } from "node:test";
import assert from "node:assert/strict";
// lib/ imports resolve via test/setup.mjs, which `npm test` loads first.
import { normalize, type NormalizeOptions } from "../lib/openapi.ts";
import { sectionSource } from "../lib/openapi-tag-config.ts";
import { tagSlug } from "../lib/openapi-tags.ts";

const op = (operationId: string, tags: string[]) => ({ operationId, tags, responses: { "200": { description: "OK" } } });

// Tags as the ElevenLabs sample has them, plus a slash group and a case collision.
const spec = {
  openapi: "3.1.0",
  info: { title: "t", version: "1" },
  tags: [{ name: "text-to-speech" }, { name: "voices" }, { name: "agents" }, { name: "Conversational AI" }],
  paths: {
    "/tts": { post: op("tts", ["text-to-speech"]) },
    "/voices": { get: op("listVoices", ["voices"]) },
    "/voices/pvc": { post: op("pvc", ["voices/pvc"]) },
    "/agents": { get: op("agents", ["agents"]) },
    "/convai": { get: op("convai", ["Conversational AI"]) },
    "/dub": { post: op("dub", ["dubbing"]) },
    "/Dub": { get: op("Dub", ["Dubbing"]) },
    "/models": { get: op("models", ["models"]) },
    "/secret": { get: op("secret", ["secret"]) },
  },
};

const doc = (api: NormalizeOptions, raw: object = spec) => normalize(raw, api);
const order = (api: NormalizeOptions, raw?: object) => doc(api, raw).tags.map((t) => t.name);
const sections = (api: NormalizeOptions, raw?: object) => doc(api, raw).sections;

const SECTIONS = [
  { title: "Agents", tags: ["agents", "Conversational AI"] },
  { title: "Creative", tags: ["text-to-speech", "voices", "dubbing"] },
];

test("sections order the pages, and pages in none follow, still listed", () => {
  assert.deepEqual(sections({ sections: SECTIONS }), [
    { title: "Agents", tags: ["agents", "Conversational AI"] },
    // "voices" takes the pages under its slash group too; "dubbing" is the page "Dubbing" folded into.
    { title: "Creative", tags: ["text-to-speech", "voices", "voices/pvc", "dubbing"] },
  ]);
  assert.deepEqual(order({ sections: SECTIONS }), ["agents", "Conversational AI", "text-to-speech", "voices", "voices/pvc", "dubbing", "models", "secret"]);
});

test("sections only reorder: every page and operation, and so every URL, stays", () => {
  const plain = doc({});
  const grouped = doc({ sections: SECTIONS });
  const urls = (d: ReturnType<typeof doc>) => [...d.tags.map((t) => tagSlug(t.name)), ...Object.keys(d.operationsById)].sort();
  assert.deepEqual(urls(grouped), urls(plain));
  for (const t of plain.tags) {
    const same = grouped.tags.find((g) => g.name === t.name)!;
    assert.deepEqual(same.operations.map((o) => o.operationId), t.operations.map((o) => o.operationId), t.name);
  }
});

test("a section names spec tags: hidden ones are skipped, merged ones find their page", () => {
  const api: NormalizeOptions = {
    tags: { secret: { hidden: true }, "Conversational AI": { mergeInto: "agents" } },
    sections: [{ title: "All", tags: ["secret", "Conversational AI", "models"] }],
  };
  assert.deepEqual(sections(api), [{ title: "All", tags: ["agents", "models"] }]);
  // "Dubbing" shares a URL with "dubbing", so it was folded into that page.
  assert.deepEqual(sections({ sections: [{ title: "D", tags: ["Dubbing"] }] }), [{ title: "D", tags: ["dubbing"] }]);
  assert.equal(doc(api).warnings.filter((w) => w.includes("API sections")).length, 0);
});

test("mistakes are warned about, and change nothing else", () => {
  const d = doc({
    sections: [
      { title: "A", tags: ["voice", "models"] },
      { title: "B", tags: ["models", "nothing-like-it"] },
      { title: "Empty", tags: ["gone"] },
    ],
  });
  const warnings = d.warnings.filter((w) => w.includes("API sections"));
  assert.ok(warnings.some((w) => w.includes('"voice" in "A" matches no tag') && w.includes('Did you mean "voices"?')));
  assert.ok(warnings.some((w) => w.includes('"models" is in "A" and "B"; it stays in "A"')));
  assert.ok(warnings.some((w) => w.includes('"nothing-like-it" in "B" matches no tag') && !w.includes("Did you mean")));
  assert.ok(warnings.some((w) => w.includes('"Empty" has no tags')));
  assert.deepEqual(d.sections, [{ title: "A", tags: ["models"] }]);
  assert.equal(d.tags.length, doc({}).tags.length);
});

test("x-tagGroups make sections, api.sections replaces them, and [] turns them off", () => {
  const withGroups = { ...spec, "x-tagGroups": [{ name: "Core", tags: ["models"] }, { name: "Bad" }, { tags: ["voices"] }] };
  assert.deepEqual(sections({}, withGroups), [{ title: "Core", tags: ["models"] }]);
  assert.equal(order({}, withGroups)[0], "models", "the landing page is the first section's first tag");
  assert.deepEqual(sections({ sections: [{ title: "Mine", tags: ["voices"] }] }, withGroups), [{ title: "Mine", tags: ["voices", "voices/pvc"] }]);
  assert.deepEqual(sections({ sections: [] }, withGroups), []);
  assert.deepEqual(order({ sections: [] }, withGroups), order({}));
  // No sections at all: nothing changes.
  assert.deepEqual(sections({}), []);
});

test("sectionSource reads the two shapes and drops malformed entries", () => {
  assert.deepEqual(sectionSource(undefined, [{ name: " A ", tags: ["x", 1] }]), { sections: [{ title: "A", tags: ["x"] }], fromSpec: true });
  assert.deepEqual(sectionSource([{ title: "B", tags: ["y"] }, { title: "", tags: [] }, null], [{ name: "A", tags: [] }]), {
    sections: [{ title: "B", tags: ["y"] }],
    fromSpec: false,
  });
  assert.deepEqual(sectionSource(undefined, "nope"), { sections: [], fromSpec: true });
});

test("the build script orders and groups pages the same way", async () => {
  const { resourcePlan, resourcePages } = (await import("../scripts/openapi-order.mjs" as string)) as {
    resourcePlan: (spec: object, api?: object) => { tags: string[]; sections: { title: string; tags: string[] }[]; warnings: string[] };
    resourcePages: (spec: object, api?: object) => { name: string; section: string | null }[];
  };
  const withGroups = { ...spec, "x-tagGroups": [{ name: "Core", tags: ["models", "voices"] }] };
  const cases: [NormalizeOptions, object][] = [
    [{ sections: SECTIONS }, spec],
    [{ tags: { secret: { hidden: true }, "Conversational AI": { mergeInto: "agents" } }, sections: SECTIONS }, spec],
    [{}, withGroups],
    [{ sections: [] }, withGroups],
    [{ sections: [{ title: "A", tags: ["voice", "models"] }, { title: "B", tags: ["models"] }] }, spec],
  ];
  for (const [api, raw] of cases) {
    const d = doc(api, raw);
    const plan = resourcePlan(raw, api);
    assert.deepEqual(plan.tags, d.tags.map((t) => t.name), JSON.stringify(api));
    assert.deepEqual(plan.sections, d.sections, JSON.stringify(api));
    assert.deepEqual(
      plan.warnings.filter((w) => w.includes("API sections")),
      d.warnings.filter((w) => w.includes("API sections")),
      JSON.stringify(api),
    );
    const inSection = new Map(d.sections.flatMap((s) => s.tags.map((t) => [t, s.title])));
    assert.deepEqual(
      resourcePages(raw, api).map((p) => [p.name, p.section]),
      d.tags.map((t) => [t.name, inSection.get(t.name) ?? null]),
    );
  }
});
