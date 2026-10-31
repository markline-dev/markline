import { test } from "node:test";
import assert from "node:assert/strict";
import { clipSnippet, hoistEndpoints, withEndpoints } from "../lib/apiref-payload.ts";

test("clipSnippet keeps short text and cuts long text at a word", () => {
  assert.equal(clipSnippet("  Lists\n  voices. "), "Lists voices.");
  const long = "Returns the agent configuration, including the prompt, tools, knowledge base and every voice setting used by the agent.";
  const out = clipSnippet(long, 60);
  assert.ok(out.length <= 61, out);
  assert.ok(out.endsWith("…"));
  assert.ok(long.startsWith(out.slice(0, -1)));
  assert.equal(clipSnippet("x".repeat(80), 50), `${"x".repeat(50)}…`);
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
