import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { OpenAPIDoc, OpenAPIOperation } from "../lib/openapi.ts";
// lib/ imports resolve via test/setup.mjs, which `npm test` loads first.
import { buildApiRefView } from "../lib/apiref-view.ts";

// The Copy for LLM / View as Markdown actions can only keep link targets if the
// view hands them the original markdown, not just the rendered HTML.
const LEAD_MD = "See the [entries guide](https://example.com/entries)";
const TAG_MD = "See the [ledger guide](https://example.com/ledger)";

const op = {
  operationId: "listEntries",
  method: "get",
  path: "/ledger/entries",
  tag: "Ledger",
  summary: "List entries",
  description: LEAD_MD,
  parameters: { path: [], query: [], header: [] },
  responses: [],
  security: [],
  events: [],
} as unknown as OpenAPIOperation;

const doc = {
  info: { title: "Test", version: "1.0.0" },
  servers: [{ url: "https://api.example.com" }],
  tags: [{ name: "Ledger", description: TAG_MD, operations: [op], events: [] }],
  operationsById: { listEntries: op },
  securitySchemes: {},
  webhooks: [],
} as unknown as OpenAPIDoc;

test("buildApiRefView keeps the resource intro's original markdown as leadMd", () => {
  const view = buildApiRefView(doc, {}, "ledger");
  assert.equal(view.resource.leadMd, TAG_MD);
});

test("buildApiRefView keeps each operation's original markdown as leadMd", () => {
  const view = buildApiRefView(doc, {}, "ledger");
  assert.equal(view.resource.sections[0]?.leadMd, LEAD_MD);
});

// Rendering the component needs a JSX toolchain this test runner lacks, so check the wiring in source.
test("MarklineApiRef puts leadMd on the resource intro and operation intro as data-md", () => {
  const src = readFileSync(new URL("../components/docs/api/reference/markline-apiref.tsx", import.meta.url), "utf8");
  assert.match(src, /className="lead" data-md=\{r\.leadMd\}/);
  assert.match(src, /className="sec-lead" data-md=\{ep\.leadMd\}/);
});
