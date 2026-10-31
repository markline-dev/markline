import { test } from "node:test";
import assert from "node:assert/strict";

type OrderedResourceTags = (spec: object) => string[];

async function load(): Promise<OrderedResourceTags> {
  const modulePath = "../scripts/openapi-order.mjs";
  const mod = (await import(modulePath)) as unknown as { orderedResourceTags: OrderedResourceTags };
  return mod.orderedResourceTags;
}

test("orderedResourceTags keeps declared order and sorts undeclared tags", async () => {
  const orderedResourceTags = await load();
  const tags = orderedResourceTags({
    tags: [{ name: "Requests" }, { name: "Customers" }],
    paths: {
      "/webhooks": { get: { tags: ["Webhooks"] } },
      "/requests": { get: { tags: ["Requests"] } },
      "/customers": { get: { tags: ["Customers"] } },
      "/configuration": { patch: { tags: ["Configuration"] } },
      "/events": { post: { tags: ["Events"] } },
    },
  });
  assert.deepEqual(tags, ["Requests", "Customers", "Configuration", "Events", "Webhooks"]);
});

test("orderedResourceTags lists only tags that get a page (#31)", async () => {
  const orderedResourceTags = await load();
  const tags = orderedResourceTags({
    tags: [
      { name: "Legacy" }, // declared, but no operation uses it
      { name: "Accounts" },
    ],
    paths: {
      "/accounts": { get: { tags: ["Accounts", "Billing"] } }, // Billing is only ever a second tag
      "/health": { get: {} }, // untagged → the "Default" resource
    },
  });
  assert.deepEqual(tags, ["Accounts", "Default"]);
});

test("orderedResourceTags ignores non-operation keys on a path item", async () => {
  const orderedResourceTags = await load();
  const tags = orderedResourceTags({
    paths: { "/x": { parameters: [{ name: "id", in: "path" }], summary: "x", get: { tags: ["X"] } } },
  });
  assert.deepEqual(tags, ["X"]);
});

test("a tag declared twice is listed once", async () => {
  const orderedResourceTags = await load();
  const tags = orderedResourceTags({
    tags: [{ name: "A" }, { name: "A" }],
    paths: { "/a": { get: { tags: ["A"] } } },
  });
  assert.deepEqual(tags, ["A"]);
});
