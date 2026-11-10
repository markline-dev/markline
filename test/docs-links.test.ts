import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// Linked docs and nav links to index pages, in the app and in the build script.

const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "markline-links-")));
const site = path.join(root, "site");
const docs = path.join(site, "docs");
fs.mkdirSync(path.join(docs, "guides"), { recursive: true });
fs.mkdirSync(path.join(root, "shared", "dir"), { recursive: true });
const page = (title: string) => `---\ntitle: ${title}\n---\n\nbody\n`;
fs.writeFileSync(path.join(docs, "index.mdx"), page("Home"));
fs.writeFileSync(path.join(docs, "guides", "index.mdx"), page("Guides"));
fs.writeFileSync(path.join(root, "shared", "linked.mdx"), page("Linked file"));
fs.writeFileSync(path.join(root, "shared", "dir", "inner.mdx"), page("Linked folder"));
fs.symlinkSync(path.join(root, "shared", "linked.mdx"), path.join(docs, "linked.mdx"));
fs.symlinkSync(path.join(root, "shared", "dir"), path.join(docs, "linkdir"));
fs.symlinkSync(path.join(root, "missing.mdx"), path.join(docs, "dead.mdx"));
fs.symlinkSync("..", path.join(docs, "guides", "up"));
fs.writeFileSync(
  path.join(site, "markline.json"),
  JSON.stringify({
    name: "t",
    navigation: { tabs: [{ label: "Docs", href: "/index", groups: [{ group: "G", pages: [{ href: "/guides/index", label: "Guides" }, { href: "/gone", label: "Gone" }, { href: "/linked", pages: [{ href: "/linkdir/inner" }] }] }] }] },
  }),
);
process.env.MARKLINE_CONTENT = site;
test.after(() => fs.rmSync(root, { recursive: true, force: true }));

test("linked pages are found, and dead or looping links don't break the walk", async () => {
  const { listDocs } = await import("../lib/docs");
  assert.deepEqual(listDocs().map((d) => d.pathname).sort(), ["/", "/guides", "/linkdir/inner", "/linked"]);
});

test("nav links to an index page mean the folder", async () => {
  const { loadConfig, normalizeNavHrefs } = await import("../lib/config");
  const [tab] = loadConfig().navigation.tabs;
  assert.equal(tab.href, "/");
  assert.equal((tab.groups?.[0].pages[0] as { href: string }).href, "/guides");
  assert.deepEqual(normalizeNavHrefs({ href: "/v2.0/index", other: "/x/index" }), { href: "/v2.0", other: "/x/index" });
  assert.deepEqual(normalizeNavHrefs({ href: "/reindex" }), { href: "/reindex" });
});

test("the build script agrees, and warns about a nav link to no page", () => {
  const cwd = path.join(root, "build");
  fs.mkdirSync(path.join(cwd, "public"), { recursive: true });
  const script = path.join(import.meta.dirname, "..", "scripts", "build-search.mjs");
  const r = spawnSync(process.execPath, [script], { cwd, encoding: "utf8", env: { ...process.env, MARKLINE_CONTENT: site, NODE_TEST_CONTEXT: "" } });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stderr + r.stdout, /navigation links to \/gone/);
  assert.doesNotMatch(r.stderr + r.stdout, /navigation links to \/(linked|guides|linkdir)/);
  const full = fs.readFileSync(path.join(cwd, "public", "llms-full.txt"), "utf8");
  assert.match(full, /Linked file/);
  assert.match(full, /Linked folder/);
  const index = fs.readFileSync(path.join(cwd, "public", "llms.txt"), "utf8");
  assert.match(index, /\(\/guides\)|\/guides\)/);
  assert.doesNotMatch(index, /guides\/index/);
});
