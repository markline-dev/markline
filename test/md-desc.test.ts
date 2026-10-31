import { test } from "node:test";
import assert from "node:assert/strict";
import { mdToHtml, mdToText } from "../lib/md-desc.ts";

test("mdToHtml renders inline markdown, unwrapping a single paragraph", () => {
  // A lone paragraph is unwrapped so the description stays inline.
  assert.equal(mdToHtml("plain text"), "plain text");
  assert.equal(mdToHtml("**bold** and `code`"), "<strong>bold</strong> and <code>code</code>");
  assert.equal(mdToHtml("a [link](https://example.com)"), 'a <a href="https://example.com">link</a>');
});

test("mdToHtml keeps block wrappers for multi-block content", () => {
  const html = mdToHtml("| a | b |\n| - | - |\n| 1 | 2 |");
  assert.match(html, /<table>/);
  const list = mdToHtml("- one\n- two");
  assert.match(list, /<ul>/);
  // Multiple paragraphs are not unwrapped into invalid inline flow.
  assert.match(mdToHtml("para one\n\npara two"), /^<p>para one<\/p>\s*<p>para two<\/p>$/);
});

test("mdToHtml drops raw HTML and neutralizes unsafe links", () => {
  // Raw HTML never reaches the output (no rehype-raw): a <script> is dropped.
  assert.doesNotMatch(mdToHtml("<script>alert(1)</script>"), /<script/i);
  assert.doesNotMatch(mdToHtml("<img src=x onerror=alert(1)>"), /onerror/i);
  // rehype-sanitize strips a javascript: href but keeps the link text.
  const link = mdToHtml("[x](javascript:alert(1))");
  assert.doesNotMatch(link, /javascript:/i);
  assert.match(link, />?x<?/);
  // A normal https link survives.
  assert.match(mdToHtml("[x](https://example.com)"), /href="https:\/\/example\.com"/);
});

test("mdToHtml passes empty/undefined through", () => {
  assert.equal(mdToHtml(undefined), undefined);
  assert.equal(mdToHtml(""), "");
});

test("mdToText strips markup and collapses to plain text", () => {
  assert.equal(mdToText("**bold** and `code`"), "bold and code");
  assert.equal(mdToText("a [link](https://example.com) here"), "a link here");
});

test("mdToText truncates on a word boundary with an ellipsis", () => {
  const out = mdToText("one two three four five six seven eight nine ten", 20);
  assert.ok(out!.length <= 21, `expected <=21 chars, got ${out!.length}`);
  assert.ok(out!.endsWith("…"));
  assert.ok(!out!.includes("  "));
});
