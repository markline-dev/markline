import { after, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createSite } from "./site-server";

// A file deleted from the project's public/ stops being served after the next
// build (markline start) or restart (markline dev); the build's own files stay.

const skip = process.platform === "win32" ? "builds are slow on Windows CI" : false;
const sites: ReturnType<typeof createSite>[] = [];
after(() => Promise.all(sites.map((s) => s.destroy())));

function siteWith(files: string[]) {
  const site = createSite();
  sites.push(site);
  fs.mkdirSync(path.join(site.dir, "public"), { recursive: true });
  for (const f of files) fs.writeFileSync(path.join(site.dir, "public", f), `${f}\n`);
  return site;
}

test("markline start stops serving a file deleted from public/ after a rebuild", { skip }, async () => {
  const site = siteWith(["old.txt", "kept.txt"]);
  site.build();
  fs.rmSync(path.join(site.dir, "public", "old.txt"));
  site.build(); // a real rebuild: the standalone output is made again
  const base = await site.serve("start", "/");
  assert.equal((await fetch(`${base}/old.txt`)).status, 404);
  assert.equal(await (await fetch(`${base}/kept.txt`)).text(), "kept.txt\n");
  assert.equal((await fetch(`${base}/llms.txt`)).status, 200, "generated files stay");
  assert.ok(fs.existsSync(path.join(site.dir, ".markline", "public", "pagefind")), "so does the search index");
  assert.equal((await fetch(`${base}/pagefind/pagefind.js`)).status, 200);
});

test("markline dev stops serving it after a restart", { skip }, async () => {
  const site = siteWith(["old.txt"]);
  site.build(); // an earlier build, as a site would have
  fs.rmSync(path.join(site.dir, "public", "old.txt"));
  const base = await site.serve("dev", "/");
  assert.equal((await fetch(`${base}/old.txt`)).status, 404);
  assert.ok(fs.existsSync(path.join(site.dir, ".markline", "public", "pagefind")), "the search index from the last build stays");
});
