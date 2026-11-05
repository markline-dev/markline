import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { createSite, filesUnder } from "./site-server";

// The same routes in production, where Next's caching applies: `markline build`
// then `markline start`, which dev can't show.

// The build fetches the site's fonts from Google, so it can't run offline.
const online = await fetch("https://fonts.googleapis.com", { signal: AbortSignal.timeout(5000) }).then(
  () => true,
  () => false,
);
const skip = online ? false : "offline: the build needs to reach Google Fonts";

const site = createSite();
let base = "";

before(async () => {
  if (skip) return;
  site.build();
  base = await site.serve("start", "/");
});

after(() => site.destroy());

test("built pages and sections are served", { skip }, async () => {
  const page = await fetch(`${base}/guides/a.md`);
  assert.equal(page.status, 200);
  assert.equal(await page.text(), "# Guide\n\nguide text\n");
  assert.equal((await fetch(`${base}/guides/llms.txt`)).status, 200);
});

test("unknown URLs write nothing and aren't cached", { skip }, async () => {
  const cache = path.join(site.dir, ".markline", ".next", "server", "app");
  const before = filesUnder(cache);
  const urls = Array.from({ length: 10 }, (_, i) => [`/nope${i}/page.md`, `/nope${i}/llms.txt`, `/api/md/nope${i}`, `/api/llms/nope${i}`]).flat();
  for (const url of urls) {
    const res = await fetch(base + url);
    assert.equal(res.status, 404, url);
    assert.doesNotMatch(res.headers.get("cache-control") ?? "", /s-maxage/, url);
    await res.arrayBuffer();
  }
  assert.deepEqual(filesUnder(cache), before);
});

test("no path reaches a file outside docs/", { skip }, async () => {
  for (const p of ["/..%2fprivate.md", "/..%2f..%2foutside.md", "/api/md/..%2fprivate", "/api/md/..%2f..%2foutside"]) {
    const res = await fetch(base + p);
    assert.equal(res.status, 404, p);
    assert.doesNotMatch(await res.text(), /CANARY/, p);
  }
});
