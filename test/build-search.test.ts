import { test } from "node:test";
import assert from "node:assert/strict";

type OrderedResourceTags = (spec: object) => string[];

test("orderedResourceTags keeps declared order and sorts undeclared tags", async () => {
  const modulePath = "../scripts/openapi-order.mjs";
  const { orderedResourceTags } = await import(modulePath) as unknown as {
    orderedResourceTags: OrderedResourceTags;
  };
  const tags = orderedResourceTags({
    tags: [{ name: "Requests" }, { name: "Customers" }],
    paths: {
      "/webhooks": { get: { tags: ["Webhooks"] } },
      "/events": { post: { tags: ["Events", "Requests"] } },
      "/configuration": { patch: { tags: ["Configuration"] } },
    },
  });

  assert.deepEqual(tags, ["Requests", "Customers", "Configuration", "Events", "Webhooks"]);
});
