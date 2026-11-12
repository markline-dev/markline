import { test } from "node:test";
import assert from "node:assert/strict";
import { pageTitle, siteName } from "../lib/config";

// A page's tab title, which the layout follows with " · <site>".

const config = (seo: { title?: string; siteName?: string } = {}) => ({ name: "Acme Docs", seo });

test("the site's name is seo.siteName, else name", () => {
  assert.equal(siteName(config()), "Acme Docs");
  assert.equal(siteName(config({ siteName: "Acme" })), "Acme");
});

test("a page's title gets the site's name after it, unless it is the site's name", () => {
  assert.equal(pageTitle("Quickstart", config()), "Quickstart");
  assert.deepEqual(pageTitle("Acme Docs", config()), { absolute: "Acme Docs" });
  assert.deepEqual(pageTitle("Acme", config({ siteName: "Acme" })), { absolute: "Acme" });
  assert.deepEqual(pageTitle("Acme · The docs", config({ title: "Acme · The docs" })), { absolute: "Acme · The docs" });
  assert.equal(pageTitle(undefined, config()), undefined);
});
