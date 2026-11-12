import { test } from "node:test";
import assert from "node:assert/strict";
import { siteOpenGraph, siteTwitter } from "../lib/site-meta";

// The site-level fields every page's Open Graph and Twitter tags start from.

test("the site's name and default image", () => {
  assert.deepEqual(siteOpenGraph({ name: "Acme Docs", seo: {} }), { siteName: "Acme Docs" });
  assert.deepEqual(siteOpenGraph({ name: "Acme Docs", seo: { siteName: "Acme", ogImage: "/og.png" } }), { siteName: "Acme", images: ["/og.png"] });
  assert.deepEqual(siteTwitter({ name: "x", seo: { ogImage: "/og.png" } }), { card: "summary_large_image", images: ["/og.png"] });
  assert.deepEqual(siteTwitter({ name: "x", seo: {} }), { card: "summary_large_image" });
});
