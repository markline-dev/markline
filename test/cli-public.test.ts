import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// syncApp's staging of public/, through the real CLI and a next that does nothing.

function setup(t: { after: (fn: () => void) => void }) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "markline-public-")));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const app = path.join(root, "markline");
  fs.cpSync(path.join(import.meta.dirname, "..", "bin"), path.join(app, "bin"), { recursive: true });
  fs.writeFileSync(path.join(app, "package.json"), "{}");
  fs.mkdirSync(path.join(app, "node_modules", "next", "dist", "bin"), { recursive: true });
  fs.writeFileSync(path.join(app, "node_modules", "next", "package.json"), "{}");
  fs.writeFileSync(path.join(app, "node_modules", "next", "dist", "bin", "next"), "");
  const site = path.join(root, "site");
  fs.mkdirSync(site);
  fs.writeFileSync(path.join(site, "markline.json"), "{}");
  return {
    root,
    site,
    pub: path.join(site, "public"),
    staged: path.join(site, ".markline", "public"),
    run: () => spawnSync(process.execPath, [path.join(app, "bin", "markline.mjs"), "start"], { cwd: site, encoding: "utf8" }),
  };
}

/** Every path under `dir` that's a link, which staging should never leave. */
function linksUnder(dir: string): string[] {
  return (fs.readdirSync(dir, { recursive: true, withFileTypes: true }) as fs.Dirent[])
    .filter((e) => e.isSymbolicLink())
    .map((e) => e.name);
}

test("a linked public/ is staged as real files, replacing an old link", (t) => {
  const { root, site, pub, staged, run } = setup(t);
  const shared = path.join(root, "shared");
  const other = path.join(root, "other");
  fs.mkdirSync(path.join(site, ".markline"));
  fs.mkdirSync(shared);
  fs.mkdirSync(other);
  fs.writeFileSync(path.join(shared, "logo.txt"), "logo");
  fs.symlinkSync(shared, pub);
  fs.symlinkSync(other, staged);

  const r = run();
  assert.equal(r.status, 0, r.stderr);
  assert.equal(fs.lstatSync(staged).isSymbolicLink(), false);
  assert.equal(fs.readFileSync(path.join(staged, "logo.txt"), "utf8"), "logo");
  assert.deepEqual(fs.readdirSync(other), [], "nothing reached the old link's target");
});

test("a nested link is staged as real files, so the build can't write through it", (t) => {
  const { root, pub, staged, run } = setup(t);
  const shared = path.join(root, "shared");
  fs.mkdirSync(path.join(shared, "deep"), { recursive: true });
  fs.writeFileSync(path.join(shared, "deep", "a.txt"), "a");
  fs.writeFileSync(path.join(root, "file.txt"), "f");
  fs.mkdirSync(pub);
  fs.symlinkSync(shared, path.join(pub, "guides"));
  fs.symlinkSync(shared, path.join(pub, "again")); // the same folder twice is fine
  fs.symlinkSync(path.join(root, "file.txt"), path.join(pub, "file.txt"));

  const r = run();
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(linksUnder(staged), []);
  assert.equal(fs.readFileSync(path.join(staged, "guides", "deep", "a.txt"), "utf8"), "a");
  assert.equal(fs.readFileSync(path.join(staged, "again", "deep", "a.txt"), "utf8"), "a");
  assert.equal(fs.readFileSync(path.join(staged, "file.txt"), "utf8"), "f");
});

test("dead and looping links are skipped with a warning, and the rest is staged", (t) => {
  const { pub, staged, run } = setup(t);
  fs.mkdirSync(pub);
  fs.writeFileSync(path.join(pub, "keep.txt"), "k");
  fs.symlinkSync("missing", path.join(pub, "dead"));
  fs.symlinkSync(".", path.join(pub, "self"));
  fs.symlinkSync("..", path.join(pub, "up"));
  fs.symlinkSync("../..", path.join(pub, "upper"));
  fs.mkdirSync(path.join(pub, "sub"));
  fs.symlinkSync("..", path.join(pub, "sub", "back"));

  const r = run();
  assert.equal(r.status, 0, r.stderr);
  for (const name of ["dead", "self", "up", "upper", "back"]) assert.match(r.stderr, new RegExp(name), name);
  assert.equal(fs.readFileSync(path.join(staged, "keep.txt"), "utf8"), "k");
  assert.deepEqual(fs.readdirSync(staged).sort(), ["keep.txt", "sub"]);
  assert.deepEqual(fs.readdirSync(path.join(staged, "sub")), []);
});

test("a public/ link to a folder holding the staged app, or to /, is refused", (t) => {
  const { site, pub, run } = setup(t);
  for (const target of [".", "..", "/"]) {
    fs.rmSync(pub, { force: true });
    fs.symlinkSync(target, pub);
    const r = run();
    assert.equal(r.status, 1, target);
    assert.match(r.stderr, /public/, target);
    assert.doesNotMatch(r.stderr, /ENAMETOOLONG|ELOOP/, target);
  }
  assert.deepEqual(fs.readdirSync(path.join(site, ".markline")).includes("public"), false);
});

test("staging replaces a read-only file and a file where a folder now is", (t) => {
  const { pub, staged, run } = setup(t);
  fs.mkdirSync(pub);
  fs.writeFileSync(path.join(pub, "ro.txt"), "one");
  fs.chmodSync(path.join(pub, "ro.txt"), 0o444);
  fs.writeFileSync(path.join(pub, "swap"), "file");
  assert.equal(run().status, 0);

  fs.chmodSync(path.join(pub, "ro.txt"), 0o644);
  fs.writeFileSync(path.join(pub, "ro.txt"), "two");
  fs.rmSync(path.join(pub, "swap"));
  fs.mkdirSync(path.join(pub, "swap"));
  fs.writeFileSync(path.join(pub, "swap", "in.txt"), "in");
  const r = run();
  assert.equal(r.status, 0, r.stderr);
  assert.equal(fs.readFileSync(path.join(staged, "ro.txt"), "utf8"), "two");
  assert.equal(fs.readFileSync(path.join(staged, "swap", "in.txt"), "utf8"), "in");
});

test("two links to one folder are both staged", (t) => {
  const { root, pub, staged, run } = setup(t);
  const assets = path.join(root, "assets");
  fs.mkdirSync(assets);
  fs.writeFileSync(path.join(assets, "logo.txt"), "logo");
  fs.mkdirSync(pub);
  fs.symlinkSync(assets, path.join(pub, "one"));
  fs.symlinkSync(assets, path.join(pub, "two"));
  const r = run();
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stderr, "");
  for (const name of ["one", "two"]) assert.equal(fs.readFileSync(path.join(staged, name, "logo.txt"), "utf8"), "logo");
});

test("links that fan out stop at a fixed number of copies", (t) => {
  const { root, pub, staged, run } = setup(t);
  // Each level links twice to the next, which would double the copy per level.
  const levels = 13;
  for (let i = 0; i < levels; i++) {
    const dir = path.join(root, `level${i}`);
    fs.mkdirSync(dir);
    fs.writeFileSync(path.join(dir, "file.txt"), "x");
    if (i < levels - 1) {
      fs.symlinkSync(path.join(root, `level${i + 1}`), path.join(dir, "a"));
      fs.symlinkSync(path.join(root, `level${i + 1}`), path.join(dir, "b"));
    }
  }
  fs.symlinkSync(path.join(root, "level0"), pub);
  const r = run();
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stderr, /copied too many times/);
  const files = (fs.readdirSync(staged, { recursive: true, withFileTypes: true }) as fs.Dirent[]).filter((e) => e.isFile()).length;
  assert.ok(files <= levels * 8, `${files} files`);
  assert.ok(fs.existsSync(path.join(staged, "a", "a", "file.txt")), "the first copies are there");
});

test("public/ can't link into the staged app", (t) => {
  const { site, pub, staged, run } = setup(t);
  assert.equal(run().status, 0); // stages the app
  const work = path.join(site, ".markline");
  fs.mkdirSync(pub);
  fs.writeFileSync(path.join(pub, "keep.txt"), "k");
  fs.mkdirSync(path.join(work, ".next", "server"), { recursive: true });
  fs.symlinkSync(path.join(work, ".next", "server"), path.join(pub, "built"));
  const r = run();
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stderr, /built/);
  assert.equal(fs.existsSync(path.join(staged, "built")), false);
  assert.equal(fs.readFileSync(path.join(staged, "keep.txt"), "utf8"), "k");

  fs.rmSync(pub, { recursive: true });
  fs.symlinkSync(path.join(work, ".next"), pub);
  const top = run();
  assert.equal(top.status, 1);
  assert.match(top.stderr, /holds the staged app/);
});

