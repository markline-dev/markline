import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { NOT_FOUND_SEGMENT } from "../lib/not-found-segment";
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
  fs.mkdirSync(path.join(site.dir, "api"));
  fs.writeFileSync(
    path.join(site.dir, "api", "openapi.json"),
    JSON.stringify({ openapi: "3.0.3", info: { title: "T", version: "1" }, tags: [{ name: "Things" }], paths: { "/things": { get: { tags: ["Things"], operationId: "listThings", summary: "List", responses: { "200": { description: "ok" } } } } } }),
  );
  fs.writeFileSync(path.join(site.dir, "docs", `${NOT_FOUND_SEGMENT}.mdx`), "---\ntitle: Hidden page\n---\n\nHidden page\n");
  fs.writeFileSync(
    path.join(site.dir, "docs", "commands.mdx"),
    [
      "---\ntitle: Commands\ntoc: steps\n---\n",
      "## Volumes\n\ntext\n\n### `create <volume>`\n\ntext\n\n### `get <name>` / `delete <name>`\n\ntext\n",
      // Repeats: of a heading, round a heading's own suffixed slug, in a hidden tab, and of a step.
      "## Verify\n\na\n\n## Verify\n\nb\n\n## Verify 1\n\nc\n\n## 🚀\n\nd\n",
      '<Tabs>\n<Tab title="A">\n### Verify\n</Tab>\n<Tab title="B">\n### Verify\n</Tab>\n</Tabs>\n',
      '<Steps>\n<Step title="Verify">e</Step>\n<Step title="Verify">f</Step>\n</Steps>\n',
    ].join("\n"),
  );
  for (let day = 10; day < 22; day++) {
    fs.writeFileSync(path.join(site.dir, "changelog", `2026-10-${day}.mdx`), `---\ntitle: Day ${day}\n---\n\nentry\n\n## Fixes\n\na\n\n## Fixes\n\nb\n\n## 🚀\n\nc\n`);
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
  // A client navigation's response: Next streams the not-found as a payload.
  assert.doesNotMatch((await rawGet(base, "/%2e/dot8", { rsc: "1" })).cacheControl, /s-maxage/);
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

test("a page added after the build is served fresh, stores nothing, and goes when deleted", { skip }, async () => {
  const cache = path.join(site.dir, ".markline", ".next", "server", "app");
  const before = filesUnder(cache);
  const file = path.join(site.dir, "docs", "later.mdx");
  fs.writeFileSync(file, "---\ntitle: Later\n---\n\nfirst version\n");
  const first = await fetch(`${base}/later`);
  assert.equal(first.status, 200);
  assert.doesNotMatch(first.headers.get("cache-control") ?? "", /s-maxage/);
  assert.match(await first.text(), /first version/);
  fs.writeFileSync(file, "---\ntitle: Later\n---\n\nsecond version\n");
  assert.match(await (await fetch(`${base}/later`)).text(), /second version/);
  fs.rmSync(file);
  assert.equal((await fetch(`${base}/later`)).status, 404);
  assert.deepEqual(filesUnder(cache), before);
});

test("only real API reference paths are pages", { skip }, async () => {
  for (const url of ["/api-reference", "/api-reference/things", "/api-reference/listThings"]) {
    assert.equal((await fetch(base + url)).status, 200, url);
  }
  for (const url of ["/api-reference/things/extra", "/api-reference/listThings/a/b", "/api-reference/nope"]) {
    const res = await fetch(base + url);
    assert.equal(res.status, 404, url);
    assert.doesNotMatch(res.headers.get("cache-control") ?? "", /s-maxage/, url);
  }
});

/** Every "On this page" link in a built page lands on exactly one element, and no id repeats. */
async function tocLinks(url: string): Promise<string[]> {
  const html = await (await fetch(url)).text();
  const ids = [...html.matchAll(/ id="([^"]*)"/g)].map((m) => m[1]);
  const repeated = ids.filter((id, i) => ids.indexOf(id) !== i);
  assert.deepEqual(repeated, [], `ids repeat on ${url}`);
  assert.ok(!ids.includes(""), `an empty id on ${url}`);
  const links = [...html.matchAll(/href="#([^"]+)"/g)].map((m) => m[1]);
  for (const link of links) assert.ok(ids.includes(link), `#${link} has no element on ${url}`);
  return links;
}

test("every link in a built page's table of contents lands on its own heading", { skip }, async () => {
  const links = await tocLinks(`${base}/commands`);
  for (const id of ["create-volume", "get-name-delete-name", "verify", "verify-2", "verify-1", "verify-3", "step-verify", "step-verify-1"]) {
    assert.ok(links.includes(id), `#${id} isn't listed: ${links.join()}`);
  }
});

test("a changelog entry's repeated headings get their own ids", { skip }, async () => {
  const links = await tocLinks(`${base}/changelog`);
  assert.ok(links.includes("2026-10-21-fixes") && links.includes("2026-10-21-fixes-1"), links.join());
});

test("unknown URLs log nothing", { skip }, async () => {
  site.takeOutput();
  for (const url of ["/quiet-1", "/quiet/2", "/changelog/page/99", "/api-reference/quiet-3", "/favicon.ico"]) {
    const res = await fetch(base + url);
    assert.equal(res.status, 404, url);
    await res.arrayBuffer();
  }
  await new Promise((r) => setTimeout(r, 200));
  assert.equal(site.takeOutput().trim(), "");
});

test("Next still lets an unknown URL render per request", { skip }, async () => {
  // A 500 with DYNAMIC_SERVER_USAGE here means a Next upgrade has changed this: see
  // lib/not-found-segment.ts. A 404 with s-maxage means the route has gone static.
  // Checked on the site with no page of the internal path's name, as one would hide it.
  for (const url of [`${noRootBase}/render-per-request`, `${noRootBase}/api-reference/render-per-request`]) {
    const res = await fetch(url);
    assert.equal(res.status, 404, `Next no longer allows a per-request 404 at ${url}: see lib/not-found-segment.ts`);
    assert.doesNotMatch(res.headers.get("cache-control") ?? "", /s-maxage/, `404s are cacheable again at ${url}: see lib/not-found-segment.ts`);
  }
});

test("the internal not-found path is a plain 404, even with a page of that name", { skip }, async () => {
  for (const url of [`/${NOT_FOUND_SEGMENT}`, `/api-reference/${NOT_FOUND_SEGMENT}`]) {
    const res = await fetch(base + url);
    assert.equal(res.status, 404, url);
    assert.doesNotMatch(res.headers.get("cache-control") ?? "", /s-maxage/, url);
    assert.doesNotMatch(await res.text(), /Hidden page/, url);
  }
  const unknown = await (await fetch(`${base}/render-per-request`)).text();
  assert.match(unknown, /could not be found/);
  // A site with no page of that name never hears of it.
  const pub = path.join(noRoot.dir, ".markline", "public");
  for (const name of fs.readdirSync(pub, { recursive: true, withFileTypes: true }).filter((e) => e.isFile() && /\.(txt|xml|json|md)$/.test(e.name))) {
    assert.doesNotMatch(fs.readFileSync(path.join(name.parentPath, name.name), "utf8"), new RegExp(NOT_FOUND_SEGMENT), name.name);
  }
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
  assert.deepEqual(filesUnder(path.join(exported.dir, "out")).filter((f) => f.includes(NOT_FOUND_SEGMENT)), []);
});

