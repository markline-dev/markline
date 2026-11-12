import { test } from "node:test";
import assert from "node:assert/strict";
import { exportClashes, payloadFile } from "../scripts/export-names.mjs";

// Pages whose payload file would replace a .txt file a static export serves.

test("a page's payload is its URL plus .txt", () => {
  assert.equal(payloadFile("/"), "index.txt");
  assert.equal(payloadFile("/llms"), "llms.txt");
  assert.equal(payloadFile("/guides/llms"), "guides/llms.txt");
  assert.equal(payloadFile("/a/b/"), "a/b.txt");
});

const files = ["llms.txt", "llms-full.txt", "robots.txt", "guides/llms.txt", "notes.txt"];

test("pages named like a served file clash, ignoring case and URL encoding", () => {
  const pages = [
    { url: "/llms", source: "docs/llms.mdx" },
    { url: "/Robots", source: "docs/Robots.mdx" },
    { url: "/%6C%6Cms-full" },
    { url: "/guides/llms", source: "docs/guides/llms.mdx" },
    { url: "/notes" },
    { url: "/guides/a" },
    { url: "/llms-guide" },
    { url: "/" },
  ];
  assert.deepEqual(
    exportClashes(pages, files).map((c) => [c.url, c.file]),
    [["/llms", "llms.txt"], ["/Robots", "robots.txt"], ["/%6C%6Cms-full", "llms-full.txt"], ["/guides/llms", "guides/llms.txt"], ["/notes", "notes.txt"]],
  );
});

test("a bad percent-encoding is compared as written, not thrown", () => {
  assert.deepEqual(exportClashes([{ url: "/%E0%A4%A" }], ["%e0%a4%a.txt"]).length, 1);
});

test("the changelog's page size matches the app's", async () => {
  const { CHANGELOG_PER_PAGE } = await import("../scripts/export-names.mjs");
  const { PER_PAGE } = await import("../lib/changelog-core");
  assert.equal(CHANGELOG_PER_PAGE, PER_PAGE);
});
