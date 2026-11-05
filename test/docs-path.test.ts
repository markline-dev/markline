import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { isSafeSlug } from "../lib/paths";

test("a slug that could leave its folder isn't safe", () => {
  assert.equal(isSafeSlug(["guides", "a"]), true);
  assert.equal(isSafeSlug([]), true);
  assert.equal(isSafeSlug(["..", "private"]), false);
  assert.equal(isSafeSlug(["guides", "..", "..", "private"]), false);
  assert.equal(isSafeSlug(["../private"]), false);
  assert.equal(isSafeSlug(["..\\private"]), false);
  assert.equal(isSafeSlug(["."]), false);
  assert.equal(isSafeSlug(["a\0"]), false);
  assert.equal(isSafeSlug(["..."]), true); // a plain, odd name
});

test("getDoc only reads pages under docs/", async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "markline-docs-"));
  const prev = process.env.MARKLINE_CONTENT;
  t.after(() => {
    fs.rmSync(root, { recursive: true, force: true });
    if (prev === undefined) delete process.env.MARKLINE_CONTENT;
    else process.env.MARKLINE_CONTENT = prev;
  });
  const content = path.join(root, "content");
  fs.mkdirSync(path.join(content, "docs", "guides"), { recursive: true });
  fs.writeFileSync(path.join(content, "markline.json"), '{"name":"t"}');
  const page = (title: string) => `---\ntitle: ${title}\n---\nbody\n`;
  fs.writeFileSync(path.join(content, "docs", "guides", "a.mdx"), page("Guide"));
  fs.writeFileSync(path.join(content, "private.mdx"), page("In content root"));
  fs.writeFileSync(path.join(root, "outside.mdx"), page("Outside content root"));
  process.env.MARKLINE_CONTENT = content;

  const { getDoc } = await import("../lib/docs");
  assert.equal(getDoc(["guides", "a"])?.fm.title, "Guide");
  assert.equal(getDoc(["..", "private"]), undefined);
  assert.equal(getDoc(["../private"]), undefined);
  assert.equal(getDoc(["guides", "..", "..", "private"]), undefined);
  assert.equal(getDoc(["..", "..", "outside"]), undefined);
});
