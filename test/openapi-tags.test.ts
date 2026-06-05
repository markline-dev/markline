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
  assert.equal(tagSlug("billing/invoices"), "billing-invoices");
  assert.equal(tagSlug("Card Programs"), "card-programs");
  assert.equal(tagSlug("admin/api/keys"), "admin-api-keys");
});

test("segmentDisplayName title-cases segments and applies acronyms", () => {
  assert.equal(segmentDisplayName("invoices"), "Invoices");
  assert.equal(segmentDisplayName("payment-methods"), "Payment Methods");
  assert.equal(segmentDisplayName("paymentMethods"), "Payment Methods");
  assert.equal(segmentDisplayName("fx"), "FX");
  assert.equal(segmentDisplayName("api"), "API");
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
  const p = parseOpenApiTag("billing/invoices");
  assert.deepEqual(p.segments, ["billing", "invoices"]);
  assert.equal(p.parentPath, "billing");
  assert.equal(p.leaf, "invoices");
  assert.equal(p.slug, "billing-invoices");
  assert.equal(p.displayName, "Invoices");
  assert.deepEqual(p.parentDisplayNames, ["Billing"]);
});

test("parseOpenApiTag: three segments nest to full depth", () => {
  const p = parseOpenApiTag("admin/api/keys");
  assert.equal(p.parentPath, "admin/api");
  assert.equal(p.leaf, "keys");
  assert.equal(p.slug, "admin-api-keys");
  assert.deepEqual(p.parentDisplayNames, ["Admin", "API"]);
});

test("buildTagTree: flat tags stay top-level leaves", () => {
  const tree = buildTagTree(["payments", "customers"]);
  assert.equal(tree.length, 2);
  assert.equal(tree[0].type, "leaf");
  assert.equal(tree[0].tag, "payments");
  assert.equal(tree[0].slug, "payments");
});

test("buildTagTree: groups by shared prefix at full depth", () => {
  const tree = buildTagTree([
    "billing/invoices",
    "billing/fx",
    "admin/users",
    "admin/api/keys",
  ]);
  assert.deepEqual(tree.map((n) => n.path), ["billing", "admin"]);

  const billing = tree[0];
  assert.equal(billing.type, "group");
  assert.equal(billing.tag, undefined); // synthetic parent, not a real tag
  assert.deepEqual(billing.children.map((c) => c.name), ["Invoices", "FX"]);
  assert.equal(billing.children[0].type, "leaf");
  assert.equal(billing.children[0].tag, "billing/invoices");
  assert.equal(billing.children[0].slug, "billing-invoices");

  const admin = tree[1];
  const api = admin.children.find((c) => c.path === "admin/api");
  assert.ok(api);
  assert.equal(api.type, "group");
  assert.equal(api.name, "API");
  assert.equal(api.children[0].tag, "admin/api/keys");
});

test("buildTagTree: preserves spec (input) order", () => {
  const tree = buildTagTree(["zebra", "billing/invoices", "alpha"]);
  assert.deepEqual(tree.map((n) => n.path), ["zebra", "billing", "alpha"]);
});

test("buildTagTree: a prefix that is also a real tag is a group AND a tag", () => {
  const tree = buildTagTree(["billing", "billing/invoices"]);
  assert.equal(tree.length, 1);
  const billing = tree[0];
  assert.equal(billing.type, "group"); // has children
  assert.equal(billing.tag, "billing"); // but is a real tag too
  assert.equal(billing.children[0].tag, "billing/invoices");
});

test("buildTagTree: one group per prefix, no duplicates", () => {
  const tree = buildTagTree(["store/a", "store/b", "store/c"]);
  assert.equal(tree.length, 1);
  assert.equal(tree[0].children.length, 3);
});
