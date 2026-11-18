import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createSite, filesUnder } from "./site-server";

// Links markline doesn't render (javascript:, data:, …) on a built page: in
// Markdown, in each component that takes an href, and in markline.json. Each
// keeps its text with no link, the good ones are untouched, and the build and
// the dev server say the same about each.

const skip = process.platform === "win32" ? "builds are slow on Windows CI" : false;
const site = createSite();
let html = "";
let built = "";
let changelog = "";
let llms = "";

const body = [
  "[Fine link](/guides/a), [Bad link](javascript:alert(1)), [Ref link][r], [Call us](tel:+15550100).",
  "",
  "[r]: data:text/html,x",
  "",
  '<a href="/guides/a" {...{ href: "data:text/html,last" }}>Last wins link</a> <a href="vbscript:x">Raw link</a> <a href={"data:text/html,expr"}>Expression link</a> [Open in VS Code](vscode:extension/x)',
  "",
  "<CardGroup>",
  '<Card title="Good card" href="/guides/a">ok</Card>',
  '<Card title="Bad card" href="javascript:void(0)">no</Card>',
  '<Card title="Nbsp card" href="\u00a0data:text/html,nbsp">no</Card>',
  "</CardGroup>",
  "",
  "<LinkList>",
  '<LinkItem href="/guides/a" title="Good item" />',
  '<LinkItem href="file:///x" title="Bad item" />',
  "</LinkList>",
  "",
  "<Paths>",
  '<Path num={1} href="/guides/a" arrow="→" title="Good path">ok</Path>',
  '<Path num={2} href="file:///path" arrow="→" title="Bad path">no</Path>',
  "</Paths>",
  "",
  "<Bento>",
  '<BentoCard title="Good bento" href="/guides/a">ok</BentoCard>',
  '<BentoCard title="Bad bento" href="data:text/html,bento">no</BentoCard>',
  "</Bento>",
  "",
  '<Feature title="Good feature" href="/guides/a">ok</Feature>',
  '<Feature title="Bad feature" href="data:text/html,feature">no</Feature>',
  "",
  '<CTAButton href="/guides/a">Good button</CTAButton>',
  '<CTAButton href="javascript:go()">Bad button</CTAButton>',
].join("\n");

/** The lines about links, once each, in order. */
const linkWarnings = (out: string) =>
  [...new Set(out.split("\n").filter((l) => /^\[markline\] .*doesn't link to/.test(l.trim())).map((l) => l.trim()))].sort();

before(() => {
  if (skip) return;
  fs.writeFileSync(path.join(site.dir, "docs", "links.mdx"), `---\ntitle: Links\n---\n\n${body}\n`);
  const config = JSON.parse(fs.readFileSync(path.join(site.dir, "markline.json"), "utf8"));
  config.footer = { links: [{ label: "Good footer", href: "/guides/a" }, { label: "Bad footer", href: "javascript:footer()" }] };
  config.topbar = { ...config.topbar, cta: { label: "Bad cta", href: "data:text/html,cta" } };
  config.navigation = { tabs: [{ id: "docs", label: "Docs", href: "/", match: ["__default__"], groups: [{ group: "G", pages: [{ href: "/" }, { href: "/links" }, { label: "Bad nav", href: "javascript:nav()" }] }] }] };
  fs.writeFileSync(path.join(site.dir, "markline.json"), JSON.stringify(config));
  fs.mkdirSync(path.join(site.dir, "changelog"), { recursive: true });
  fs.writeFileSync(path.join(site.dir, "changelog", "2026-01-02.mdx"), "---\ntitle: Fixes\n---\n\n[Bad entry link](javascript:entry()) and [good](/guides/a).\n\n<a href=\"data:text/html,entry\">Raw entry link</a>\n");
  // An API reference operation's own MDX, with a link of its own.
  fs.mkdirSync(path.join(site.dir, "api", "operations"), { recursive: true });
  fs.writeFileSync(
    path.join(site.dir, "api", "openapi.json"),
    JSON.stringify({ openapi: "3.1.0", info: { title: "T", version: "1" }, paths: { "/things": { get: { operationId: "listThings", summary: "List things", responses: { "200": { description: "OK" } } } } } }),
  );
  fs.writeFileSync(path.join(site.dir, "api", "operations", "listThings.mdx"), "[Bad overlay link](data:text/html,op)\n");
  built = site.build();
  llms = fs.readFileSync(path.join(site.dir, ".markline", "public", "llms.txt"), "utf8");
  const file = filesUnder(path.join(site.dir, ".markline", ".next", "server", "app")).find((f) => f.endsWith(`${path.sep}links.html`));
  html = fs.readFileSync(file!, "utf8").replace(/<!-- -->/g, "");
  const log = filesUnder(path.join(site.dir, ".markline", ".next", "server", "app")).find((f) => f.endsWith(`${path.sep}changelog.html`));
  changelog = fs.readFileSync(log!, "utf8").replace(/<!-- -->/g, "");
});

after(() => site.destroy());

test("no link markline doesn't render reaches the page, and React has none to block", { skip }, () => {
  for (const bad of ["javascript:", "vbscript:", "data:text/html", "file:///"]) assert.ok(!html.includes(bad), bad);
  assert.doesNotMatch(html, /React has blocked/);
});

test("each one keeps its text, in the component's form without a link", { skip }, () => {
  assert.match(html, /<span>Bad link<\/span>/);
  assert.match(html, /<span>Ref link<\/span>/);
  assert.match(html, /<span>Raw link<\/span>/);
  assert.match(html, /<span>Last wins link<\/span>/, "the href JSX ends up with is the one checked");
  assert.match(html, /<div class="next-card">(?:(?!<\/div><\/div>)[\s\S])*Nbsp card/, "a no-break space before the scheme doesn't hide it");
  assert.match(html, /<div class="next-card">(?:(?!<\/div><\/div>)[\s\S])*Bad card/);
  assert.match(html, /<span class="ml-link"><span class="ml-link-txt"><span class="ml-link-t">Bad item/);
  assert.match(html, /<div class="ml-path-card"><span class="ml-path-num">2<\/span><h3>Bad path<\/h3>/);
  assert.match(html, /<div class="ml-l-bento-card"[^>]*>(?:(?!<\/div>)[\s\S])*<h3>Bad bento<\/h3>/);
  assert.match(html, /<div class="ml-l-feature">(?:(?!<\/div>)[\s\S])*<h3>Bad feature<\/h3>/);
  assert.match(html, /<span>Bad button<\/span>/, "a button that goes nowhere is just its label");
  assert.doesNotMatch(html, /Bad footer|Bad cta|Bad nav/, "config links are left out");
  assert.doesNotMatch(llms, /Bad nav|javascript:/, "and llms.txt doesn't list them");
  assert.match(llms, /\/links/);
  assert.match(html, /<span>Expression link<\/span>/);
  assert.match(changelog, /<span>Bad entry link<\/span>/, "in a changelog entry too");
  assert.match(changelog, /<span>Raw entry link<\/span>/);
  assert.ok(!changelog.includes("data:text/html"));
  assert.ok(!changelog.includes("javascript:"));
});

test("the good ones are links as before", { skip }, () => {
  assert.match(html, /<a href="\/guides\/a">Fine link<\/a>/);
  assert.match(html, /<a href="tel:\+15550100">Call us<\/a>/);
  assert.match(html, /<a href="vscode:extension\/x">Open in VS Code<\/a>/, "an app's own scheme is a link");
  assert.match(html, /<a class="next-card" href="\/guides\/a">/);
  assert.match(html, /<a class="ml-link" href="\/guides\/a">/);
  assert.match(html, /<a class="ml-path-card" href="\/guides\/a">/);
  assert.match(html, /<a class="ml-l-bento-card" [^>]*href="\/guides\/a"|<a class="ml-l-bento-card" href="\/guides\/a"/);
  assert.match(html, /<a class="ml-l-feature linked" href="\/guides\/a">/);
  assert.match(html, /<a class="ml-l-btn size-md v-primary" href="\/guides\/a">Good button<\/a>/);
  assert.match(html, /Good footer/);
});

test("the build names each one, and the dev server says exactly the same", { skip }, async () => {
  const fromBuild = linkWarnings(built);
  const rule = "and markline doesn't link to javascript:, data:, vbscript: or file: URLs; it's shown as text.";
  for (const [text, href] of [
    ["Bad link", "javascript:alert(1)"], ["Ref link", "data:text/html,x"], ["Raw link", "vbscript:x"], ["Bad card", "javascript:void(0)"], ["Nbsp card", "data:text/html,nbsp"], ["Last wins link", "data:text/html,last"],
    ["Bad item", "file:///x"], ["Bad path", "file:///path"], ["Expression link", "data:text/html,expr"], ["Bad bento", "data:text/html,bento"], ["Bad feature", "data:text/html,feature"],
    ["Bad button", "javascript:go()"],
  ]) {
    assert.ok(fromBuild.includes(`[markline] docs/links.mdx: the link "${text}" goes to "${href}", ${rule}`), `${text} in:\n${fromBuild.join("\n")}`);
  }
  assert.ok(fromBuild.some((l) => l.startsWith('[markline] footer.links[1].href: "javascript:footer()"')), fromBuild.join("\n"));
  assert.ok(fromBuild.some((l) => l.startsWith('[markline] topbar.cta.href: "data:text/html,cta"')), fromBuild.join("\n"));
  assert.ok(fromBuild.includes(`[markline] changelog/2026-01-02.mdx: the link "Bad entry link" goes to "javascript:entry()", ${rule}`), fromBuild.join("\n"));
  assert.ok(fromBuild.includes(`[markline] api/operations/listThings.mdx: the link "Bad overlay link" goes to "data:text/html,op", ${rule}`), fromBuild.join("\n"));
  assert.ok(fromBuild.some((l) => l.startsWith('[markline] navigation.tabs[0].groups[0].pages[2].href: "javascript:nav()"')), fromBuild.join("\n"));
  assert.equal(fromBuild.length, 18, fromBuild.join("\n"));

  const base = await site.serve("dev", "/links");
  await (await fetch(`${base}/links`)).text();
  await (await fetch(`${base}/changelog`)).text();
  await (await fetch(`${base}/api-reference/listThings`)).text();
  await new Promise((r) => setTimeout(r, 300));
  assert.deepEqual(linkWarnings(site.takeOutput()), fromBuild);
});
