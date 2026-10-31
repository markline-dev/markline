import { test } from "node:test";
import assert from "node:assert/strict";
import { contrastRatio, onColor } from "../lib/contrast.ts";

test("dark and saturated brand colours keep white text", () => {
  assert.equal(onColor("60 135 240"), "255 255 255"); // Markline blue
  assert.equal(onColor("63 107 53"), "255 255 255"); // deep green
  assert.equal(onColor("194 65 12"), "255 255 255"); // burnt orange
});

test("light brand colours get dark text", () => {
  assert.equal(onColor("183 211 163"), "17 17 19"); // pale green
  assert.equal(onColor("250 204 21"), "17 17 19"); // yellow
  assert.equal(onColor("255 255 255"), "17 17 19");
});

test("contrastRatio matches WCAG", () => {
  assert.equal(Math.round(contrastRatio("0 0 0", "255 255 255")), 21);
  assert.equal(contrastRatio("120 120 120", "120 120 120"), 1);
});
