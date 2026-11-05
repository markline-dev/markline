import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// syncApp's staging of public/, through the real CLI and a next that does nothing.

test("a linked public/ is staged as real files, replacing an old link", (t) => {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "markline-public-")));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const app = path.join(root, "markline");
  fs.cpSync(path.join(import.meta.dirname, "..", "bin"), path.join(app, "bin"), { recursive: true });
  fs.writeFileSync(path.join(app, "package.json"), "{}");
  fs.mkdirSync(path.join(app, "node_modules", "next", "dist", "bin"), { recursive: true });
  fs.writeFileSync(path.join(app, "node_modules", "next", "package.json"), "{}");
  fs.writeFileSync(path.join(app, "node_modules", "next", "dist", "bin", "next"), "");

  const site = path.join(root, "site");
  const shared = path.join(root, "shared");
  const other = path.join(root, "other");
  fs.mkdirSync(path.join(site, ".markline"), { recursive: true });
  fs.mkdirSync(shared);
  fs.mkdirSync(other);
  fs.writeFileSync(path.join(site, "markline.json"), "{}");
  fs.writeFileSync(path.join(shared, "logo.txt"), "logo");
  fs.symlinkSync(shared, path.join(site, "public"));
  fs.symlinkSync(other, path.join(site, ".markline", "public"));

  const r = spawnSync(process.execPath, [path.join(app, "bin", "markline.mjs"), "start"], { cwd: site, encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
  const staged = path.join(site, ".markline", "public");
  assert.equal(fs.lstatSync(staged).isSymbolicLink(), false);
  assert.equal(fs.readFileSync(path.join(staged, "logo.txt"), "utf8"), "logo");
  assert.deepEqual(fs.readdirSync(other), [], "nothing reached the old link's target");
});
