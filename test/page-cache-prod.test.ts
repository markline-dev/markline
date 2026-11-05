import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createSite, filesUnder } from "./site-server";

// The docs page route in production, where Next's caching applies: `markline
// build` then `markline start`, which dev can't show.

// The build fetches the site's fonts from Google, so it can't run offline.
const online = await fetch("https://fonts.googleapis.com", { signal: AbortSignal.timeout(5000) }).then(
  () => true,
  () => false,
);
const skip = online ? false : "offline: the build needs to reach Google Fonts";

const site = createSite();
const noRoot = createSite();
let base = "";
let noRootBase = "";

const config = (first: string) =>
  JSON.stringify({ name: "Cache Test Site", navigation: { tabs: [{ label: "Docs", href: first, groups: [{ group: "G", pages: [{ href: first, label: "First" }] }] }] } });

before(async () => {
  if (skip) return;
  fs.writeFileSync(path.join(site.dir, "markline.json"), config("/"));
  for (let day = 10; day < 22; day++) {
    fs.writeFileSync(path.join(site.dir, "changelog", `2026-10-${day}.mdx`), `---\ntitle: Day ${day}\n---\n\nentry\n`);
  }
  site.build();
  base = await site.serve("start", "/");

  fs.writeFileSync(path.join(noRoot.dir, "markline.json"), config("/guides/a"));
  fs.rmSync(path.join(noRoot.dir, "docs", "index.mdx"));
  noRoot.build();
  noRootBase = await noRoot.serve("start", "/guides/a");
});

after(() => Promise.all([site.destroy(), noRoot.destroy()]));

test("pages from the build stay cached", { skip }, async () => {
  for (const url of ["/", "/guides/a", "/changelog", "/changelog/page/2", "/changelog/2026/10/15"]) {
    const res = await fetch(base + url);
    assert.equal(res.status, 200, url);
    assert.match(res.headers.get("cache-control") ?? "", /s-maxage/, url);
  }
});

test("unknown URLs write nothing and aren't cached", { skip }, async () => {
  const cache = path.join(site.dir, ".markline", ".next", "server", "app");
  const before = filesUnder(cache);
  const urls = Array.from({ length: 20 }, (_, i) => [`/nope${i}`, `/nope${i}/deep`]).flat();
  for (const url of [...urls, "/changelog/page/99", "/changelog/2030/01/01"]) {
    const res = await fetch(base + url);
    assert.equal(res.status, 404, url);
    assert.doesNotMatch(res.headers.get("cache-control") ?? "", /s-maxage/, url);
    await res.arrayBuffer();
  }
  assert.deepEqual(filesUnder(cache), before);
});

test("the 404 page has the site's header", { skip }, async () => {
  const body = await (await fetch(`${base}/nope`)).text();
  assert.match(body, /Cache Test Site/);
  assert.match(body, /<html/);
});

test("a page added after the build needs a rebuild", { skip }, async () => {
  fs.writeFileSync(path.join(site.dir, "docs", "later.mdx"), "---\ntitle: Later\n---\n\nlater\n");
  assert.equal((await fetch(`${base}/later`)).status, 404);
});

test("with no root page, / redirects to the first nav entry", { skip }, async () => {
  const res = await fetch(`${noRootBase}/`, { redirect: "manual" });
  assert.equal(res.status, 307);
  assert.equal(res.headers.get("location"), "/guides/a");
});
