import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

type DistDir = { safeDistDir: (value: string | undefined, cwd: string) => string | undefined };

async function load(): Promise<DistDir> {
  const modulePath = "../scripts/dist-dir.mjs";
  return (await import(modulePath)) as unknown as DistDir;
}

test("an output folder inside the app folder is fine", async () => {
  const { safeDistDir } = await load();
  const cwd = path.resolve("/project/.markline");
  assert.equal(safeDistDir(undefined, cwd), undefined);
  assert.equal(safeDistDir("", cwd), undefined);
  assert.equal(safeDistDir(".next-x", cwd), ".next-x");
  assert.equal(safeDistDir("out/next", cwd), "out/next");
  assert.equal(safeDistDir(path.join(cwd, ".next-y"), cwd), path.join(cwd, ".next-y"));
});

test("one outside the app folder, or the folder itself, is refused", async () => {
  const { safeDistDir } = await load();
  const cwd = path.resolve("/project/.markline");
  for (const value of ["..", "../out", "../../elsewhere", "/tmp/elsewhere", ".", "./", "a/../..", "/project", "node_modules", "node_modules/react", ".next/node_modules/evil", "a/node_modules"]) {
    assert.throws(() => safeDistDir(value, cwd), /MARKLINE_DIST/, value);
  }
});

test("an output folder reached through a link is judged by where it leads", async (t) => {
  const { safeDistDir } = await load();
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "markline-dist-")));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const cwd = path.join(root, "app");
  const victim = path.join(root, "victim");
  fs.mkdirSync(path.join(cwd, ".next"), { recursive: true });
  fs.mkdirSync(victim);
  fs.mkdirSync(path.join(cwd, "real"));
  fs.symlinkSync(victim, path.join(cwd, "out-link"));
  fs.symlinkSync(victim, path.join(cwd, ".next", "evil"));
  fs.symlinkSync(path.join(cwd, "real"), path.join(cwd, "in-link"));
  fs.symlinkSync(path.join(root, "gone"), path.join(cwd, "dead"));
  for (const value of ["out-link", "out-link/sub", ".next/evil", ".next/evil/deeper", "dead"]) {
    assert.throws(() => safeDistDir(value, cwd), /MARKLINE_DIST/, value);
  }
  assert.equal(safeDistDir("in-link", cwd), "in-link");
  assert.equal(safeDistDir(".next-new/sub", cwd), ".next-new/sub");
});

