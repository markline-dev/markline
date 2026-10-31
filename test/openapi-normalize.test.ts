import { test } from "node:test";
import assert from "node:assert/strict";
// lib/ imports resolve via test/setup.mjs, which `npm test` loads first.
import { normalize } from "../lib/openapi.ts";

type Op = Record<string, unknown>;
const op = (operationId: string, extra: Op = {}): Op => ({ operationId, responses: { "200": { description: "OK" } }, ...extra });

test("x-nav-order puts ordered operations first, ascending; the rest keep spec order (#21)", () => {
  const doc = normalize({
    paths: {
      "/accounts": { get: op("list", { tags: ["accounts"] }), post: op("create", { tags: ["accounts"], "x-nav-order": 1 }) },
      "/accounts/{id}": {
        get: op("retrieve", { tags: ["accounts"] }),
        delete: op("remove", { tags: ["accounts"], "x-nav-order": 2 }),
      },
      "/accounts/{id}/close": { post: op("close", { tags: ["accounts"] }) },
    },
  });
  assert.deepEqual(doc.tags[0].operations.map((o) => o.operationId), ["create", "remove", "list", "retrieve", "close"]);
});

test("x-nav-order must be a number; anything else keeps spec order", () => {
  const doc = normalize({
    paths: {
      "/a": { get: op("first", { tags: ["t"] }) },
      "/b": { get: op("second", { tags: ["t"], "x-nav-order": "1" }) },
    },
  });
  assert.deepEqual(doc.tags[0].operations.map((o) => o.operationId), ["first", "second"]);
});

test("an operation is filed under its first tag only; untagged ones under Default", () => {
  const doc = normalize({
    paths: {
      "/accounts": { get: op("list", { tags: ["accounts", "billing"] }) },
      "/health": { get: op("health") },
    },
  });
  assert.deepEqual(doc.tags.map((t) => t.name).sort(), ["Default", "accounts"]);
});

test("declared tags come first in declared order, then the rest alphabetically", () => {
  const doc = normalize({
    tags: [{ name: "zeta" }, { name: "alpha" }, { name: "unused" }],
    paths: {
      "/c": { get: op("c", { tags: ["charlie"] }) },
      "/a": { get: op("a", { tags: ["alpha"] }) },
      "/b": { get: op("b", { tags: ["bravo"] }) },
      "/z": { get: op("z", { tags: ["zeta"] }) },
    },
  });
  assert.deepEqual(doc.tags.map((t) => t.name), ["zeta", "alpha", "bravo", "charlie"]);
});

test("llms.txt lists exactly the resources the site builds pages for (#25, #31)", async () => {
  // scripts/openapi-order.mjs re-implements normalize()'s tag rules for the
  // plain-node build script. This keeps the two from drifting apart again.
  const modulePath = "../scripts/openapi-order.mjs";
  const { orderedResourceTags } = (await import(modulePath)) as { orderedResourceTags: (spec: object) => string[] };
  const spec = {
    tags: [{ name: "zeta" }, { name: "unused" }, { name: "alpha" }, { name: "alpha" }],
    paths: {
      "/a": { get: op("a", { tags: ["alpha", "second-only"] }), parameters: [] },
      "/z": { post: op("z", { tags: ["zeta"] }) },
      "/m": { put: op("m", { tags: ["mike"] }) },
      "/h": { get: op("h") },
    },
  };
  assert.deepEqual(orderedResourceTags(spec), normalize(spec).tags.map((t) => t.name));
});
