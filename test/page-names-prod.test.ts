import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { createSite, filesUnder } from "./site-server";

// Pages whose file names have a space or an accent, on the Node server and in
// an export: they load, and every link to them is a correctly encoded URL.

const skip = process.platform === "win32" ? "builds are slow on Windows CI" : false;
const BASE = "https://docs.example.com";
const site = createSite();
let base = "";

before(async () => {
  if (skip) return;
  const page = (t: string) => `---\ntitle: ${t}\n---\n\n${t} body\n`;
  fs.writeFileSync(path.join(site.dir, "docs", "Getting Started.mdx"), page("Getting Started"));
  fs.writeFileSync(path.join(site.dir, "docs", "café.mdx"), page("Cafe"));
  // A literal % in a name, and a name saved decomposed (i + combining diaeresis).
  fs.writeFileSync(path.join(site.dir, "docs", "a%2F.mdx"), page("Percent"));
  fs.writeFileSync(path.join(site.dir, "docs", "x%41.mdx"), page("Hex"));
  fs.writeFileSync(path.join(site.dir, "docs", "nai\u0308ve.mdx"), page("Naive"));
  // Outside docs/: no URL may reach it.
  fs.writeFileSync(path.join(site.dir, "private.mdx"), "---\ntitle: Private\n---\n\nNOT-A-PAGE\n");
  fs.writeFileSync(
    path.join(site.dir, "markline.json"),
    JSON.stringify({
      name: "t",
      seo: { metadataBase: BASE },
      navigation: { tabs: [{ label: "Docs", href: "/", groups: [{ group: "G", pages: [
            { href: "/" },
            // Written as an author would: plain, or already encoded.
            { href: "/Getting Started" },
            { href: "/Getting%20Started", label: "Getting Started, encoded" },
            { href: "/café" },
            { href: "/a%252F" },
            { href: "/x%2541" },
            { href: "/naïve" },
            { href: "/guides/a" },
          ] }] }] },
    }),
  );
  site.build();
  base = await site.serve("start", "/");
});

after(() => site.destroy());

const get = (p: string) => fetch(base + p);
const NAMED = /Getting|caf|a%2F|x%41|na.?ve|ï/i;

test("the pages load, however the name is encoded", { skip }, async () => {
  for (const [p, body] of [["/Getting%20Started", "Getting Started body"], ["/caf%C3%A9", "Cafe body"], ["/cafe%CC%81", "Cafe body"]]) {
    const res = await get(p);
    assert.equal(res.status, 200, p);
    assert.match(await res.text(), new RegExp(body), p);
  }
});

test("an encoded dot segment or slash is still a 404, and reaches nothing outside docs/", { skip }, async () => {
  for (const p of ["/%2e%2e/private", "/%2E%2E/private", "/..%2fprivate", "/guides%2F..%2F..%2Fprivate", "/%2e%2e%2fprivate"]) {
    const res = await get(p);
    assert.equal(res.status, 404, p);
    assert.doesNotMatch(await res.text(), /NOT-A-PAGE/, p);
  }
});

/** Every link a check found, with no raw space or accent, each answering 200. */
async function resolves(where: string, links: string[]) {
  assert.ok(links.length > 0, `links to the pages in ${where}`);
  for (const link of links) {
    assert.doesNotMatch(link, /[\s\u0080-￿]/, `${where}: ${link} isn't encoded`);
    const res = await get(link.replace(BASE, ""));
    assert.equal(res.status, 200, `${where}: ${link}`);
  }
}

test("links in pages (sidebar, previous and next) are encoded and resolve", { skip }, async () => {
  const hrefs = new Set<string>();
  for (const p of ["/", "/Getting%20Started", "/caf%C3%A9", "/guides/a"]) {
    const html = await (await get(p)).text();
    for (const m of html.matchAll(/href="([^"]*)"/g)) if (NAMED.test(decodeURIComponent(m[1])) && !m[1].startsWith("http") && !m[1].includes("_next")) hrefs.add(m[1]);
  }
  for (const h of ["/Getting%20Started", "/caf%C3%A9", "/a%252F", "/x%2541", "/na%C3%AFve"]) assert.ok(hrefs.has(h), `${h} in ${[...hrefs].join()}`);
  assert.ok(![...hrefs].some((h) => h.includes("%2520") || h.includes("%25C3")), `nothing encoded twice: ${[...hrefs].join()}`);
  await resolves("pages", [...hrefs]);
});

test("the sitemap, llms.txt, .md files and search records name them encoded", { skip }, async () => {
  const sitemap = await (await get("/sitemap.xml")).text();
  await resolves("sitemap.xml", [...sitemap.matchAll(/<loc>([^<]*)<\/loc>/g)].map((m) => m[1]).filter((u) => NAMED.test(decodeURIComponent(u))));
  const llms = await (await get("/llms.txt")).text();
  await resolves("llms.txt", [...llms.matchAll(/\]\(([^)]*)\)/g)].map((m) => m[1]).filter((u) => NAMED.test(decodeURIComponent(u))));
  await resolves(".md", ["/Getting%20Started.md", "/caf%C3%A9.md"]);

  const fragments = filesUnder(path.join(site.dir, ".markline", "public", "pagefind", "fragment"));
  const urls = fragments
    .map((f) => {
      const raw = zlib.gunzipSync(fs.readFileSync(f)).toString("utf8");
      return JSON.parse(raw.slice(raw.indexOf("{"))).url as string;
    })
    .filter((u) => NAMED.test(decodeURIComponent(u)));
  await resolves("search records", urls);
});

test("a page named with a literal %, or saved decomposed, loads from the build at the URL its links use", { skip }, async () => {
  for (const [p, body] of [["/a%252F", "Percent body"], ["/x%2541", "Hex body"], ["/na%C3%AFve", "Naive body"]]) {
    const res = await get(p);
    assert.equal(res.status, 200, p);
    assert.match(await res.text(), new RegExp(body), p);
  }
  assert.equal((await get("/na%C3%AFve")).headers.get("x-nextjs-cache"), "HIT", "prerendered under its NFC name");
  const llms = await (await get("/llms.txt")).text();
  assert.match(llms, /- \[Naive\]\([^)]*\/na%C3%AFve\)/, "listed with its title");
  assert.equal(llms.match(/na%C3%AFve\)/g)?.length, 1, "once, not again under More");
});

test("a static export keeps the files a static host serves for these names", { skip }, () => {
  site.export();
  for (const f of ["Getting Started.html", "café.html", "Getting Started.md", "café.md"]) {
    assert.ok(fs.existsSync(path.join(site.dir, "out", f)), f);
  }
});
