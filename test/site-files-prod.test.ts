import { after, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createSite } from "./site-server";

// A site's own llms.txt, llms-full.txt, robots.txt and sitemap.xml are what it
// serves, however it's built: they're never replaced by the generated ones.

const skip = process.platform === "win32" ? "builds are slow on Windows CI" : false;

const OWN: Record<string, string> = {
  "robots.txt": "User-agent: *\nDisallow: /drafts\n",
  "llms.txt": "# t\n\nOur own index for agents.\n",
  "llms-full.txt": "# t\n\nEverything, written by hand.\n",
  "sitemap.xml": '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>https://docs.example.com/only</loc></url></urlset>\n',
};

/** A site set to write a sitemap, with its own copy of each file named. */
function siteWith(own: string[]) {
  const site = createSite();
  fs.writeFileSync(path.join(site.dir, "markline.json"), JSON.stringify({ name: "t", seo: { metadataBase: "https://docs.example.com" } }));
  fs.mkdirSync(path.join(site.dir, "public"), { recursive: true });
  for (const name of own) fs.writeFileSync(path.join(site.dir, "public", name), OWN[name]);
  return site;
}

const sites: ReturnType<typeof createSite>[] = [];
after(() => Promise.all(sites.map((s) => s.destroy())));

test("markline start serves the site's own files, and replaces an older build's", { skip }, async () => {
  const site = siteWith(["robots.txt", "llms.txt", "sitemap.xml"]);
  sites.push(site);
  // From before these files were tracked: in the staged public/, with no record of them.
  const staged = path.join(site.dir, ".markline", "public");
  fs.mkdirSync(staged, { recursive: true });
  fs.writeFileSync(path.join(staged, "llms-full.txt"), "# t\n\n---\n\n# Stale page\n\nfrom 0.1.8\n");

  const out = site.build();
  for (const name of ["robots.txt", "llms.txt", "sitemap.xml"]) assert.match(out, new RegExp(`public/${name.replace(".", "\\.")} is the site's own`), name);
  assert.doesNotMatch(out, /llms-full\.txt is the site's own/);

  const base = await site.serve("start", "/");
  for (const name of ["robots.txt", "llms.txt", "sitemap.xml"]) {
    assert.equal(await (await fetch(`${base}/${name}`)).text(), OWN[name], name);
  }
  const full = await (await fetch(`${base}/llms-full.txt`)).text();
  assert.doesNotMatch(full, /Stale page/, "the old generated file is replaced");
  assert.match(full, /guide text/);
});

test("a static export keeps the site's own files, and generates them again once they're gone", { skip }, () => {
  const site = siteWith(Object.keys(OWN));
  sites.push(site);
  site.export();
  for (const [name, text] of Object.entries(OWN)) {
    assert.equal(fs.readFileSync(path.join(site.dir, "out", name), "utf8"), text, name);
  }

  fs.rmSync(path.join(site.dir, "public", "robots.txt"));
  site.export();
  assert.equal(fs.readFileSync(path.join(site.dir, "out", "robots.txt"), "utf8"), "User-agent: *\nAllow: /\n\nSitemap: https://docs.example.com/sitemap.xml\n");
  assert.equal(fs.readFileSync(path.join(site.dir, "out", "llms.txt"), "utf8"), OWN["llms.txt"], "the others are still the site's");
});

test("markline dev serves the site's own files", { skip }, async () => {
  const site = siteWith(["robots.txt", "llms.txt"]);
  sites.push(site);
  site.build(); // an earlier build, whose generated files dev mustn't serve
  const base = await site.serve("dev", "/robots.txt");
  for (const name of ["robots.txt", "llms.txt"]) {
    assert.equal(await (await fetch(`${base}/${name}`)).text(), OWN[name], name);
  }
});

test("copying a generated file into public/ to edit it keeps it, then and on later builds", { skip }, () => {
  const site = siteWith([]);
  sites.push(site);
  site.export();
  // "Start customising": take our files as the starting point.
  for (const f of ["robots.txt", "sitemap.xml", path.join("guides", "a.md")]) {
    fs.mkdirSync(path.dirname(path.join(site.dir, "public", f)), { recursive: true });
    fs.copyFileSync(path.join(site.dir, "out", f), path.join(site.dir, "public", f));
  }
  const copies = Object.fromEntries(["robots.txt", "sitemap.xml", path.join("guides", "a.md")].map((f) => [f, fs.readFileSync(path.join(site.dir, "public", f), "utf8")]));
  for (let i = 0; i < 2; i++) {
    site.export();
    for (const [f, text] of Object.entries(copies)) {
      assert.equal(fs.readFileSync(path.join(site.dir, "out", f), "utf8"), text, `${f}, export ${i + 2}`);
    }
  }
});

test("a generated sitemap goes once there's no site URL to make one", { skip }, () => {
  const site = siteWith([]);
  sites.push(site);
  site.export();
  assert.ok(fs.existsSync(path.join(site.dir, "out", "sitemap.xml")));
  fs.writeFileSync(path.join(site.dir, "markline.json"), JSON.stringify({ name: "t" }));
  site.export();
  assert.ok(!fs.existsSync(path.join(site.dir, "out", "sitemap.xml")), "not in the export");
  assert.ok(!fs.existsSync(path.join(site.dir, ".markline", "public", "sitemap.xml")), "nor left in the staged public/");
  assert.equal(fs.readFileSync(path.join(site.dir, "out", "robots.txt"), "utf8"), "User-agent: *\nAllow: /\n", "robots.txt no longer names it");
});
