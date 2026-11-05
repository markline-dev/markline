import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// What syncApp does with links already in the staging folder, through the real
// CLI and a next that does nothing.

function setup(t: { after: (fn: () => void) => void }) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "markline-staging-")));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const app = path.join(root, "markline");
  fs.cpSync(path.join(import.meta.dirname, "..", "bin"), path.join(app, "bin"), { recursive: true });
  fs.writeFileSync(path.join(app, "package.json"), "{}");
  fs.mkdirSync(path.join(app, "lib"));
  fs.writeFileSync(path.join(app, "lib", "framework.ts"), "framework");
  fs.mkdirSync(path.join(app, "node_modules", "next", "dist", "bin"), { recursive: true });
  fs.writeFileSync(path.join(app, "node_modules", "next", "package.json"), "{}");
  fs.writeFileSync(path.join(app, "node_modules", "next", "dist", "bin", "next"), "");
  const site = path.join(root, "site");
  fs.mkdirSync(site);
  fs.writeFileSync(path.join(site, "markline.json"), "{}");
  const work = path.join(site, ".markline");
  const outside = path.join(root, "outside");
  fs.mkdirSync(outside);
  fs.writeFileSync(path.join(outside, "keep.txt"), "keep");
  return {
    app,
    site,
    work,
    outside,
    run: () => spawnSync(process.execPath, [path.join(app, "bin", "markline.mjs"), "start"], { cwd: site, encoding: "utf8" }),
  };
}

test("a linked staging folder becomes a real one, and its target is left alone", (t) => {
  const { work, outside, run } = setup(t);
  fs.mkdirSync(path.join(outside, "lib"));
  fs.writeFileSync(path.join(outside, "lib", "canary.txt"), "canary");
  fs.symlinkSync(outside, work);

  const r = run();
  assert.equal(r.status, 0, r.stderr);
  assert.equal(fs.lstatSync(work).isSymbolicLink(), false);
  assert.equal(fs.readFileSync(path.join(work, "lib", "framework.ts"), "utf8"), "framework");
  assert.equal(fs.readFileSync(path.join(outside, "lib", "canary.txt"), "utf8"), "canary");
  assert.deepEqual(fs.readdirSync(path.join(outside, "lib")), ["canary.txt"]);
  assert.equal(fs.readFileSync(path.join(outside, "keep.txt"), "utf8"), "keep");
});

test("links under the staging folder are removed, and what they point at stays", (t) => {
  const { site, work, outside, run } = setup(t);
  const victim = path.join(outside, "victim.txt");
  fs.writeFileSync(victim, "victim");
  fs.mkdirSync(path.join(work, "public", "deep"), { recursive: true });
  fs.mkdirSync(path.join(work, ".next", "server"), { recursive: true });
  fs.writeFileSync(path.join(work, ".next", "BUILD_ID"), "id");
  fs.symlinkSync(victim, path.join(work, "public", "x.txt"));
  fs.symlinkSync(outside, path.join(work, "public", "d"));
  fs.symlinkSync(outside, path.join(work, "public", "deep", "d"));
  fs.symlinkSync(outside, path.join(work, ".next", "server", "d"));
  fs.symlinkSync(victim, path.join(work, ".markline-generated.json"));
  fs.mkdirSync(path.join(site, "public"));
  fs.writeFileSync(path.join(site, "public", "x.txt"), "the site's");

  const r = run();
  assert.equal(r.status, 0, r.stderr);
  assert.equal(fs.readFileSync(victim, "utf8"), "victim");
  assert.equal(fs.readFileSync(path.join(outside, "keep.txt"), "utf8"), "keep");
  assert.equal(fs.readFileSync(path.join(work, "public", "x.txt"), "utf8"), "the site's");
  for (const p of [["public", "d"], ["public", "deep", "d"], [".next", "server", "d"], [".markline-generated.json"]]) {
    assert.equal(fs.lstatSync(path.join(work, ...p), { throwIfNoEntry: false }), undefined, p.join("/"));
  }
  assert.equal(fs.readFileSync(path.join(work, ".next", "BUILD_ID"), "utf8"), "id");
});

test("a linked .next is removed, and its target stays", (t) => {
  const { work, outside, run } = setup(t);
  fs.mkdirSync(work);
  fs.symlinkSync(outside, path.join(work, ".next"));
  const r = run();
  assert.equal(r.status, 0, r.stderr);
  assert.equal(fs.lstatSync(path.join(work, ".next"), { throwIfNoEntry: false }), undefined);
  assert.equal(fs.readFileSync(path.join(outside, "keep.txt"), "utf8"), "keep");
});

test("parts of .next left unwalked still can't be links themselves", (t) => {
  const { work, outside, run } = setup(t);
  fs.mkdirSync(path.join(work, ".next"), { recursive: true });
  for (const name of ["standalone", "node_modules"]) fs.symlinkSync(outside, path.join(work, ".next", name));
  assert.equal(run().status, 0);
  for (const name of ["standalone", "node_modules"]) {
    assert.equal(fs.lstatSync(path.join(work, ".next", name), { throwIfNoEntry: false }), undefined, name);
  }
  assert.equal(fs.readFileSync(path.join(outside, "keep.txt"), "utf8"), "keep");
});

test("a normal staging folder keeps its build, cache and deps across runs", (t) => {
  const { app, work, run } = setup(t);
  const cached = path.join(work, ".next", "cache", "webpack", "pack");
  const standalone = path.join(work, ".next", "standalone", "node_modules");
  const hashed = path.join(work, ".next", "node_modules");
  fs.mkdirSync(path.dirname(cached), { recursive: true });
  fs.writeFileSync(cached, "cache");
  fs.mkdirSync(standalone, { recursive: true });
  fs.mkdirSync(hashed, { recursive: true });
  fs.symlinkSync("../next", path.join(standalone, "linked"));
  fs.symlinkSync("../next", path.join(hashed, "linked"));
  for (const i of [1, 2, 3]) {
    const r = run();
    assert.equal(r.status, 0, `${i}: ${r.stderr}`);
    assert.equal(r.stderr, "", "a normal run says nothing about links");
    assert.equal(fs.readFileSync(cached, "utf8"), "cache");
    assert.ok(fs.lstatSync(path.join(standalone, "linked")).isSymbolicLink(), "a build's own links stay");
    assert.ok(fs.lstatSync(path.join(hashed, "linked")).isSymbolicLink(), "a build's own links stay");
    assert.equal(fs.realpathSync(path.join(work, "node_modules")), path.join(app, "node_modules"));
  }
});

test("the walk doesn't go into a real node_modules", (t) => {
  const { work, outside, run } = setup(t);
  const real = path.join(work, "node_modules", ".bin");
  fs.mkdirSync(real, { recursive: true });
  fs.symlinkSync(outside, path.join(real, "tool"));
  assert.equal(run().status, 0);
  assert.ok(fs.lstatSync(path.join(real, "tool")).isSymbolicLink());
});
