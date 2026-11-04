import { test } from "node:test";
import assert from "node:assert/strict";
import { fontLinks } from "../lib/font-urls.ts";

test("Google Fonts gets its stylesheet and both preconnects", () => {
  const g = "https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@300..700&display=swap";
  assert.deepEqual(fontLinks(g), {
    sheets: [g],
    origins: ["https://fonts.googleapis.com", "https://fonts.gstatic.com"],
  });
});

test("several URLs, site paths and basePath; junk is dropped", () => {
  const r = fontLinks(["/fonts/brand.css", "https://api.fontshare.com/v2/css?f[]=satoshi@400", "/fonts/brand.css", "http://insecure.example/x.css", "javascript:alert(1)", "//cdn.example/x.css", ""], "/docs");
  assert.deepEqual(r.sheets, ["/docs/fonts/brand.css", "https://api.fontshare.com/v2/css?f[]=satoshi@400"]);
  assert.deepEqual(r.origins, ["https://api.fontshare.com"]);
  assert.deepEqual(fontLinks(undefined), { sheets: [], origins: [] });
});
