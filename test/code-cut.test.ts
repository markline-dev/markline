import { test } from "node:test";
import assert from "node:assert/strict";
// lib/ imports resolve via test/setup.mjs, which `npm test` loads first.
import { cutHtml, fullCodeHtml, fullCodeText, htmlText, lineCount, registerCode } from "../lib/code-cut.ts";
import { colorizeJson } from "../lib/openapi-codegen.ts";

const lines = (n: number) => Array.from({ length: n }, (_, i) => `<span class="k">"k${i}"</span>`).join("\n");
/** Opening minus closing spans: 0 when the markup is whole. */
const depth = (s: string) => (s.match(/<span\b/g)?.length ?? 0) - (s.match(/<\/span>/g)?.length ?? 0);

test("up to the limit isn't cut; past it, the cut is exactly at the limit", () => {
  assert.equal(cutHtml(lines(10), 10), null);
  const cut = cutHtml(lines(11), 10)!;
  assert.deepEqual([cut.shown, cut.total], [10, 11]);
  assert.equal(cut.html.split("\n").length, 10);
  assert.ok(cut.html.endsWith('"k9"</span>'));
});

test("a span open across the cut (a whole cURL body, a string over many lines) is closed at the limit", () => {
  // As cURL highlights it: the whole -d body in one string span.
  const curl = ['<span class="c">curl</span> -X POST \\\\', '  -d <span class="s">\'{', ...Array.from({ length: 400 }, (_, i) => `  "k${i}": ${i},`), "}'</span>"].join("\n");
  const cut = cutHtml(curl, 100)!;
  assert.deepEqual([cut.shown, cut.total], [100, 403]);
  assert.equal(cut.html.split("\n").length, 100);
  assert.equal(depth(cut.html), 0);
  assert.ok(cut.html.endsWith(`"k97": 97,</span>`));
  // Nested: both closed, innermost first.
  const nested = ['<span class="a"><span class="b">x', "y", "z</span></span>"].join("\n");
  assert.equal(cutHtml(nested, 2)!.html, '<span class="a"><span class="b">x\ny</span></span>');
});

test("a trailing newline isn't a line: the note and the Expand dialog count the same", () => {
  assert.equal(lineCount("a\nb\n"), 2);
  assert.equal(lineCount("a\nb"), 2);
  assert.equal(cutHtml(`${lines(10)}\n`, 10), null);
  assert.equal(cutHtml(`${lines(11)}\n`, 10)!.total, 11);
});

test("a highlighted JSON example cut at the limit is its first lines, unchanged", () => {
  const value = { items: Array.from({ length: 800 }, (_, i) => ({ id: i, name: `n${i}` })) };
  const html = colorizeJson(value);
  const cut = cutHtml(html)!;
  assert.equal(cut.shown, 1000);
  assert.deepEqual(cut.html.split("\n"), html.split("\n").slice(0, 1000));
  assert.ok(JSON.stringify(value, null, 2).startsWith(htmlText(cut.html)));
});

test("Copy, Expand and Markdown read a cut card's whole code; any other card's is what it shows", () => {
  const pre = (attrs: Record<string, string>, innerHTML: string, textContent: string) => ({ getAttribute: (n: string) => attrs[n] ?? null, innerHTML, textContent });
  const full = '<span class="k">"a"</span>: <span class="s">"x &amp; y"</span>\n<span class="k">"b"</span>: 2';
  const release = registerCode(":r1:", full);
  const cutPre = pre({ "data-code": ":r1:" }, "first line only", "first line only");
  assert.equal(fullCodeHtml(cutPre), full);
  assert.equal(fullCodeText(cutPre), '"a": "x & y"\n"b": 2');
  // Not cut (no data-code), or not registered: what the <pre> holds.
  const plain = pre({}, "<b>shown</b>", "shown");
  assert.deepEqual([fullCodeHtml(plain), fullCodeText(plain)], ["<b>shown</b>", "shown"]);
  release();
  assert.equal(fullCodeText(cutPre), "first line only");
});
