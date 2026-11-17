import { test } from "node:test";
import assert from "node:assert/strict";
// lib/ imports resolve via test/setup.mjs, which `npm test` loads first.
import { cutHtml } from "../lib/code-cut.ts";
import { colorizeJson } from "../lib/openapi-codegen.ts";

const lines = (n: number) => Array.from({ length: n }, (_, i) => `<span class="k">"k${i}"</span>`).join("\n");

test("short code isn't cut; long code is cut at whole lines", () => {
  assert.equal(cutHtml(lines(200)), null);
  const cut = cutHtml(lines(201))!;
  assert.deepEqual([cut.shown, cut.total], [200, 201]);
  assert.equal(cut.html.split("\n").length, 200);
  assert.ok(cut.html.endsWith('"k199"</span>'));
});

test("a cut never leaves a tag open: it stops where every tag so far is closed", () => {
  // A span that spans lines 2–4: the cut at 3 lines backs up to before it.
  const html = ["<b>a</b>", "<span>", "b", "</span>", "c", "d"].join("\n");
  assert.deepEqual(cutHtml(html, 3), { html: "<b>a</b>", shown: 1, total: 6 });
  assert.deepEqual(cutHtml(html, 4), { html: ["<b>a</b>", "<span>", "b", "</span>"].join("\n"), shown: 4, total: 6 });
  // Never balanced before the end: not cut at all.
  assert.equal(cutHtml(["<span>", "a", "b", "c"].join("\n"), 2), null);
});

test("over the byte limit with few lines: cut by size, still at a line", () => {
  const long = Array.from({ length: 10 }, () => "x".repeat(100)).join("\n");
  const cut = cutHtml(long, 200, 350)!;
  assert.deepEqual([cut.shown, cut.total], [3, 10]);
});

test("a highlighted JSON example cut at 200 lines is whole lines of it", () => {
  const value = { items: Array.from({ length: 300 }, (_, i) => ({ id: i, name: `n${i}` })) };
  const html = colorizeJson(value);
  const cut = cutHtml(html)!;
  assert.equal(cut.shown, 200);
  // Each kept line is a line of the full rendering, unchanged.
  assert.deepEqual(cut.html.split("\n"), html.split("\n").slice(0, 200));
  // As text, it's the start of the example's own JSON.
  const text = cut.html.replace(/<[^>]+>/g, "").replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
  assert.ok(JSON.stringify(value, null, 2).startsWith(text), text.slice(0, 200));
});
