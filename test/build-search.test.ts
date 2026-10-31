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

type SearchGroups = (cfg: object) => { order: string[]; byUrl: Map<string, string> };

async function loadGroups(): Promise<SearchGroups> {
  const modulePath = "../scripts/search-groups.mjs";
  return ((await import(modulePath)) as unknown as { searchGroups: SearchGroups }).searchGroups;
}

test("searchGroups uses sidebar groups for a single tab", async () => {
  const searchGroups = await loadGroups();
  const { order, byUrl } = searchGroups({
    navigation: {
      tabs: [
        { label: "Docs", groups: [
          { group: "Get started", pages: [{ href: "/" }, { href: "/quickstart" }] },
          { group: "Guides", pages: [{ label: "Auth", pages: [{ href: "/guides/auth" }] }] },
        ] },
        { label: "API", openapi: "api/openapi.json" },
      ],
    },
  });
  assert.deepEqual(order, ["Get started", "Guides"]);
  assert.equal(byUrl.get("/quickstart"), "Get started");
  assert.equal(byUrl.get("/guides/auth"), "Guides");
});

test("searchGroups turns top-level folders of an unnamed group into collections", async () => {
  const searchGroups = await loadGroups();
  const { order, byUrl } = searchGroups({
    navigation: {
      tabs: [{ label: "Articles", groups: [{ group: "", pages: [
        { href: "/", label: "Home" },
        { label: "Train", pages: [{ href: "/train/a" }, { label: "Deep", pages: [{ href: "/train/deep" }] }] },
        { label: "Deploy", pages: [{ href: "/deploy/a" }] },
      ] }] }],
    },
  });
  assert.deepEqual(order, ["Train", "Deploy"]);
  assert.equal(byUrl.get("/train/deep"), "Train");
  assert.equal(byUrl.has("/"), false);
});

test("searchGroups groups by tab when there are several docs tabs", async () => {
  const searchGroups = await loadGroups();
  const { order, byUrl } = searchGroups({
    navigation: {
      tabs: [
        { label: "Docs", groups: [{ group: "A", pages: [{ href: "/a" }] }] },
        { label: "Guides", groups: [{ group: "B", pages: [{ href: "/guides/b" }] }] },
      ],
    },
  });
  assert.deepEqual(order, ["Docs", "Guides"]);
  assert.equal(byUrl.get("/guides/b"), "Guides");
});
