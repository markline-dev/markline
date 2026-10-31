import { test } from "node:test";
import assert from "node:assert/strict";
import { isIconPath } from "../lib/icon-path.ts";

test("paths and URLs are custom icons; names are Phosphor icons", () => {
  for (const p of ["/icons/a.svg", "./a.png", "https://cdn.example.com/x.webp", "icons/agents.svg", "/logo.png?v=2"]) {
    assert.equal(isIconPath(p), true, p);
  }
  for (const n of ["rocket-launch", "BookOpen", "house", "github-logo"]) {
    assert.equal(isIconPath(n), false, n);
  }
});
