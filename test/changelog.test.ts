import { test } from "node:test";
import assert from "node:assert/strict";
import {
  dateFromSlug, entryDate, entryPath, formatDate, headingId, pageCount, pageFromSlug, pagePath,
} from "../lib/changelog-core.ts";

test("entryDate prefers frontmatter, falls back to the file name", () => {
  assert.equal(entryDate("2026-10-26", "whatever.mdx"), "2026-10-26");
  assert.equal(entryDate(new Date("2026-10-26T00:00:00Z"), "x.mdx"), "2026-10-26");
  assert.equal(entryDate(undefined, "2026-09-01.mdx"), "2026-09-01");
  assert.equal(entryDate("soon", "2026-09-01.mdx"), "2026-09-01");
  assert.equal(entryDate(undefined, "notes.mdx"), undefined);
  assert.equal(entryDate("2026-13-45", "notes.mdx"), undefined);
});

test("paths round-trip", () => {
  assert.equal(entryPath("2026-10-26"), "/changelog/2026/10/26");
  assert.equal(dateFromSlug(["changelog", "2026", "10", "26"]), "2026-10-26");
  assert.equal(dateFromSlug(["changelog", "page", "2"]), undefined);
  assert.equal(dateFromSlug(["docs", "2026", "10", "26"]), undefined);
  assert.equal(pageFromSlug(["changelog"]), 1);
  assert.equal(pageFromSlug(["changelog", "page", "3"]), 3);
  assert.equal(pageFromSlug(["changelog", "page", "0"]), undefined);
  assert.equal(pageFromSlug(["changelog", "intro"]), undefined);
  assert.equal(pagePath(1), "/changelog");
  assert.equal(pagePath(2), "/changelog/page/2");
});

test("paging, dates and heading ids", () => {
  assert.equal(pageCount(0), 1);
  assert.equal(pageCount(10), 1);
  assert.equal(pageCount(11), 2);
  assert.equal(formatDate("2026-10-26"), "October 26, 2026");
  assert.equal(formatDate("2026-01-01"), "January 1, 2026");
  assert.equal(headingId("2026-10-26", "all-changes"), "2026-10-26-all-changes");
});
