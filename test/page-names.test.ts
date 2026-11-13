import { test } from "node:test";
import assert from "node:assert/strict";
import { pageSlug } from "../lib/paths";
import { hrefAsPath, pathHref } from "../scripts/url-path.mjs";

// Pages whose file names have spaces or accents: the slug a page route gets,
// and the links to them.

test("a page route's slug is decoded and NFC-normalised", () => {
  assert.deepEqual(pageSlug(["Getting%20Started"]), ["Getting Started"]);
  assert.deepEqual(pageSlug(["caf%C3%A9"]), ["café"]);
  assert.deepEqual(pageSlug(["cafe%CC%81"]), ["café"], "decomposed é is the same page");
  assert.deepEqual(pageSlug(["guides", "a"]), ["guides", "a"]);
  assert.deepEqual(pageSlug(["a%252F"]), ["a%2F"], "decoded once: a literal %2F stays a name");
  assert.equal(pageSlug(undefined), undefined);
});

test("an encoded dot segment, slash or null is still no page", () => {
  for (const bad of [["%2e%2e"], ["%2E"], ["guides%2F..%2Fprivate"], ["..%2fprivate"], ["a%5Cb"], ["a%00"], ["%E0%A4%A"]]) {
    assert.equal(pageSlug(bad), null, bad.join("/"));
  }
});

test("links to such pages are encoded once", () => {
  assert.equal(pathHref("/Getting Started"), "/Getting%20Started");
  assert.equal(pathHref("/café"), "/caf%C3%A9");
  assert.equal(pathHref("/a%2F"), "/a%252F", "a literal % in a file's name is encoded, not decoded");
  assert.equal(pathHref("/x%41"), "/x%2541");
  assert.equal(pathHref("/café"), "/caf%C3%A9", "decomposed, as NFC");
  assert.equal(pathHref("/a b?q=1 2#x y"), "/a%20b?q=1 2#x y", "only the path");
  for (const other of ["https://x.test/a b", "mailto:a@b.test", "#top", "//cdn.test/x", "", "relative/a b"]) assert.equal(pathHref(other), other);
});

test("an href an author wrote, plain or encoded, names the same page", () => {
  assert.equal(pathHref(hrefAsPath("/Getting Started")), "/Getting%20Started");
  assert.equal(pathHref(hrefAsPath("/Getting%20Started")), "/Getting%20Started");
  assert.equal(pathHref(hrefAsPath("/caf%C3%A9")), "/caf%C3%A9");
  assert.equal(pathHref(hrefAsPath("/a%252F")), "/a%252F", "a literal % written encoded");
  assert.equal(hrefAsPath("/bad%E0%A4%A"), "/bad%E0%A4%A", "a bad escape is kept as written");
  assert.equal(hrefAsPath("/a%20b#x%20y"), "/a b#x%20y", "only the path");
  assert.equal(hrefAsPath("https://x.test/a%20b"), "https://x.test/a%20b");
});
