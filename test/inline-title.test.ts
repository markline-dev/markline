import { test } from "node:test";
import assert from "node:assert/strict";
import { safeHref, titleNodes, titleText } from "../lib/inline-title";

// A step title's inline Markdown.

test("code, emphasis and links are read; the text is what a reader sees", () => {
  assert.equal(titleText("Set `API_KEY`"), "Set API_KEY");
  assert.equal(titleText("**bold**, *it*, ~~old~~ and `a*b*c`"), "bold, it, old and a*b*c");
  assert.equal(titleText("See [the *docs*](https://x.test)"), "See the docs");
  assert.equal(titleText("![logo](/a.png) Logo"), "logo Logo", "an image is its alt");
  assert.equal(titleText("a <b>bold</b> c"), "a bold c", "HTML is never rendered");
  assert.equal(titleText("1 \\* 2"), "1 * 2", "an escape");
  assert.equal(titleText("plain title"), "plain title");
});

test("what would start a block stays text", () => {
  for (const t of ["1. Install", "2) Run", "- listy", "# Heading-like", "> quoted"]) assert.equal(titleText(t), t, t);
});

test("a link to javascript:, data: or vbscript: keeps its text and loses its URL", () => {
  for (const url of ["javascript:alert(1)", "JaVaScRiPt:alert(1)", "data:text/html,x", "vbscript:x", " javascript:x"]) {
    assert.deepEqual(titleNodes(`[x](${url})`), [{ type: "link", href: undefined, children: [{ type: "text", value: "x" }] }], url);
  }
  for (const ok of ["/docs/a", "#step", "https://x.test", "mailto:a@b.test", "guides/a"]) assert.equal(safeHref(ok), ok, ok);
});
