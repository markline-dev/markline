import { test } from "node:test";
import assert from "node:assert/strict";
import { isIconPath, keepsColor } from "../lib/icon-path.ts";

test("paths and URLs are custom icons; names are Phosphor icons", () => {
  for (const p of ["/icons/a.svg", "./a.png", "https://cdn.example.com/x.webp", "icons/agents.svg", "/logo.png?v=2"]) {
    assert.equal(isIconPath(p), true, p);
  }
  for (const n of ["rocket-launch", "BookOpen", "house", "github-logo"]) {
    assert.equal(isIconPath(n), false, n);
  }
});

test("?color keeps an icon's own colours", () => {
  assert.equal(isIconPath("/icons/slack.svg?color"), true);
  assert.equal(keepsColor("/icons/slack.svg?color"), true);
  assert.equal(keepsColor("/icons/a.svg?v=2&color"), true);
  assert.equal(keepsColor("/icons/a.svg"), false);
  assert.equal(keepsColor("/icons/colorful.svg"), false);
  assert.equal(keepsColor("/icons/a.svg?colors=1"), false);
});
