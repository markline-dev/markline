import { after, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
// lib/ imports resolve via test/setup.mjs, which `npm test` loads first.
import { normalize, placeChannels, type NormalizeOptions } from "../lib/openapi.ts";
import { parseOpenApiTag, tagSlug } from "../lib/openapi-tags.ts";
// The build's planner is plain JS without types.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const { resourcePages, resourcePlan, specWarnings } = (await import("../scripts/openapi-order.mjs" as string)) as any;
import { channelExtras, readApiSpec, type ChannelExtras } from "../scripts/asyncapi-build.mjs";

// The WebSockets page in the plan: ordered, labelled, sectioned, renamed, merged
// or hidden by the same settings as any resource, identically for the pages
// (normalize) and the build (resourcePlan). Synthetic specs only.

const op = (id: string, tags: string[]) => ({ operationId: id, tags, responses: { 200: { description: "ok" } } });
const spec = {
  openapi: "3.0.0",
  info: { title: "t", version: "1" },
  tags: [{ name: "things" }, { name: "others" }],
  paths: { "/things": { get: op("things", ["things"]) }, "/others": { get: op("others", ["others"]) }, "/zed": { get: op("zed", ["zed"]) } },
  "x-tagGroups": [{ name: "Core", tags: ["things"] }],
};
/** No AsyncAPI document. */
const NONE: ChannelExtras = { pages: [], known: [], labels: {} };
/** As channelExtras() gives them: `pages` already resolved through api.tags. */
const extras = (groups?: unknown[], pages = ["WebSockets"]): ChannelExtras => ({ pages, groups, known: ["WebSockets", "live"], labels: { WebSockets: "WebSockets" } });

/** The plan both sides make: page order, sections, labels and warnings. */
function both(api: Record<string, unknown>, ex: ChannelExtras = extras(), raw: object = spec) {
  const doc = normalize(raw, { ...(api as NormalizeOptions), extras: ex });
  const plan = resourcePlan(raw, api, ex);
  const pages = resourcePages(raw, api, ex);
  const lib = {
    order: doc.tags.map((t) => t.name),
    sections: doc.sections.map((s) => [s.title, s.tags]),
    titles: doc.tags.map((t) => parseOpenApiTag(t.name, doc.tagLabels).displayName),
    slugs: doc.tags.map((t) => tagSlug(t.name)),
    warnings: doc.warnings,
  };
  const build = {
    order: plan.tags,
    sections: plan.sections.map((s: { title: string; tags: string[] }) => [s.title, s.tags]),
    titles: pages.map((p: { title: string }) => p.title),
    slugs: pages.map((p: { slug: string }) => p.slug),
    warnings: plan.warnings,
  };
  assert.deepEqual(build, lib);
  return lib;
}

test("WebSockets comes after the other pages, labelled as written, unless tagOrder pins it", () => {
  // Undeclared "zed" sorts with the undeclared; WebSockets still comes last.
  assert.deepEqual(both({}).order, ["things", "others", "zed", "WebSockets"]);
  assert.equal(both({}).titles.at(-1), "WebSockets");
  // The spec's "Core" section leads; the rest follow tagOrder.
  assert.deepEqual(both({ tagOrder: ["WebSockets", "others"] }).order, ["things", "WebSockets", "others", "zed"]);
  assert.deepEqual(both({ tagOrder: ["WebSockets"], sections: [] }).order, ["WebSockets", "things", "others", "zed"]);
  // Known, so api.tags and tagOrder naming it don't warn.
  assert.deepEqual(both({ tagOrder: ["WebSockets"], tags: { WebSockets: { label: "Realtime" } } }).warnings, []);
});

test("api.tags renames, merges or hides the WebSockets page", () => {
  const renamed = both({ tags: { WebSockets: { label: "Realtime" } } });
  assert.equal(renamed.titles.at(-1), "Realtime");
  assert.equal(renamed.slugs.at(-1), "websockets");
  // Merged into an existing page: no page of its own.
  assert.deepEqual(both({ tags: { WebSockets: { mergeInto: "others" } } }, extras(undefined, ["others"])).order, ["things", "others", "zed"]);
  // Merged into a new name: a page of that name, still last.
  const moved = both({ tags: { WebSockets: { mergeInto: "Live feeds" } } }, extras(undefined, ["Live feeds"]));
  assert.deepEqual([moved.order.at(-1), moved.slugs.at(-1)], ["Live feeds", "live-feeds"]);
  // Hidden: no page.
  assert.deepEqual(both({ tags: { WebSockets: { hidden: true } } }, extras(undefined, [])).order, ["things", "others", "zed"]);
});

test("sections: api.sections places it; the AsyncAPI document's x-tagGroups follow the spec's", () => {
  assert.deepEqual(both({ sections: [{ title: "Live", tags: ["WebSockets", "others"] }] }).sections, [["Live", ["WebSockets", "others"]]]);
  // The spec's groups first; a same-titled AsyncAPI group joins it, a new one follows.
  assert.deepEqual(
    both({}, extras([{ name: "Core", tags: ["WebSockets"] }])).sections,
    [["Core", ["things", "WebSockets"]]],
  );
  assert.deepEqual(
    both({}, extras([{ name: "Realtime", tags: ["WebSockets", "things"] }])).sections,
    // "things" stays in Core, the first group that names it.
    [["Core", ["things"]], ["Realtime", ["WebSockets"]]],
  );
  // api.sections replaces both, an empty list included.
  assert.deepEqual(both({ sections: [] }, extras([{ name: "Realtime", tags: ["WebSockets"] }])).sections, []);
  // Without an AsyncAPI document, nothing changes.
  const plain = normalize(spec, {});
  assert.deepEqual(plain.tags.map((t) => t.name), ["things", "others", "zed"]);
});

test("channelExtras: the page only when a channel has nowhere to go, and the document's groups", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "markline-asyncapi-sections-"));
  after(() => fs.rmSync(dir, { recursive: true, force: true }));
  fs.mkdirSync(path.join(dir, "api"));
  const write = (doc: object) => fs.writeFileSync(path.join(dir, "api", "asyncapi.json"), JSON.stringify({ asyncapi: "2.6.0", info: { title: "t", version: "1" }, ...doc }));
  write({ channels: { "/things/live": { subscribe: { message: { name: "m" } } } } });
  assert.deepEqual(channelExtras(dir, spec, {}).extras.pages, []);
  write({ "x-tagGroups": [{ name: "Realtime", tags: ["WebSockets"] }], channels: { "/feed": { subscribe: { tags: [{ name: "live" }], message: { name: "m" } } } } });
  const { extras: ex } = channelExtras(dir, spec, {});
  assert.deepEqual(ex.pages, ["WebSockets"]);
  assert.deepEqual(ex.groups, [{ name: "Realtime", tags: ["WebSockets"] }]);
  assert.deepEqual(ex.known, ["WebSockets", "live"]);
  assert.deepEqual(channelExtras(dir, spec, { tags: { WebSockets: { mergeInto: "Realtime" } } }).extras.pages, ["Realtime"]);
  assert.deepEqual(channelExtras(dir, spec, { tags: { WebSockets: { hidden: true } } }).extras.pages, []);
  assert.equal(channelExtras(path.join(dir, "none"), spec, {}).read, null);
});

// Through the real document: channelExtras() for the plan, placeChannels() for the channels.
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "markline-asyncapi-place-"));
after(() => fs.rmSync(tmp, { recursive: true, force: true }));
let n = 0;
/** A content folder holding one AsyncAPI document with a channel that joins no resource. */
function homeless(): string {
  const dir = path.join(tmp, String(n++));
  fs.mkdirSync(path.join(dir, "api"), { recursive: true });
  fs.writeFileSync(
    path.join(dir, "api", "asyncapi.json"),
    JSON.stringify({ asyncapi: "2.6.0", info: { title: "t", version: "1" }, channels: { "/firehose": { subscribe: { message: { name: "all" } } } } }),
  );
  return dir;
}
/** Pages and build agree on the plan; returns the page order and which page holds the channel. */
function place(raw: object, api: Record<string, unknown>) {
  const { read, extras: ex } = channelExtras(homeless(), raw, api);
  const lib = both(api, ex, raw);
  const doc = normalize(raw, { ...(api as NormalizeOptions), extras: ex });
  placeChannels(doc, read!, api as NormalizeOptions);
  return { ...lib, home: doc.tags.filter((t) => t.channels?.some((c) => c.id === "/firehose")).map((t) => t.name) };
}
const undeclared = {
  openapi: "3.0.0",
  info: { title: "t", version: "1" },
  tags: [{ name: "things" }],
  paths: { "/things": { get: op("things", ["things"]) }, "/alpha": { get: op("alpha", ["alpha"]) }, "/zed": { get: op("zed", ["zed"]) } },
};

test("mergeInto a page the spec already has: the channels join it there, and nothing moves", () => {
  const r = place(undeclared, { tags: { WebSockets: { mergeInto: "alpha" } } });
  assert.deepEqual([r.order, r.home], [["things", "alpha", "zed"], ["alpha"]]);
  assert.deepEqual(r.warnings, []);
});

test("rename, mergeInto a new name, hide: the channels follow api.tags", () => {
  const renamed = place(undeclared, { tags: { WebSockets: { label: "Realtime" } } });
  assert.deepEqual([renamed.order.at(-1), renamed.titles.at(-1), renamed.home], ["WebSockets", "Realtime", ["WebSockets"]]);
  const moved = place(undeclared, { tags: { WebSockets: { mergeInto: "Live feeds" } } });
  assert.deepEqual([moved.order.at(-1), moved.home], ["Live feeds", ["Live feeds"]]);
  const hidden = place(undeclared, { tags: { WebSockets: { hidden: true } } });
  assert.deepEqual([hidden.order, hidden.home], [["things", "alpha", "zed"], []]);
});

test("a spec's own WebSockets page keeps its place and takes the channels", () => {
  // Undeclared, with operations: sorted with the other undeclared pages, not forced last.
  const own = { ...undeclared, paths: { ...undeclared.paths, "/ws": { get: op("ws", ["WebSockets"]) } } };
  const o = place(own, {});
  assert.deepEqual([o.order, o.home], [["things", "alpha", "WebSockets", "zed"], ["WebSockets"]]);
  // Same slug, other spelling: no collision warning about a name the user never wrote.
  const lower = { ...undeclared, paths: { ...undeclared.paths, "/ws": { get: op("ws", ["websockets"]) } } };
  const r = place(lower, {});
  assert.deepEqual([r.order, r.home, r.warnings], [["things", "alpha", "websockets", "zed"], ["websockets"], []]);
  // Declared without operations: where the spec declares it, with its x-displayName.
  const declared = { ...undeclared, tags: [{ name: "WebSockets", "x-displayName": "Live" }, { name: "things" }] };
  const d = place(declared, {});
  assert.deepEqual([d.order, d.titles[0], d.home], [["WebSockets", "things", "alpha", "zed"], "Live", ["WebSockets"]]);
});

test("the build's warnings know the WebSockets page, for the default spec and each version", () => {
  const cfg = { versions: [{ id: "v2" }, { id: "v1" }], api: { tags: { WebSockets: { label: "Realtime" } }, tagOrder: ["WebSockets"] } };
  const read = () => undeclared;
  const dirs: Record<string, string> = { default: homeless(), v1: homeless() };
  const extrasOf = (id: string | undefined, s: object) => channelExtras(dirs[id ?? "default"], s, cfg.api).extras;
  assert.deepEqual(specWarnings(undeclared, cfg, read, extrasOf), []);
  // Without what the AsyncAPI document adds, both would warn about an unknown tag.
  const bare = specWarnings(undeclared, cfg, read);
  assert.equal(bare.filter((w: string) => /"WebSockets" matches no tag/.test(w)).length, 4, bare.join("\n"));
});

test("mergeInto a page by another spelling joins it, and says so rather than 'creates a new page'", () => {
  const r = place(undeclared, { tags: { WebSockets: { mergeInto: "Alpha" } } });
  assert.deepEqual([r.order, r.home], [["things", "alpha", "zed"], ["alpha"]]);
  assert.equal(r.warnings.length, 1);
  assert.match(r.warnings[0], /"WebSockets" merges into "Alpha", which has the same URL as "alpha", so it joins that page/);
  assert.doesNotMatch(r.warnings[0], /creates a new page/);
});

test("a label on WebSockets that can't reach the spec's own websockets page is reported", () => {
  const lower = { ...undeclared, paths: { ...undeclared.paths, "/ws": { get: op("ws", ["websockets"]) } } };
  const r = place(lower, { tags: { WebSockets: { label: "Realtime" } } });
  assert.deepEqual(r.home, ["websockets"]);
  assert.deepEqual(r.warnings, [
    `[markline] api.tags: "WebSockets" has a label, but the WebSocket channels are on the spec's "websockets" page, which it doesn't rename. Put the label on "websockets".`,
  ]);
  // On the page itself, the label works and nothing is said.
  const ok = place(lower, { tags: { websockets: { label: "Realtime" } } });
  assert.deepEqual([ok.titles[ok.order.indexOf("websockets")], ok.warnings], ["Realtime", []]);
});

test("a mergeInto target that's a new page, not a same-URL one, still says 'creates a new page'", () => {
  const spec2 = {
    openapi: "3.0.0",
    info: { title: "t", version: "1" },
    tags: [{ name: "Users" }, { name: "Billing" }],
    paths: { "/a": { get: op("a", ["Admin"]) }, "/u": { get: op("u", ["Users"]) }, "/b": { get: op("b", ["Billing"]) } },
  };
  for (const tags of [{ Admin: { mergeInto: "users" }, Users: { hidden: true } }, { Admin: { mergeInto: "users" }, Users: { mergeInto: "Billing" } }]) {
    const r = both({ tags }, NONE, spec2);
    assert.ok(r.order.includes("users"), r.order.join());
    assert.ok(r.warnings.some((w) => /"Admin" merges into "users", which isn't a tag in the spec, so it creates a new page\. Did you mean "Users"\?/.test(w)), r.warnings.join("\n"));
    assert.ok(!r.warnings.some((w) => /joins that page/.test(w)), r.warnings.join("\n"));
  }
});

test("a spec's own WebSockets tag with a label: renamed, and nothing said", () => {
  const own = { ...undeclared, paths: { ...undeclared.paths, "/ws": { get: op("ws", ["WebSockets"]) } } };
  const r = place(own, { tags: { WebSockets: { label: "Realtime" } } });
  assert.deepEqual([r.titles[r.order.indexOf("WebSockets")], r.home, r.warnings], ["Realtime", ["WebSockets"], []]);
});

test("a mergeInto that only respells a tag is reported once, not again as a URL collision", () => {
  const spec3 = {
    openapi: "3.0.0",
    info: { title: "t", version: "1" },
    tags: [{ name: "voices" }],
    paths: { "/v": { get: op("v", ["voices"]) }, "/b": { get: op("b", ["billing"]) } },
  };
  const r = both({ tags: { billing: { mergeInto: "Voices" } } }, NONE, spec3);
  assert.deepEqual(r.order, ["voices"]);
  assert.equal(r.warnings.length, 1, r.warnings.join("\n"));
  assert.match(r.warnings[0], /"billing" merges into "Voices", which has the same URL as "voices", so it joins that page/);
  // Two spec tags that collide on their own are still reported.
  const spec4 = { ...spec3, paths: { ...spec3.paths, "/V": { get: op("V", ["Voices"]) } } };
  assert.ok(both({}, NONE, spec4).warnings.some((w) => /share the URL \/api-reference\/voices/.test(w)));
});

test("a version with only an AsyncAPI document doesn't repeat the api.tags, tagOrder and section checks", () => {
  const cfg = {
    versions: [{ id: "v2" }, { id: "v1" }],
    api: { tags: { nosuch: { label: "N" } }, tagOrder: ["nothere"], sections: [{ title: "S", tags: ["absent"] }] },
  };
  // homeless() folders hold an AsyncAPI document and no openapi.json.
  const dirs: Record<string, string> = { default: homeless(), v1: homeless() };
  const read = (id: string) => readApiSpec(dirs[id], cfg.api);
  const extrasOf = (id: string | undefined, s: object) => channelExtras(dirs[id ?? "default"], s, cfg.api).extras;
  const warnings: string[] = specWarnings(undeclared, cfg, read, extrasOf);
  // Said for the default version's spec, not again for v1, which has no spec.
  assert.equal(warnings.filter((w) => /"nosuch" matches no tag/.test(w)).length, 1, warnings.join("\n"));
  assert.equal(warnings.filter((w) => /"nothere" matches no tag/.test(w)).length, 1);
  assert.equal(warnings.filter((w) => /"absent" in "S" matches no tag/.test(w)).length, 1);
  assert.ok(!warnings.some((w) => w.includes("(version v1)")), warnings.join("\n"));
  // The pages agree: normalize() on the stand-in spec says nothing about them either.
  const stand = readApiSpec(dirs.v1, cfg.api) as object;
  const doc = normalize(stand, { ...(cfg.api as NormalizeOptions), extras: extrasOf("v1", stand) });
  assert.deepEqual(doc.warnings, []);
  assert.deepEqual(doc.tags.map((t) => t.name), ["WebSockets"]);
});
