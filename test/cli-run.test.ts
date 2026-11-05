import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// Runs the real bin/markline.mjs against a fake `next` that records its argv,
// so these cover the CLI's wiring without building an app.

const BIN = path.join(import.meta.dirname, "..", "bin");

const FAKE_NEXT = `#!/usr/bin/env node
require("node:fs").appendFileSync(process.env.FAKE_NEXT_LOG, JSON.stringify({ bin: __filename, argv: process.argv.slice(2) }) + "\\n");
`;

function write(file: string, text: string) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
}

/** A package at `nm`/next whose bin is the fake. */
function installNext(nm: string) {
  write(path.join(nm, "next", "package.json"), '{"name":"next","version":"0.0.0"}');
  write(path.join(nm, "next", "dist", "bin", "next"), FAKE_NEXT);
}

/** The framework at `app`: the real CLI, and just enough for it to stage. */
function installApp(app: string) {
  fs.cpSync(BIN, path.join(app, "bin"), { recursive: true });
  write(path.join(app, "package.json"), '{"name":"@markline/markline","version":"0.0.0"}');
  write(path.join(app, "scripts", "build-search.mjs"), "");
}

function site(dir: string) {
  write(path.join(dir, "markline.json"), '{"name":"t"}');
}

function setup(t: { after: (fn: () => void) => void }) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "markline-cli-")));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const log = path.join(root, "next.log");
  const cli = (app: string, cwd: string, ...args: string[]) => {
    fs.rmSync(log, { force: true });
    const r = spawnSync(process.execPath, [path.join(app, "bin", "markline.mjs"), ...args], {
      cwd,
      encoding: "utf8",
      env: { ...process.env, FAKE_NEXT_LOG: log },
    });
    const runs = fs.existsSync(log)
      ? fs.readFileSync(log, "utf8").trim().split("\n").map((l) => JSON.parse(l) as { bin: string; argv: string[] })
      : [];
    return { status: r.status, stderr: r.stderr, runs };
  };
  return { root, cli };
}

/** A framework checkout beside a bare docs folder. */
function checkout(root: string) {
  const app = path.join(root, "markline");
  const docs = path.join(root, "site");
  installApp(app);
  installNext(path.join(app, "node_modules"));
  site(docs);
  return { app, docs, deps: path.join(app, "node_modules") };
}

const linked = (docs: string) => fs.realpathSync(path.join(docs, ".markline", "node_modules"));

test("dev, build and start forward their flags to next", (t) => {
  const { root, cli } = setup(t);
  const { app, docs } = checkout(root);
  for (const cmd of ["dev", "build", "start"]) {
    const { status, runs } = cli(app, docs, cmd, "-p", "3001", "--flag");
    assert.equal(status, 0, cmd);
    assert.deepEqual(runs.map((r) => r.argv), [[cmd, "-p", "3001", "--flag"]]);
  }
});

test("a bare folder runs on the checkout's deps", (t) => {
  const { root, cli } = setup(t);
  const { app, docs, deps } = checkout(root);
  const { runs } = cli(app, docs, "dev");
  assert.equal(linked(docs), deps);
  assert.ok(runs[0].bin.startsWith(deps));
});

test("a checkout's CLI keeps to its own deps when the folder has its own next", (t) => {
  const { root, cli } = setup(t);
  const { app, docs, deps } = checkout(root);
  installNext(path.join(docs, "node_modules"));
  const { status, runs } = cli(app, docs, "dev");
  assert.equal(status, 0);
  assert.equal(linked(docs), deps);
  assert.ok(runs[0].bin.startsWith(deps), "the bin and the link are the same install");
});

test("an installed CLI uses the project's hoisted deps", (t) => {
  const { root, cli } = setup(t);
  const project = path.join(root, "project");
  const nm = path.join(project, "node_modules");
  const app = path.join(nm, "@markline", "markline");
  installApp(app);
  installNext(nm);
  site(project);
  const { status, runs } = cli(app, project, "dev");
  assert.equal(status, 0);
  assert.equal(linked(project), nm);
  assert.ok(runs[0].bin.startsWith(nm));
});

test("a link to a removed checkout is replaced", (t) => {
  const { root, cli } = setup(t);
  const { app, docs, deps } = checkout(root);
  fs.mkdirSync(path.join(docs, ".markline"));
  fs.symlinkSync(path.join(root, "removed", "node_modules"), path.join(docs, ".markline", "node_modules"));
  const { status } = cli(app, docs, "dev");
  assert.equal(status, 0);
  assert.equal(linked(docs), deps);
});

test("a positional argument is refused before anything runs", (t) => {
  const { root, cli } = setup(t);
  const { app, docs } = checkout(root);
  for (const cmd of ["dev", "build", "start"]) {
    const { status, stderr, runs } = cli(app, docs, cmd, "./docs");
    assert.equal(status, 1, cmd);
    assert.match(stderr, /\.\/docs/);
    assert.deepEqual(runs, []);
  }
});

test("export warns about flags it can't use, and still builds", (t) => {
  const { root, cli } = setup(t);
  const { app, docs } = checkout(root);
  const { status, stderr, runs } = cli(app, docs, "export", "--bogus");
  assert.equal(status, 0);
  assert.match(stderr, /--bogus/);
  assert.deepEqual(runs.map((r) => r.argv), [["build"]]);
  assert.doesNotMatch(cli(app, docs, "export").stderr, /ignor/i);
});
