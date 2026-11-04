import { test } from "node:test";
import assert from "node:assert/strict";
import { heroBackground } from "../lib/hero-background.ts";

test("image paths and URLs become a cover-fitted url()", () => {
  assert.equal(heroBackground("/hero.jpg"), 'url("/hero.jpg") center / cover no-repeat');
  assert.equal(heroBackground("https://cdn.example.com/a b.png"), 'url("https://cdn.example.com/a%20b.png") center / cover no-repeat');
  assert.equal(heroBackground("images/bg.webp"), 'url("images/bg.webp") center / cover no-repeat');
  assert.equal(heroBackground('/x".jpg'), 'url("/x%22.jpg") center / cover no-repeat');
});

test("colours and gradients are used as written", () => {
  assert.equal(heroBackground("#101820"), "#101820");
  assert.equal(heroBackground("linear-gradient(135deg, #111 0%, #f50 100%)"), "linear-gradient(135deg, #111 0%, #f50 100%)");
  assert.equal(heroBackground("red; color: blue"), "red color: blue");
  assert.equal(heroBackground("  "), undefined);
  assert.equal(heroBackground(undefined), undefined);
});
