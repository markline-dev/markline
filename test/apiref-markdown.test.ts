import { test } from "node:test";
import assert from "node:assert/strict";
import { apiSecToMarkdown } from "../lib/apiref-markdown.ts";

// Minimal stand-in for the DOM: only the selectors apiSecToMarkdown queries.
type FakeEl = { textContent: string; getAttribute: (name: string) => string | null };
function el(text: string, attrs: Record<string, string> = {}): FakeEl {
  return { textContent: text, getAttribute: (name) => attrs[name] ?? null };
}
function section(map: Record<string, FakeEl>) {
  return {
    textContent: "",
    querySelector: (sel: string) => map[sel] ?? null,
    querySelectorAll: () => [],
  } as unknown as Parameters<typeof apiSecToMarkdown>[0];
}

test("apiSecToMarkdown copies the intro's original markdown when data-md is set", () => {
  const sec = section({
    "h1, h2": el("Ledger"),
    ".lead, .sec-lead, .api-summary": el("See the ledger guide", {
      "data-md": "See the [ledger guide](https://example.com/ledger)",
    }),
  });
  assert.equal(apiSecToMarkdown(sec), "# Ledger\n\nSee the [ledger guide](https://example.com/ledger)");
});

test("apiSecToMarkdown falls back to the rendered text without data-md", () => {
  const sec = section({
    "h1, h2": el("Ledger"),
    ".lead, .sec-lead, .api-summary": el("  See the   ledger guide "),
  });
  assert.equal(apiSecToMarkdown(sec), "# Ledger\n\nSee the ledger guide");
});
