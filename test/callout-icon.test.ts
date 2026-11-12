import { test } from "node:test";
import assert from "node:assert/strict";
import { calloutIcon } from "../lib/callout-icon";
import { elementsIn } from "../lib/toc";

// A callout's `icon`: a Phosphor name or a short glyph, never anything it would load.

test("a Phosphor name or a short glyph is taken", () => {
  assert.deepEqual(calloutIcon("rocket-launch"), { kind: "phosphor", name: "rocket-launch" });
  assert.deepEqual(calloutIcon("rocket-launch:duotone"), { kind: "phosphor", name: "rocket-launch:duotone" });
  for (const glyph of ["↗", "★", "🚀", "⚠️", "👍🏽", "!!"]) assert.deepEqual(calloutIcon(glyph), { kind: "text", text: glyph }, glyph);
});

test("paths, URLs, markup, long text and non-strings are ignored", () => {
  const ignored = [
    "/evil.svg", "./x.png", "https://x.test/y.png", "x.svg", "icon.webp?x",
    "<img src=x>", "javascript:alert(1)", "data:image/svg+xml,", "ab!c", "↗↗↗", "a b", "", "  ",
    undefined, null, 5, {}, ["↗"],
  ];
  for (const v of ignored) assert.equal(calloutIcon(v), undefined, JSON.stringify(v));
});

test("an element in a code block isn't used by the page", () => {
  assert.ok(elementsIn("<MigrationCallout>x</MigrationCallout>").has("MigrationCallout"));
  assert.ok(elementsIn("Text <MigrationCallout>x</MigrationCallout> inline.").has("MigrationCallout"));
  assert.ok(!elementsIn("```mdx\n<MigrationCallout>x</MigrationCallout>\n```\n").has("MigrationCallout"));
  assert.ok(!elementsIn("Use `<MigrationCallout>` no more.").has("MigrationCallout"));
  assert.deepEqual([...elementsIn("<Broken")], [], "a page that doesn't parse uses none");
});

test("a name-shaped value is read as a Phosphor icon; an unknown one falls back when rendered", () => {
  assert.deepEqual(calloutIcon("abc"), { kind: "phosphor", name: "abc" });
});
