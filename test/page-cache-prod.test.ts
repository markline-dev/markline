import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
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
const exported = createSite();
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

after(() => Promise.all([site.destroy(), noRoot.destroy(), exported.destroy()]));

test("pages from the build stay cached", { skip }, async () => {
  for (const url of ["/", "/guides/a", "/changelog", "/changelog/page/1", "/changelog/page/2", "/changelog/2026/10/15"]) {
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

/** A request with its path exactly as written: fetch would tidy up dot segments. */
const rawGet = (url: string, path: string, headers: Record<string, string> = {}) =>
  new Promise<{ status: number; cacheControl: string }>((resolve, reject) => {
    const { hostname, port } = new URL(url);
    const req = http.request({ hostname, port, path, headers }, (res) => {
      res.resume();
      res.on("end", () => resolve({ status: res.statusCode ?? 0, cacheControl: res.headers["cache-control"] ?? "" }));
    });
    req.on("error", reject);
    req.end();
  });

test("paths with dot segments write nothing, and later requests stay 404", { skip }, async () => {
  const cache = path.join(site.dir, ".markline", ".next", "server", "app");
  const before = filesUnder(cache);
  const paths = ["/%2e/dot1", "/../dot2", "/./dot3", "/%2e%2e/dot4", "/foo/%2e%2e/dot5", "/%2e/guides/dot6", "/%2E/dot7"];
  for (const p of paths) {
    const { status, cacheControl } = await rawGet(base, p);
    assert.equal(status, 404, p);
    assert.doesNotMatch(cacheControl, /s-maxage/, p);
  }
  assert.equal((await rawGet(base, "/%2e/dot8", { rsc: "1" })).status, 404);
  assert.deepEqual(filesUnder(cache), before);
  for (const p of ["/dot1", "/dot2", "/dot3", "/dot4", "/dot5", "/guides/dot6", "/dot7", "/dot8"]) {
    const { status, cacheControl } = await rawGet(base, p);
    assert.equal(status, 404, p);
    assert.doesNotMatch(cacheControl, /s-maxage/, p);
  }
  assert.equal((await rawGet(base, "/guides/a")).status, 200);
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

test("a static export with no root page keeps a public/index.html", { skip }, () => {
  fs.writeFileSync(path.join(exported.dir, "markline.json"), config("/guides/a"));
  fs.rmSync(path.join(exported.dir, "docs", "index.mdx"));
  fs.mkdirSync(path.join(exported.dir, "public"));
  fs.writeFileSync(path.join(exported.dir, "public", "index.html"), "the site's own");
  exported.export();
  assert.equal(fs.readFileSync(path.join(exported.dir, "out", "index.html"), "utf8"), "the site's own");
});

