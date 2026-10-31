import { test } from "node:test";
import assert from "node:assert/strict";
import { codeSamples } from "../lib/openapi-codegen.ts";
import type { OpenAPIDoc, OpenAPIOperation } from "../lib/openapi.ts";

const doc: OpenAPIDoc = {
  info: { title: "Hyphen API", version: "1" },
  servers: [],
  tags: [],
  tagLabels: {},
  operationsById: {},
  securitySchemes: {},
  webhooks: [],
};

const op = (tag: string): OpenAPIOperation => ({
  operationId: "list",
  method: "get",
  path: "/v1/items",
  tag,
  parameters: { path: [], query: [], header: [] },
  responses: [{ status: "200", description: "OK" }],
  security: [],
  events: [],
});

function htmlFor(tag: string, key: "js" | "py" | "go"): string {
  const rail = codeSamples(op(tag), doc, {}, "https://api.example.com", ["node", "python", "go"]);
  const tab = rail.tabs.find((t) => t.key === key);
  assert.ok(tab, `expected a ${key} tab`);
  return tab.html.replace(/<[^>]+>/g, "");
}

test("nested tag renders a valid result variable in every generated language", () => {
  const js = htmlFor("tools/fx", "js");
  const py = htmlFor("tools/fx", "py");
  const go = htmlFor("tools/fx", "go");

  assert.equal(js, "const fx = await hyphen.toolsfx.list()");
  assert.equal(py, "fx = hyphen.toolsfx.list()");
  assert.match(go, /^fx, err := client\.Toolsfx\.List\(ctx, /);

  // The raw tag must never leak into an identifier slot.
  assert.ok(!js.includes("tools/fx"));
  assert.ok(!py.includes("tools/fx"));
  assert.ok(!go.includes("tools/fx, err"));
});

test("hyphenated tag becomes a camelCased result variable", () => {
  const js = htmlFor("payment-methods", "js");
  const py = htmlFor("payment-methods", "py");
  const go = htmlFor("payment-methods", "go");

  assert.equal(js, "const paymentMethod = await hyphen.paymentmethods.list()");
  assert.equal(py, "paymentMethod = hyphen.paymentmethods.list()");
  assert.match(go, /^paymentMethod, err := client\.Paymentmethods\.List\(ctx, /);

  assert.ok(!js.includes("payment-methods"));
  assert.ok(!py.includes("payment-methods"));
  assert.ok(!go.includes("payment-methods, err"));
});

test("plain plural tags keep the existing singular result variable", () => {
  assert.equal(htmlFor("projects", "js"), "const project = await hyphen.projects.list()");
  assert.equal(htmlFor("billing/invoices", "js"), "const invoice = await hyphen.billinginvoices.list()");
});
