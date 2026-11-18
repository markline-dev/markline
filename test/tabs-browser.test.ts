import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createSite } from "./site-server";
import { browserSkip, openBrowser, sleep, type Send } from "./browser";

// Tabs, accordions and "On this page" in a real browser (test/browser.ts),
// against `markline start`.

const skip = browserSkip;

const lorem = Array(8).fill("Text to scroll past. ".repeat(40)).join("\n\n");
const body = [
  "## Intro",
  "",
  lorem,
  "",
  "<Tabs>",
  '<Tab title="Alpha">',
  "## In alpha",
  "",
  lorem,
  "</Tab>",
  '<Tab title="Beta">',
  "## In beta",
  "",
  lorem,
  "</Tab>",
  "</Tabs>",
  "",
  '<Accordion title="More">',
  "## In the accordion",
  "",
  "Accordion text.",
  "</Accordion>",
  "",
  "## After",
  "",
  lorem,
].join("\n");

const site = createSite();
let base = "";
let browser: Awaited<ReturnType<typeof openBrowser>> | undefined;
let send: Send = async () => ({});

/** Evaluate `expr` in the page and return its value. */
const ev = <T,>(expr: string) => browser!.ev<T>(expr);
/** The "On this page" links showing, by target id. */
const tocIds = () => ev<string[]>(`[...document.querySelectorAll(".docs-toc .toc-list a")].map((a) => a.getAttribute("href").slice(1))`);
const selected = () => ev<string>(`[...document.querySelectorAll('[role=tab]')].map((b) => b.getAttribute("aria-selected")).join()`);
const topOf = (id: string) => ev<number>(`Math.round(document.getElementById(${JSON.stringify(id)}).getBoundingClientRect().top)`);

/** Wait until `cond` (an expression in the page) holds, up to 10s. */
async function until(cond: string, what = cond) {
  for (let i = 0; i < 100; i++) {
    if (await ev<boolean>(cond).catch(() => false)) return;
    await sleep(100);
  }
  assert.fail(`timed out waiting for ${what}`);
}
/** The page has loaded and React has hydrated `sel` (it carries React's props). */
const hydrated = (sel: string) =>
  until(`document.readyState === "complete" && Object.keys(document.querySelector(${JSON.stringify(sel)}) ?? {}).some((k) => k.startsWith("__reactProps"))`, `${sel} hydrated`);
/** Hydrated, and the panes' effects have run (a hidden one is now "until found"). */
const settled = async () => {
  await hydrated("[role=tab]");
  await until(`!!document.querySelector('[hidden="until-found"]')`, "the panes' effects");
  await sleep(150); // past restoresScroll's first-load window and the 50ms reveal timer
};

async function load(url: string, ready = settled) {
  // From a blank page, so a URL differing only in its #hash is a fresh load.
  await send("Page.navigate", { url: "about:blank" });
  await until(`location.href === "about:blank"`);
  await send("Page.navigate", { url });
  await ready();
}
/** Reload, and wait for the new document. */
async function reload(ready = settled) {
  await ev(`window.__old = true`);
  await send("Page.reload");
  await until(`!window.__old && document.readyState === "complete"`, "the reload");
  await ready();
}

before(async () => {
  if (skip) return;
  fs.writeFileSync(path.join(site.dir, "docs", "tabbed.mdx"), `---\ntitle: Tabbed\n---\n\n${body}\n`);
  fs.writeFileSync(path.join(site.dir, "docs", "linking.mdx"), "---\ntitle: Linking\n---\n\n[To beta](/tabbed#in-beta)\n");
  site.build();
  base = await site.serve("start", "/tabbed");

  browser = await openBrowser();
  send = browser.send;
  await send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
});

after(async () => {
  browser?.close();
  await site.destroy();
});

test("On this page follows the tab picked and an accordion opened", { skip }, async () => {
  await load(`${base}/tabbed`);
  assert.deepEqual(await tocIds(), ["intro", "in-alpha", "after"]);
  // Find in page can reach what's hidden.
  assert.equal(await ev<string>(`document.querySelectorAll('[role=tabpanel]')[1].getAttribute('hidden')`), "until-found");
  assert.equal(await ev<string>(`document.querySelector('.ml-accordion-body').getAttribute('hidden')`), "until-found");
  await ev(`document.querySelectorAll('[role=tab]')[1].click()`);
  await sleep(300);
  assert.deepEqual(await tocIds(), ["intro", "in-beta", "after"]);
  await ev(`document.querySelector('.ml-accordion-toggle').click()`);
  await sleep(300);
  assert.deepEqual(await tocIds(), ["intro", "in-beta", "in-the-accordion", "after"]);
});

test("a #link into a hidden tab or a closed accordion opens it and goes there", { skip }, async () => {
  await load(`${base}/tabbed#in-beta`);
  assert.equal(await selected(), "false,true", "on load");
  assert.ok((await topOf("in-beta")) >= 0 && (await topOf("in-beta")) < 300, "the heading is in view");
  assert.deepEqual(await tocIds(), ["intro", "in-beta", "after"]);

  await ev(`location.hash = "in-the-accordion"`);
  await sleep(400);
  assert.equal(await ev<string>(`document.querySelector('.ml-accordion-toggle').getAttribute('aria-expanded')`), "true");
  const top = await topOf("in-the-accordion");
  assert.ok(top >= 0 && top < 300, `the accordion heading is in view (${top})`);

  await ev(`location.hash = "in-alpha"`);
  await sleep(400);
  assert.equal(await selected(), "true,false", "on hashchange");
});

test("a reload keeps its scroll position rather than jumping to the #target", { skip }, async () => {
  // The #target is in a tab that isn't showing as the page loads, so only the
  // reload check keeps it from scrolling there.
  await load(`${base}/tabbed#in-beta`);
  await ev(`window.scrollTo(0, 3000)`);
  await until(`Math.round(scrollY) === 3000`);
  await reload();
  const y = await ev<number>(`Math.round(scrollY)`);
  assert.ok(Math.abs(y - 3000) < 50, `restored near 3000, at ${y}`);
  assert.equal(await selected(), "false,true", "and the #target's tab is open");
});

test("after a reload, a link to another page's hidden tab still goes there", { skip }, async () => {
  const link = `a[href="/tabbed#in-beta"]`;
  await load(`${base}/linking`, () => hydrated(link));
  await reload(() => hydrated(link));
  await ev(`window.__same = true; document.querySelector(${JSON.stringify(link)}).click()`);
  await until(`location.pathname === "/tabbed" && !!document.querySelector('[role=tab]')`, "the client-side navigation");
  await until(`document.querySelectorAll('[role=tab]')[1].getAttribute("aria-selected") === "true"`, "the Beta tab");
  await sleep(300);
  assert.equal(await ev(`window.__same`), true, "a client-side navigation, not a new document");
  const top = await topOf("in-beta");
  assert.ok(top >= 0 && top < 300, `the heading is in view (${top})`);
});

test("a #link to a heading already showing leaves no target behind for a later tab switch", { skip }, async () => {
  await load(`${base}/tabbed#in-alpha`);
  await ev(`window.scrollTo(0, 0)`);
  await until(`scrollY === 0`);
  await ev(`document.querySelectorAll('[role=tab]')[1].click()`);
  await sleep(300);
  assert.equal(await selected(), "false,true");
  assert.equal(await ev<number>(`Math.round(scrollY)`), 0, "picking a tab doesn't scroll");
});

test("arrow keys move between tabs; with a modifier they're the browser's", { skip }, async () => {
  await load(`${base}/tabbed`);
  const key = (k: string, mods = {}) =>
    ev(`document.querySelector('[role=tab]').focus(); document.querySelector('[role=tablist]').dispatchEvent(new KeyboardEvent('keydown', { key: ${JSON.stringify(k)}, bubbles: true, cancelable: true, ...${JSON.stringify(mods)} }))`);
  await key("ArrowRight", { altKey: true });
  await sleep(100);
  assert.equal(await selected(), "true,false", "Alt+ArrowRight is left alone");
  await key("ArrowRight");
  await sleep(100);
  assert.equal(await selected(), "false,true");
  assert.equal(await ev<string>(`document.activeElement.textContent`), "Beta");
});
