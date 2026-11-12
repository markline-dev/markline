import test from "node:test";
import assert from "node:assert/strict";
import { codeSamples } from "../lib/openapi-codegen";
import type { OpenAPIDoc, OpenAPIOperation } from "../lib/openapi";

function op(tag: string, method: "get" | "post" = "get"): OpenAPIOperation {
  return {
    method,
    path: "/resource",
    tag,
    summary: "Sample operation",
    operationId: "sampleOperation",
    security: [],
    parameters: { path: [], query: [], header: [] },
    responses: [],
    requestBody: undefined,
    events: [],
  };
}

const doc: OpenAPIDoc = {
  info: { title: "Acme Payments API", version: "1.0.0" },
  servers: [{ url: "https://api.example.com" }],
  tags: [],
  sections: [],
  tagLabels: {},
  operationsById: {},
  securitySchemes: {},
  webhooks: [],
  warnings: [],
};

const root = {};

function nodeSample(tag: string): string {
  const rail = codeSamples(op(tag), doc, root, "https://api.example.com", ["node"]);
  // Samples carry highlight markup; the variable name is what these tests are about.
  return rail.tabs[0].html.replace(/<[^>]+>/g, "");
}

test("plain singular tag keeps its name", () => {
  assert.match(nodeSample("projects"), /const project = await/);
});

test("nested tag uses the last path segment", () => {
  assert.match(nodeSample("tools/fx"), /const fx = await/);
});

test("hyphenated tag is camelCased", () => {
  assert.match(nodeSample("payment-methods"), /const paymentMethod = await/);
});

test("reserved word gets a Result suffix", () => {
  assert.match(nodeSample("types"), /const typeResult = await/);
  // Not keywords, but invalid as a `const` name in a module.
  assert.match(nodeSample("evals"), /const evalResult = await/);
});

test("trailing slash keeps the last segment", () => {
  assert.match(nodeSample("tools/"), /const tool = await/);
});
