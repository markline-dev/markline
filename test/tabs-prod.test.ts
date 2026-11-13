import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createSite, filesUnder } from "./site-server";

// Tabs and accordions on a built page: every tab and accordion body is in the
// page, hidden while not showing, and "On this page" starts on the first tab.

const skip = process.platform === "win32" ? "builds are slow on Windows CI" : false;
const site = createSite();
let html = "";

before(() => {
  if (skip) return;
  const body = [
    "## Intro",
    "",
    "<Tabs>",
    '<Tab title="Alpha">',
    "## In alpha",
    "</Tab>",
    '<Tab title="Beta">',
    "## In beta",
    "",
    "Beta only text.",
    "</Tab>",
    "</Tabs>",
    "",
    '<Accordion title="More">',
    "## In the accordion",
    "",
    "Accordion only text.",
    "</Accordion>",
  ].join("\n");
  fs.writeFileSync(path.join(site.dir, "docs", "tabbed.mdx"), `---\ntitle: Tabbed\n---\n\n${body}\n`);
  site.build();
  const file = filesUnder(path.join(site.dir, ".markline", ".next", "server", "app")).find((f) => f.endsWith(`${path.sep}tabbed.html`));
  html = fs.readFileSync(file!, "utf8").replace(/<!-- -->/g, "");
});

after(() => site.destroy());

test("every tab is in the page, the ones not showing hidden, with tab roles", { skip }, () => {
  assert.match(html, /<h2 id="in-alpha">/);
  assert.match(html, /<h2 id="in-beta">/);
  assert.match(html, /Beta only text\./);
  const panels = [...html.matchAll(/<div[^>]*role="tabpanel"[^>]*>/g)].map((m) => m[0]);
  assert.equal(panels.length, 2);
  assert.doesNotMatch(panels[0], /hidden/);
  assert.match(panels[1], /hidden/);
  assert.match(html, /role="tablist"/);
  assert.match(html, /<button[^>]*role="tab"[^>]*aria-selected="true"[^>]*>Alpha</);
  assert.match(html, /<button[^>]*role="tab"[^>]*aria-selected="false"[^>]*>Beta</);
});

test("a closed accordion's body is in the page, hidden", { skip }, () => {
  assert.match(html, /<div class="ml-accordion-body" hidden="">[\s\S]*Accordion only text\./);
});

test("On this page starts on the first tab, and every link it shows lands", { skip }, () => {
  const toc = html.slice(html.indexOf('class="toc-list"'));
  const links = [...toc.slice(0, toc.indexOf("</ul>")).matchAll(/href="#([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(links, ["intro", "in-alpha"], "no beta yet, and a closed accordion's headings stay out");
  for (const id of links) assert.match(html, new RegExp(` id="${id}"`), id);
});
