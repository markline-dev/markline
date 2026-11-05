import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

type Deps = {
  depsDir: (contentDir: string, appDir: string) => string | null;
  linkDeps: (link: string, deps: string | null) => void;
};

async function load(): Promise<Deps> {
  const modulePath = "../bin/deps.mjs";
  return (await import(modulePath)) as unknown as Deps;
}

function tmp(t: { after: (fn: () => void) => void }): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "markline-deps-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

/** A node_modules folder with `next` in it. */
function nodeModules(dir: string): string {
  const nm = path.join(dir, "node_modules");
  fs.mkdirSync(path.join(nm, "next"), { recursive: true });
  return nm;
}

test("the project's own next wins, else the checkout's, else none", async (t) => {
  const { depsDir } = await load();
  const root = tmp(t);
  const content = path.join(root, "site");
  const app = path.join(root, "markline");
  fs.mkdirSync(path.join(content, "node_modules"), { recursive: true });
  fs.mkdirSync(app);
  assert.equal(depsDir(content, app), null);
  const appDeps = nodeModules(app);
  assert.equal(depsDir(content, app), appDeps); // node_modules without next doesn't count
  const own = nodeModules(content);
  assert.equal(depsDir(content, app), own);
});

test("a link whose target is gone is replaced, not an EEXIST crash", async (t) => {
  const { linkDeps } = await load();
  const root = tmp(t);
  const deps = nodeModules(path.join(root, "markline"));
  const link = path.join(root, "link");
  fs.symlinkSync(path.join(root, "removed-worktree", "node_modules"), link);
  linkDeps(link, deps);
  assert.equal(fs.realpathSync(link), fs.realpathSync(deps));
});

test("a link left at another checkout moves to the right deps", async (t) => {
  const { linkDeps } = await load();
  const root = tmp(t);
  const old = nodeModules(path.join(root, "markline"));
  const own = nodeModules(path.join(root, "site"));
  const link = path.join(root, "link");
  fs.symlinkSync(old, link);
  linkDeps(link, own);
  assert.equal(fs.realpathSync(link), fs.realpathSync(own));
  assert.ok(fs.existsSync(old), "the old target itself is untouched");
});

test("a correct link stays, a new one is made, and a real folder is left alone", async (t) => {
  const { linkDeps } = await load();
  const root = tmp(t);
  const deps = nodeModules(path.join(root, "site"));
  const link = path.join(root, "link");
  linkDeps(link, deps);
  const before = fs.lstatSync(link).ino;
  linkDeps(link, deps);
  assert.equal(fs.lstatSync(link).ino, before);

  const real = path.join(root, "real");
  fs.mkdirSync(path.join(real, "keep"), { recursive: true });
  linkDeps(real, deps);
  assert.ok(fs.existsSync(path.join(real, "keep")));
  assert.equal(fs.lstatSync(real).isSymbolicLink(), false);
});

test("with no deps an old link is removed", async (t) => {
  const { linkDeps } = await load();
  const root = tmp(t);
  const link = path.join(root, "link");
  fs.symlinkSync(path.join(root, "gone"), link);
  linkDeps(link, null);
  assert.throws(() => fs.lstatSync(link));
  linkDeps(link, null); // nothing there: no-op
});
