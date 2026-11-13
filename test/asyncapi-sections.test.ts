import { after, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
// lib/ imports resolve via test/setup.mjs, which `npm test` loads first.
import { normalize, type NormalizeOptions } from "../lib/openapi.ts";
import { parseOpenApiTag, tagSlug } from "../lib/openapi-tags.ts";
// The build's planner is plain JS without types.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const { resourcePages, resourcePlan } = (await import("../scripts/openapi-order.mjs" as string)) as any;
import { channelExtras } from "../scripts/asyncapi-build.mjs";

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
/** As channelExtras() gives them: `pages` already resolved through api.tags. */
const extras = (groups?: unknown[], pages = ["WebSockets"]) => ({ pages, groups, known: ["WebSockets", "live"], labels: { WebSockets: "WebSockets" } });

/** The plan both sides make: page order, sections, labels and warnings. */
function both(api: Record<string, unknown>, ex = extras()) {
  const doc = normalize(spec, { ...(api as NormalizeOptions), extras: ex });
  const plan = resourcePlan(spec, api, ex);
  const pages = resourcePages(spec, api, ex);
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
