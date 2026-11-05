import { test } from "node:test";
import assert from "node:assert/strict";
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
  for (const value of ["..", "../out", "../../elsewhere", "/tmp/elsewhere", ".", "./", "a/../..", "/project"]) {
    assert.throws(() => safeDistDir(value, cwd), /MARKLINE_DIST/, value);
  }
});
