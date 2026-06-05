import { test } from "node:test";
import assert from "node:assert/strict";
import {
  tagSlug,
  segmentDisplayName,
  parseOpenApiTag,
  buildTagTree,
} from "../lib/openapi-tags.ts";

test("tagSlug collapses non-alphanumerics, keeping the full path", () => {
  assert.equal(tagSlug("payments"), "payments");
  assert.equal(tagSlug("tools/merchants"), "tools-merchants");
  assert.equal(tagSlug("Card Programs"), "card-programs");
  assert.equal(tagSlug("simulation/grp/cards"), "simulation-grp-cards");
});

test("segmentDisplayName title-cases segments and applies acronyms", () => {
  assert.equal(segmentDisplayName("merchants"), "Merchants");
  assert.equal(segmentDisplayName("card-programs"), "Card Programs");
  assert.equal(segmentDisplayName("cardPrograms"), "Card Programs");
  assert.equal(segmentDisplayName("fx"), "FX");
  assert.equal(segmentDisplayName("grp"), "GRP");
  assert.equal(segmentDisplayName("configuration"), "Configuration");
});

test("parseOpenApiTag: single segment behaves as a top-level leaf", () => {
  const p = parseOpenApiTag("payments");
  assert.equal(p.parentPath, null);
  assert.equal(p.leaf, "payments");
  assert.equal(p.slug, "payments");
  assert.equal(p.displayName, "Payments");
  assert.deepEqual(p.parentDisplayNames, []);
});

test("parseOpenApiTag: two segments split parent/leaf", () => {
  const p = parseOpenApiTag("tools/merchants");
  assert.deepEqual(p.segments, ["tools", "merchants"]);
  assert.equal(p.parentPath, "tools");
  assert.equal(p.leaf, "merchants");
  assert.equal(p.slug, "tools-merchants");
  assert.equal(p.displayName, "Merchants");
  assert.deepEqual(p.parentDisplayNames, ["Tools"]);
});

test("parseOpenApiTag: three segments nest to full depth", () => {
  const p = parseOpenApiTag("simulation/grp/cards");
  assert.equal(p.parentPath, "simulation/grp");
  assert.equal(p.leaf, "cards");
  assert.equal(p.slug, "simulation-grp-cards");
  assert.deepEqual(p.parentDisplayNames, ["Simulation", "GRP"]);
});

test("buildTagTree: flat tags stay top-level leaves", () => {
  const tree = buildTagTree(["payments", "cards"]);
  assert.equal(tree.length, 2);
  assert.equal(tree[0].type, "leaf");
  assert.equal(tree[0].tag, "payments");
  assert.equal(tree[0].slug, "payments");
});

test("buildTagTree: groups by shared prefix at full depth", () => {
  const tree = buildTagTree([
    "tools/banks",
    "tools/fx",
    "simulation/payments",
    "simulation/grp/cards",
  ]);
  assert.deepEqual(tree.map((n) => n.path), ["tools", "simulation"]);

  const tools = tree[0];
  assert.equal(tools.type, "group");
  assert.equal(tools.tag, undefined); // synthetic parent, not a real tag
  assert.deepEqual(tools.children.map((c) => c.name), ["Banks", "FX"]);
  assert.equal(tools.children[0].type, "leaf");
  assert.equal(tools.children[0].tag, "tools/banks");
  assert.equal(tools.children[0].slug, "tools-banks");

  const sim = tree[1];
  const grp = sim.children.find((c) => c.path === "simulation/grp");
  assert.ok(grp);
  assert.equal(grp.type, "group");
  assert.equal(grp.name, "GRP");
  assert.equal(grp.children[0].tag, "simulation/grp/cards");
});

test("buildTagTree: preserves spec (input) order", () => {
  const tree = buildTagTree(["zebra", "tools/banks", "alpha"]);
  assert.deepEqual(tree.map((n) => n.path), ["zebra", "tools", "alpha"]);
});

test("buildTagTree: a prefix that is also a real tag is a group AND a tag", () => {
  const tree = buildTagTree(["tools", "tools/banks"]);
  assert.equal(tree.length, 1);
  const tools = tree[0];
  assert.equal(tools.type, "group"); // has children
  assert.equal(tools.tag, "tools"); // but is a real tag too
  assert.equal(tools.children[0].tag, "tools/banks");
});

test("buildTagTree: one group per prefix, no duplicates", () => {
  const tree = buildTagTree(["tools/a", "tools/b", "tools/c"]);
  assert.equal(tree.length, 1);
  assert.equal(tree[0].children.length, 3);
});
