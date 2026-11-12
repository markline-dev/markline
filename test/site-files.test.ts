import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { looksGenerated, siteFiles } from "../scripts/site-files.mjs";

// Which files in public/ are the site's own, so the build never writes over them.

test("files an older build wrote are recognised, and nothing else", () => {
  assert.ok(looksGenerated("robots.txt", "User-agent: *\nAllow: /\n", "Docs"));
  assert.ok(looksGenerated("robots.txt", "User-agent: *\nAllow: /\n\nSitemap: https://x.test/sitemap.xml\n", "Docs"));
  for (const own of [
    "User-agent: *\nDisallow: /private\n",
    "User-agent: *\nAllow: /\nDisallow: /drafts\n",
    "User-agent: GPTBot\nDisallow: /\n",
    "User-agent: *\nAllow: /\n# ours\n",
  ]) assert.ok(!looksGenerated("robots.txt", own, "Docs"), own);

  const sitemap = (urls: string[]) =>
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map((u) => `  <url>\n    <loc>${u}</loc>\n    <changefreq>weekly</changefreq>\n  </url>\n`).join("")}</urlset>\n`;
  assert.ok(looksGenerated("sitemap.xml", sitemap(["https://x.test/", "https://x.test/a"]), "Docs"));
  assert.ok(!looksGenerated("sitemap.xml", sitemap(["https://x.test/"]).replace("weekly", "daily"), "Docs"));
  assert.ok(!looksGenerated("sitemap.xml", sitemap(["https://x.test/"]).replace("</loc>", "</loc>\n    <priority>1</priority>"), "Docs"));

  const index = "# Docs\n\n> About\n\nThis index lists the documentation. The full text of every page concatenated into one file is available at [llms-full.txt](/llms-full.txt).\n\n## Guides\n";
  assert.ok(looksGenerated("llms.txt", index, "Docs"));
  assert.ok(looksGenerated("llms.txt", index.replace("> About\n\n", ""), "Docs"));
  assert.ok(!looksGenerated("llms.txt", index, "Other"), "another site's name");
  assert.ok(!looksGenerated("llms.txt", "# Docs\n\nOur own index for agents.\n", "Docs"));
  assert.ok(looksGenerated("llms-full.txt", "# Docs\n\n---\n\n# Intro\n\nText\n", "Docs"));
  assert.ok(!looksGenerated("llms-full.txt", "# Docs\n\nEverything, by hand.\n", "Docs"));
  assert.ok(!looksGenerated("guides.md", "# Guides\n", "Docs"), "only the four top-level files");
});

function dirs(t: { after: (fn: () => void) => void }) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "markline-own-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const app = path.join(root, "app", "public");
  const site = path.join(root, "site", "public");
  fs.mkdirSync(app, { recursive: true });
  fs.mkdirSync(site, { recursive: true });
  return { root, app, site };
}

test("with the CLI, only a file in the project's own public/ is the site's", (t) => {
  const { root, app, site } = dirs(t);
  fs.writeFileSync(path.join(app, "robots.txt"), "User-agent: *\nAllow: /\n"); // an earlier build's
  fs.writeFileSync(path.join(app, "llms.txt"), "# Docs\n\nhand-written, copied in\n");
  fs.writeFileSync(path.join(site, "llms.txt"), "# Docs\n\nhand-written, copied in\n");
  const owns = siteFiles({ appPublic: app, sitePublic: site, name: "Docs" });
  assert.equal(owns("robots.txt"), false, "a leftover in the staged copy isn't the site's");
  assert.equal(owns("llms.txt"), true);
  assert.equal(owns("sitemap.xml"), false);
  const none = siteFiles({ appPublic: app, sitePublic: path.join(root, "nowhere"), name: "Docs" });
  assert.equal(none("llms.txt"), false, "no public/ means no files of its own");
});

test("without the CLI, a file there is the site's unless an older build wrote it", (t) => {
  const { app } = dirs(t);
  fs.writeFileSync(path.join(app, "robots.txt"), "User-agent: *\nAllow: /\n");
  fs.writeFileSync(path.join(app, "llms.txt"), "# Docs\n\nOur own.\n");
  fs.mkdirSync(path.join(app, "guides"));
  fs.writeFileSync(path.join(app, "guides.md"), "# Guides\n");
  const owns = siteFiles({ appPublic: app, name: "Docs" });
  assert.equal(owns("robots.txt"), false);
  assert.equal(owns("llms.txt"), true);
  assert.equal(owns("guides.md"), true);
  assert.equal(owns("sitemap.xml"), false);
});
