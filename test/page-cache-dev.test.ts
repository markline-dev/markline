import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createSite } from "./site-server";

// Under `markline dev`: unknown URLs are a clean 404, on every start, and a new page
// works at once. Next's list of built pages varies between starts, which a single
// passing request wouldn't show, so each start checks several URLs.

const site = createSite();
let base = "";

before(async () => {
  base = await site.serve("dev", "/");
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
