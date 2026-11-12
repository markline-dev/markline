import { after, test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { createSite } from "./site-server";

// A static export refuses pages whose names would replace a file it serves, and
// says which; a server build, where there's no such clash, goes ahead.

const skip = process.platform === "win32" ? "builds are slow on Windows CI" : false;
const site = createSite();
after(() => site.destroy());

const page = (title: string) => `---\ntitle: ${title}\n---\n\ntext\n`;

test("export names every page that would replace a served .txt file; build doesn't mind", { skip }, () => {
  fs.writeFileSync(path.join(site.dir, "docs", "llms.mdx"), page("LLMs"));
  fs.writeFileSync(path.join(site.dir, "docs", "Robots.mdx"), page("Robots"));
  fs.writeFileSync(path.join(site.dir, "docs", "guides", "llms.mdx"), page("Guide LLMs"));
  fs.writeFileSync(path.join(site.dir, "docs", "notes.mdx"), page("Notes"));
  fs.mkdirSync(path.join(site.dir, "public"), { recursive: true });
  fs.writeFileSync(path.join(site.dir, "public", "notes.txt"), "our notes\n");

  const cli = path.join(path.dirname(new URL(import.meta.url).pathname), "..", "bin", "markline.mjs");
  const { NODE_TEST_CONTEXT: _, MARKLINE_DIST: __, ...env } = process.env;
  const r = spawnSync(process.execPath, [cli, "export"], { cwd: site.dir, encoding: "utf8", env });
  assert.notEqual(r.status, 0, "export fails");
  const out = r.stdout + r.stderr;
  for (const [url, file] of [["/llms", "llms.txt"], ["/Robots", "robots.txt"], ["/guides/llms", "guides/llms.txt"], ["/notes", "notes.txt"]]) {
    assert.match(out, new RegExp(`a page at ${url} \\(docs/[^)]+\\) would replace ${file.replace(".", "\\.")}`), url);
  }
  assert.match(out, /Rename each page/);
  assert.ok(!fs.existsSync(path.join(site.dir, "out")), "nothing exported");

  site.build(); // the same pages are fine on a server
});
