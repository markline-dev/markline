import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { contentRootFrom } from "../scripts/content-root.mjs";
import { contentRoot } from "../lib/paths";

// The build indexes the same content folder the app renders.

test("the build and the app agree on where the content is", (t) => {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "markline-root-")));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const cwd = process.cwd();
  const env = process.env.MARKLINE_CONTENT;
  t.after(() => {
    process.chdir(cwd);
    if (env === undefined) delete process.env.MARKLINE_CONTENT;
    else process.env.MARKLINE_CONTENT = env;
  });
  process.chdir(dir);

  const both = (configured: string | undefined) => {
    if (configured === undefined) delete process.env.MARKLINE_CONTENT;
    else process.env.MARKLINE_CONTENT = configured;
    return [contentRootFrom(configured, dir), contentRoot()];
  };
  assert.deepEqual(both(undefined), [path.join(dir, "content"), path.join(dir, "content")]);
  fs.mkdirSync(path.join(dir, "site"));
  fs.writeFileSync(path.join(dir, "site", "markline.json"), "{}");
  assert.deepEqual(both(undefined), [path.join(dir, "site"), path.join(dir, "site")], "the repo's own site");
  assert.deepEqual(both("docs-here"), [path.join(dir, "docs-here"), path.join(dir, "docs-here")]);
  assert.deepEqual(both("/abs/site"), ["/abs/site", "/abs/site"]);
});
