import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createSite } from "./site-server";

// Under `markline dev`: unknown URLs are a clean 404, on every start, and a new page
// works at once. Next's list of built pages varies between starts, which a single
// passing request wouldn't show, so each start checks several URLs.
//
// The dev server compiles a route on its first request: the API reference's
// takes ~10s on a busy machine. before() has no time limit, so it starts the
// server and opens a real reference page; each test's limit then covers only
// what it checks, not compiling.

const site = createSite();
let base = "";

before(async () => {
  fs.mkdirSync(path.join(site.dir, "api"), { recursive: true });
  fs.writeFileSync(
    path.join(site.dir, "api", "openapi.json"),
    JSON.stringify({
      openapi: "3.1.0",
      info: { title: "T", version: "1" },
      paths: { "/things": { get: { operationId: "listThings", summary: "List things", responses: { "200": { description: "OK" } } } } },
    }),
  );
  base = await site.serve("dev", "/");
  // On a very busy machine the first compile can outlast fetch's 5 minutes of
  // waiting for a response; asking again finds it compiled.
  let res: Response | undefined;
  for (let i = 1; !res; i++) {
    try {
      res = await fetch(`${base}/api-reference/listThings`);
    } catch (e) {
      if (i === 3) throw e;
    }
  }
  assert.equal(res.status, 200, "a real reference page, so its route is compiled");
  await res.arrayBuffer();
});

after(() => site.destroy());

test("unknown URLs are a 404 with nothing logged", { timeout: 60_000 }, async () => {
  site.takeOutput();
  for (const url of ["/nope", "/favicon.ico", "/nope/deep", "/changelog/page/99", "/api-reference/nope"]) {
    const res = await fetch(base + url);
    assert.equal(res.status, 404, url);
    await res.arrayBuffer();
  }
  await new Promise((r) => setTimeout(r, 200));
  assert.doesNotMatch(site.takeOutput(), /NoFallbackError|⨯|Error:/);
});

test("a page just added works on the first request", { timeout: 60_000 }, async () => {
  fs.writeFileSync(path.join(site.dir, "docs", "new-page.mdx"), "---\ntitle: New\n---\n\nnew text\n");
  const res = await fetch(`${base}/new-page`);
  assert.equal(res.status, 200);
  assert.match(await res.text(), /new text/);
});
