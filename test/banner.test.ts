import { test } from "node:test";
import assert from "node:assert/strict";
import { bannerExpired, bannerId, bannerScript } from "../lib/banner.ts";

test("bannerExpired is false through the last day", () => {
  assert.equal(bannerExpired(undefined, new Date()), false);
  assert.equal(bannerExpired("2026-11-30", new Date(2026, 10, 30, 23, 0)), false);
  assert.equal(bannerExpired("2026-11-30", new Date(2026, 11, 1, 0, 1)), true);
  assert.equal(bannerExpired("not a date", new Date()), false);
});

test("bannerId prefers the id and changes with the text", () => {
  assert.equal(bannerId({ id: "black-friday", text: "x" }), "black-friday");
  assert.equal(bannerId({ text: "Sale" }), bannerId({ text: "Sale" }));
  assert.notEqual(bannerId({ text: "Sale" }), bannerId({ text: "Sale ends soon" }));
});

test("bannerScript can't close its <script> element", () => {
  assert.ok(!bannerScript({ text: "</script><script>alert(1)</script>", id: "</script>" }).includes("</script>"));
});
