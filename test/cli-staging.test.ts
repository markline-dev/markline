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
    root,
    app,
    site,
    work,
    outside,
    run: (command = "start", env: Record<string, string> = {}) =>
      spawnSync(process.execPath, [path.join(app, "bin", "markline.mjs"), command], { cwd: site, encoding: "utf8", env: { ...process.env, ...env } }),
  };
}

/** The real @next/env, which the CLI uses to read a project's .env files. */
function installNextEnv(app: string) {
  const to = path.join(app, "node_modules", "@next", "env");
  fs.mkdirSync(to, { recursive: true });
  fs.cpSync(path.join(import.meta.dirname, "..", "node_modules", "@next", "env"), to, { recursive: true, dereference: true });
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

test("a real node_modules is replaced by the link", (t) => {
  const { app, work, run } = setup(t);
  fs.mkdirSync(path.join(work, "node_modules", "pkg"), { recursive: true });
  fs.writeFileSync(path.join(work, "node_modules", "pkg", "index.js"), "old");
  const r = run();
  assert.equal(r.status, 0, r.stderr);
  assert.equal(fs.realpathSync(path.join(work, "node_modules")), path.join(app, "node_modules"));
});

test("anything else left in the staging folder is removed", (t) => {
  const { work, run } = setup(t);
  fs.mkdirSync(path.join(work, ".next"), { recursive: true });
  fs.writeFileSync(path.join(work, ".next", "BUILD_ID"), "id");
  fs.mkdirSync(path.join(work, "public"));
  fs.writeFileSync(path.join(work, "public", "built.txt"), "built");
  const leftovers = ["next.config.js", "postcss.config.js", "instrumentation.ts", "middleware.ts", "extra.txt"];
  for (const name of leftovers) fs.writeFileSync(path.join(work, name), "x");
  fs.mkdirSync(path.join(work, "pages"));
  const r = run();
  assert.equal(r.status, 0, r.stderr);
  for (const name of [...leftovers, "pages"]) {
    assert.equal(fs.lstatSync(path.join(work, name), { throwIfNoEntry: false }), undefined, name);
  }
  assert.equal(fs.readFileSync(path.join(work, ".next", "BUILD_ID"), "utf8"), "id");
  assert.equal(fs.readFileSync(path.join(work, "public", "built.txt"), "utf8"), "built");
  for (const name of [...leftovers, "pages"]) assert.match(r.stderr, new RegExp(name.replace(".", "\\.")), `the warning names ${name}`);
});

test("a file where the staging folder should be is refused clearly", (t) => {
  const { work, run } = setup(t);
  fs.writeFileSync(work, "x");
  const r = run();
  assert.equal(r.status, 1);
  assert.match(r.stderr, /\.markline is a file/);
  assert.doesNotMatch(r.stderr, /EEXIST/);
  assert.equal(fs.readFileSync(work, "utf8"), "x", "it isn't ours to delete");
});

test("a file named public is refused clearly, and leaves nothing behind", (t) => {
  const { site, work, run } = setup(t);
  fs.writeFileSync(path.join(site, "public"), "x");
  const r = run();
  assert.equal(r.status, 1);
  assert.match(r.stderr, /public is a file/);
  assert.doesNotMatch(r.stderr, /ENOTDIR/);

  // One staged by an older version doesn't get in the way once it's gone.
  fs.rmSync(path.join(site, "public"));
  fs.writeFileSync(path.join(work, "public"), "x");
  assert.equal(run().status, 0);
  assert.equal(fs.lstatSync(path.join(work, "public"), { throwIfNoEntry: false }), undefined);
});

test("env files in the staging folder are kept", (t) => {
  const { work, run } = setup(t);
  fs.mkdirSync(work);
  for (const name of [".env", ".env.local", ".env.production"]) fs.writeFileSync(path.join(work, name), "MARKLINE_AI_KEY=kept");
  const r = run();
  assert.equal(r.status, 0, r.stderr);
  for (const name of [".env", ".env.local", ".env.production"]) assert.equal(fs.readFileSync(path.join(work, name), "utf8"), "MARKLINE_AI_KEY=kept", name);
  assert.equal(r.stderr, "");
});

test("the GitHub stats cache in the staging folder survives runs", (t) => {
  const { work, run } = setup(t);
  fs.mkdirSync(work);
  fs.writeFileSync(path.join(work, ".markline-github.json"), '{"stars:o/r":{"value":5,"fetchedAt":1}}');
  for (let i = 0; i < 2; i++) assert.equal(run().status, 0);
  assert.equal(fs.readFileSync(path.join(work, ".markline-github.json"), "utf8"), '{"stars:o/r":{"value":5,"fetchedAt":1}}');
});

test("a configured output folder survives between runs, and its build's own links stay", (t) => {
  const { work, run } = setup(t);
  const env = { MARKLINE_DIST: ".next-x" };
  fs.mkdirSync(path.join(work, ".next-x", "standalone"), { recursive: true });
  fs.writeFileSync(path.join(work, ".next-x", "BUILD_ID"), "id");
  fs.symlinkSync("..", path.join(work, ".next-x", "standalone", "linked"));
  fs.symlinkSync("..", path.join(work, ".next-x", "planted"));
  const r = run("start", env);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(fs.readFileSync(path.join(work, ".next-x", "BUILD_ID"), "utf8"), "id");
  assert.ok(fs.lstatSync(path.join(work, ".next-x", "standalone", "linked")).isSymbolicLink());
  assert.equal(fs.lstatSync(path.join(work, ".next-x", "planted"), { throwIfNoEntry: false }), undefined);
  // Without the setting it's a leftover like any other.
  assert.equal(run("start").status, 0);
  assert.equal(fs.existsSync(path.join(work, ".next-x")), false);
});

test("an output folder can't be set from an env file", (t) => {
  const { app, site, work, run } = setup(t);
  installNextEnv(app);
  fs.writeFileSync(path.join(site, ".env.local"), "MARKLINE_DIST=.next-y\n");
  fs.mkdirSync(path.join(work, ".next-y"), { recursive: true });
  const r = run();
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stderr, /MARKLINE_DIST/);
  assert.equal(fs.existsSync(path.join(work, ".next-y")), false, "it's a leftover");
});

test("export reads a configured output folder", (t) => {
  const { app, site, run } = setup(t);
  fs.writeFileSync(
    path.join(app, "node_modules", "next", "dist", "bin", "next"),
    `const fs = require("node:fs"); fs.mkdirSync(process.env.MARKLINE_DIST, { recursive: true }); fs.writeFileSync(process.env.MARKLINE_DIST + "/index.html", "exported");`,
  );
  fs.mkdirSync(path.join(app, "scripts"));
  fs.writeFileSync(path.join(app, "scripts", "build-search.mjs"), "");
  const r = run("export", { MARKLINE_DIST: ".next-e" });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(fs.readFileSync(path.join(site, "out", "index.html"), "utf8"), "exported");
});

test("export fails rather than leaving an empty out/", (t) => {
  const { app, site, run } = setup(t);
  fs.mkdirSync(path.join(app, "scripts"));
  fs.writeFileSync(path.join(app, "scripts", "build-search.mjs"), "");
  const r = run("export");
  assert.equal(r.status, 1);
  assert.match(r.stderr, /no static site/i);
  assert.equal(fs.existsSync(path.join(site, "out")), false);
});

/** Has the fake next record the environment it was started with. */
function recordEnv(app: string, out: string) {
  installNextEnv(app);
  fs.writeFileSync(path.join(app, "node_modules", "next", "dist", "bin", "next"), `require("node:fs").writeFileSync(${JSON.stringify(out)}, JSON.stringify(process.env));`);
}

test("site settings in env files reach Next, and the shell's values win", (t) => {
  const { app, site, run, root } = setup(t);
  const out = path.join(root, "seen.json");
  recordEnv(app, out);
  fs.writeFileSync(path.join(site, ".env.local"), "MARKLINE_AI_KEY=from-local\nMARKLINE_SITE_URL=https://local.test\nNEXT_PUBLIC_THING=from-local\n");
  fs.writeFileSync(path.join(site, ".env"), "MARKLINE_AI_KEY=from-env\nMARKLINE_BASE_PATH=/from-env\n");
  const r = run("start", { MARKLINE_SITE_URL: "https://shell.test" });
  assert.equal(r.status, 0, r.stderr);
  const seen = JSON.parse(fs.readFileSync(out, "utf8"));
  assert.equal(seen.MARKLINE_AI_KEY, "from-local");
  assert.equal(seen.MARKLINE_SITE_URL, "https://shell.test");
  assert.equal(seen.MARKLINE_BASE_PATH, "/from-env");
  assert.equal(seen.NEXT_PUBLIC_THING, "from-local");
  assert.equal(seen.__NEXT_PROCESSED_ENV, "true", "Next doesn't load them again, unfiltered");
});

test("env files can't change how Markline or Node runs", (t) => {
  const { app, site, run, root } = setup(t);
  const out = path.join(root, "seen.json");
  recordEnv(app, out);
  const dangerous = {
    NODE_OPTIONS: "--require ./evil.cjs",
    NODE_PATH: "/evil",
    NODE_ENV: "development",
    PATH: "/evil",
    MARKLINE_DIST: "node_modules",
    MARKLINE_CONTENT: "/evil",
    MARKLINE_CONFIG: "/evil",
    MARKLINE_EXPORT: "1",
    __NEXT_PRIVATE_ORIGIN: "http://evil.test",
    __NEXT_PROCESSED_ENV: "",
    DYLD_INSERT_LIBRARIES: "/evil",
    LD_PRELOAD: "/evil",
  };
  const text = Object.entries(dangerous).map(([k, v]) => `${k}=${v}`).join("\n");
  fs.writeFileSync(path.join(site, ".env"), text);
  const before = { ...process.env };
  const r = run();
  assert.equal(r.status, 0, r.stderr);
  const seen = JSON.parse(fs.readFileSync(out, "utf8"));
  for (const name of Object.keys(dangerous)) {
    if (name === "__NEXT_PROCESSED_ENV") continue;
    if (name === "MARKLINE_CONTENT" || name === "MARKLINE_CONFIG") assert.notEqual(seen[name], "/evil", name);
    else assert.equal(seen[name], before[name], name);
  }
  assert.doesNotMatch(r.stderr, /--require|\/evil/, "values aren't printed");
  assert.match(r.stderr, /NODE_OPTIONS/, "the names are");
});

test("env files left in the staging folder still work, and the project's win", (t) => {
  const { app, site, work, run, root } = setup(t);
  const out = path.join(root, "seen.json");
  recordEnv(app, out);
  fs.mkdirSync(work);
  fs.writeFileSync(path.join(work, ".env.local"), "MARKLINE_AI_KEY=old-secret\nMARKLINE_SITE_URL=https://old.test\nNODE_OPTIONS=--require ./evil.cjs\n");
  fs.writeFileSync(path.join(site, ".env"), "MARKLINE_SITE_URL=https://project.test\n");
  const r = run();
  assert.equal(r.status, 0, r.stderr);
  const seen = JSON.parse(fs.readFileSync(out, "utf8"));
  assert.equal(seen.MARKLINE_AI_KEY, "old-secret");
  assert.equal(seen.MARKLINE_SITE_URL, "https://project.test");
  assert.equal(seen.NODE_OPTIONS, process.env.NODE_OPTIONS);
  assert.equal(r.stderr.match(/beside markline\.json/g)?.length, 1, "says so once");
  assert.doesNotMatch(r.stderr, /old-secret/);
});

test("no warning about env files when there's nothing to move", (t) => {
  const { app, site, run, root } = setup(t);
  recordEnv(app, path.join(root, "seen.json"));
  fs.writeFileSync(path.join(site, ".env"), "MARKLINE_SITE_URL=https://project.test\nDATABASE_URL=unrelated\n");
  const r = run();
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stderr, "");
});

test("init keeps an existing .gitignore", async (t) => {
  const modulePath = "../bin/scaffold.mjs";
  const { scaffold } = (await import(modulePath)) as unknown as { scaffold: (target: string, o: { initDir: string }) => void };
  const target = fs.mkdtempSync(path.join(os.tmpdir(), "markline-new-"));
  t.after(() => fs.rmSync(target, { recursive: true, force: true }));
  fs.writeFileSync(path.join(target, ".gitignore"), "mine\n");
  scaffold(target, { initDir: path.join(import.meta.dirname, "..", "templates", "init") });
  assert.equal(fs.readFileSync(path.join(target, ".gitignore"), "utf8"), "mine\n");
  assert.equal(fs.existsSync(path.join(target, "_gitignore")), false);
});

test("a new project gets a .gitignore that covers the staging folder", async (t) => {
  const modulePath = "../bin/scaffold.mjs";
  const { scaffold } = (await import(modulePath)) as unknown as { scaffold: (target: string, o: { initDir: string }) => void };
  const target = fs.mkdtempSync(path.join(os.tmpdir(), "markline-new-"));
  t.after(() => fs.rmSync(target, { recursive: true, force: true }));
  const initDir = path.join(import.meta.dirname, "..", "templates", "init");
  scaffold(path.join(target, "site"), { initDir });
  const names = fs.readdirSync(path.join(target, "site"));
  assert.ok(names.includes(".gitignore"));
  assert.ok(!names.includes("_gitignore"));
  assert.match(fs.readFileSync(path.join(target, "site", ".gitignore"), "utf8"), /^\/?\.markline\/?$/m);
  const listed = spawnSync("npm", ["pack", "--dry-run", "--json", "--ignore-scripts"], { cwd: path.join(import.meta.dirname, ".."), encoding: "utf8" });
  const files = (JSON.parse(listed.stdout) as { files: { path: string }[] }[])[0].files.map((f) => f.path);
  assert.ok(files.includes("templates/init/_gitignore"), "it's in the published package");
});
