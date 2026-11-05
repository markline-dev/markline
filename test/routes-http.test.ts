import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { createSite } from "./site-server";

// The .md and llms.txt routes over HTTP: a real `markline dev` on a small site.

const site = createSite();
let base = "";

/** A raw path, so nothing tidies away a `..`. */
const get = (p: string) => fetch(base + p);

before(async () => {
  base = await site.serve("dev", "/api/llms/guides");
});

after(() => site.destroy());

test("a page's .md is its Markdown, without comments", async () => {
  const res = await get("/guides/a.md");
  assert.equal(res.status, 200);
  assert.match(res.headers.get("content-type") ?? "", /text\/markdown/);
  assert.equal(await res.text(), "# Guide\n\nguide text\n");
  assert.equal((await get("/index.md")).status, 200);
});

test("a section's llms.txt lists its pages", async () => {
  const res = await get("/guides/llms.txt");
  assert.equal(res.status, 200);
  assert.match(await res.text(), /\[Guide\]\(\/guides\/a\)/);
});

test("unknown URLs are a 404 that isn't cached", async () => {
  for (const p of ["/nope.md", "/nope/llms.txt", "/api/md/nope", "/api/llms/nope"]) {
    const res = await get(p);
    assert.equal(res.status, 404, p);
    assert.doesNotMatch(res.headers.get("cache-control") ?? "", /s-maxage/, p);
  }
});

test("a changelog with entries has no intro-only .md", async () => {
  assert.equal((await get("/changelog.md")).status, 404);
});

test("no path reaches a file outside docs/", async () => {
  const paths = [
    "/..%2fprivate.md",
    "/%2e%2e%2fprivate.md",
    "/..%2f..%2foutside.md",
    "/guides/..%2f..%2fprivate.md",
    "/..%5cprivate.md",
    "/api/md/..%2fprivate",
    "/api/md/%2e%2e%2fprivate",
    "/api/md/..%2f..%2foutside",
    "/api/md/guides/..%2f..%2fprivate",
  ];
  for (const p of paths) {
    const res = await get(p);
    assert.equal(res.status, 404, p);
    assert.doesNotMatch(await res.text(), /CANARY/, p);
  }
});
