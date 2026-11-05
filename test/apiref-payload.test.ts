import { test } from "node:test";
import assert from "node:assert/strict";
import { apiOperationLabel, apiTabHoldsDocs, hoistEndpoints, withEndpoints } from "../lib/apiref-payload.ts";

test("an OpenAPI tab holds docs when it matches outside the reference or is the fallback", () => {
  const api = { match: ["/api-reference"] };
  const docs = { match: ["__default__"] };
  assert.equal(apiTabHoldsDocs(api, [docs, api]), false);
  assert.equal(apiTabHoldsDocs({ match: ["/api-reference/v2"] }, [docs, api]), false);
  const sdk = { match: ["/api-reference", "/sdk"] };
  assert.equal(apiTabHoldsDocs(sdk, [docs, sdk]), true);
  assert.equal(apiTabHoldsDocs({ match: ["/api-referencex"] }, [docs]), true, "only the path itself counts");
  assert.equal(apiTabHoldsDocs(docs, [docs]), true, "__default__ is the fallback");
  const other = { match: ["/guides"] };
  assert.equal(apiTabHoldsDocs(api, [api, other]), true, "with no __default__, the first tab is the fallback");
  assert.equal(apiTabHoldsDocs(api, [other, api]), false);
});

test("apiOperationLabel names an operation link, and nothing else", () => {
  const ops = { createProject: { operationId: "createProject", summary: "Create a project" }, bare: { operationId: "bare" } };
  assert.equal(apiOperationLabel("/api-reference/createProject", ops), "Create a project");
  assert.equal(apiOperationLabel("/api-reference/createProject#x", ops), "Create a project");
  assert.equal(apiOperationLabel("/api-reference/bare", ops), "bare");
  assert.equal(apiOperationLabel("/api-reference/missing", ops), undefined);
  assert.equal(apiOperationLabel("/api-reference/constructor", ops), undefined);
  assert.equal(apiOperationLabel("/guides/createProject", ops), undefined);
});

test("hoistEndpoints sends the endpoint list once; withEndpoints restores it", () => {
  const endpoints = [{ href: "/a" }, { href: "/b" }];
  const sections = [
    { id: 1, playground: { method: "get", endpoints } },
    { id: 2, playground: { method: "post", endpoints } },
    { id: 3 },
  ];
  const out = hoistEndpoints(sections);
  assert.deepEqual(out.endpoints, endpoints);
  assert.deepEqual(out.sections.map((s) => s.playground), [{ method: "get" }, { method: "post" }, undefined]);
  assert.deepEqual(withEndpoints(out.sections[1].playground!, out.endpoints), { method: "post", endpoints });
  assert.equal(sections[0].playground!.endpoints, endpoints, "input is not mutated");
});
