import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createSite } from "./site-server";
import { browserSkip, openBrowser, sleep } from "./browser";

// The sidebar's search box beside "Ask AI", in a real browser (test/browser.ts)
// against `markline start`: at every sidebar width the magnifier keeps its
// size and the ⌘K hint stays inside the box (or goes), never cut off.

const skip = browserSkip;
const site = createSite();
let base = "";
let browser: Awaited<ReturnType<typeof openBrowser>> | undefined;

before(async () => {
  if (skip) return;
  const config = JSON.parse(fs.readFileSync(path.join(site.dir, "markline.json"), "utf8"));
  // Ask AI shows without a server key in byok mode.
  config.ai = { enabled: true, mode: "byok", provider: "openai", label: "Ask us" };
  fs.writeFileSync(path.join(site.dir, "markline.json"), JSON.stringify(config));
  site.build();
  base = await site.serve("start", "/guides/a");
  browser = await openBrowser();
});

after(async () => {
  browser?.close();
  await site.destroy();
});

type Row = { button: number; icon: number; kbd: { left: number; right: number } | null; inner: { left: number; right: number }; overflow: boolean; label: string; ask: number | null; row: number };

/** The search box and Ask AI button as laid out. */
const measure = () =>
  browser!.ev<Row>(`(() => {
    const b = document.querySelector(".docs-side .docs-search-trigger");
    const cs = getComputedStyle(b), r = b.getBoundingClientRect();
    const kbd = b.querySelector(".kbd"), ask = document.querySelector(".docs-side .docs-ask");
    const k = kbd && getComputedStyle(kbd).display !== "none" ? kbd.getBoundingClientRect() : null;
    return {
      button: r.width,
      icon: b.querySelector("svg").getBoundingClientRect().width,
      kbd: k && { left: k.left, right: k.right },
      inner: { left: r.left + parseFloat(cs.borderLeftWidth) + parseFloat(cs.paddingLeft), right: r.right - parseFloat(cs.borderRightWidth) - parseFloat(cs.paddingRight) },
      overflow: b.scrollWidth > b.clientWidth,
      label: b.innerText.replace(/\\s+/g, " ").trim(),
      ask: ask && ask.getBoundingClientRect().width,
      row: document.querySelector(".docs-side .docs-tools").getBoundingClientRect().width,
    };
  })()`);

async function at(width: number, height = 800) {
  await browser!.send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: width < 600 });
  await browser!.send("Page.navigate", { url: `${base}/guides/a` });
  for (let i = 0; i < 100; i++) {
    await sleep(100);
    if (await browser!.ev<boolean>(`document.readyState === "complete" && !!document.querySelector(".docs-side .docs-search-trigger")`)) break;
  }
  if (width < 881) await browser!.ev(`document.body.classList.add("docnav-open")`);
  await sleep(300);
}

/** The icon has its size, the ⌘K hint (if shown) sits inside the padding, and nothing spills. */
function fits(m: Row, where: string) {
  assert.equal(Math.round(m.icon), 14, `${where}: the magnifier keeps its 14px (${m.icon})`);
  assert.equal(m.overflow, false, `${where}: nothing spills out of the box`);
  if (m.kbd) assert.ok(m.kbd.right <= m.inner.right + 0.5 && m.kbd.left >= m.inner.left, `${where}: ⌘K inside the padding (${m.kbd.left}–${m.kbd.right} in ${m.inner.left}–${m.inner.right})`);
  assert.match(m.label, /^Search/, `${where}: the label shows (${m.label})`);
}

for (const [width, name] of [[1280, "a 256px sidebar"], [1000, "the 240px sidebar of a narrower window"], [390, "the phone drawer"]] as const) {
  test(`in ${name}, beside Ask AI, the search box fits`, { skip }, async () => {
    await at(width);
    const m = await measure();
    assert.ok(m.ask && m.ask > 0, "Ask AI is there");
    fits(m, `${width}px`);
  });
}

test("the drawer has room for the full label, and a narrow sidebar shortens it", { skip }, async () => {
  // Exactly where each step falls depends on the font; the sweep below checks it.
  await at(390);
  assert.equal((await measure()).label, "Search docs ⌘K", "the drawer has room for all of it");
  await at(1000);
  assert.match((await measure()).label, /^Search( ⌘K)?$/);
});

test("the sidebar is labelled as configured, and the search box keeps its name at any width", { skip }, async () => {
  const html = await (await fetch(`${base}/guides/a`)).text();
  assert.match(html, /<span class="docs-ask-lbl">Ask us<\/span>/, "ai.label reaches the sidebar's Ask button");
  assert.match(html, /class="docs-search-trigger" aria-label="Search docs" aria-keyshortcuts="Meta\+K Control\+K"/);
  await at(1000);
  assert.equal(await browser!.ev(`document.querySelector(".docs-side .docs-ask").title`), "", "no tooltip on a label that isn't cut");
});

test("across row widths, the box shows the most it has room for, and never cuts the label", { skip }, async () => {
  await at(1280);
  await browser!.ev(`document.querySelector(".docs-side .docs-ask").remove()`);
  const sweep = await browser!.ev<{ w: number; content: number; label: string; cut: boolean; kbdIn: boolean; icon: number }[]>(`(async () => {
    const tools = document.querySelector(".docs-side .docs-tools"), b = tools.querySelector(".docs-search-trigger");
    const lbl = b.querySelector(".docs-search-lbl"), more = b.querySelector(".docs-search-more"), kbd = b.querySelector(".kbd");
    const frame = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    const out = [];
    for (let w = 110; w <= 260; w += 2) {
      tools.style.width = w + "px";
      await frame();
      const cs = getComputedStyle(b), r = b.getBoundingClientRect(), k = kbd.getBoundingClientRect();
      const innerRight = r.right - parseFloat(cs.borderRightWidth) - parseFloat(cs.paddingRight);
      out.push({ w, content: b.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight), label: b.innerText.replace(/\\s+/g, " ").trim(),
        cut: lbl.scrollWidth > lbl.clientWidth, kbdIn: getComputedStyle(kbd).display === "none" || k.right <= innerRight + 0.5, icon: b.querySelector("svg").getBoundingClientRect().width });
    }
    // What each state needs, laid out with room to spare.
    tools.style.width = "400px";
    await frame();
    const gap = parseFloat(getComputedStyle(b).columnGap), icon = b.querySelector("svg").getBoundingClientRect().width;
    const full = lbl.getBoundingClientRect().width, short = full - more.getBoundingClientRect().width, kbdW = kbd.getBoundingClientRect().width;
    out.push({ need: { full: icon + gap + full + gap + kbdW, shortKbd: icon + gap + short + gap + kbdW } });
    return out;
  })()`);
  const { need } = sweep.pop() as unknown as { need: { full: number; shortKbd: number } };
  for (const s of sweep) {
    const where = `row ${s.w}px (content ${s.content.toFixed(1)}px): ${s.label}`;
    assert.equal(Math.round(s.icon), 14, where);
    assert.equal(s.cut, false, `${where}: the label isn't cut`);
    assert.ok(s.kbdIn, `${where}: ⌘K inside the padding`);
    // A fuller state is held back only when it wouldn't fit, give or take a few px.
    const expect = s.content >= need.full + 6 ? "Search docs ⌘K" : s.content >= need.shortKbd + 6 ? /⌘K$/ : /^Search/;
    if (typeof expect === "string") assert.equal(s.label, expect, where);
    else assert.match(s.label, expect, where);
    if (s.content < need.full) assert.notEqual(s.label, "Search docs ⌘K", `${where}: shown full without room`);
    if (s.content < need.shortKbd) assert.equal(s.label, "Search", `${where}: ⌘K shown without room`);
  }
});

test("a long Ask AI label gives way before the search box does", { skip }, async () => {
  await at(1280);
  await browser!.ev(`document.querySelector(".docs-side .docs-ask .docs-ask-lbl").textContent = "Demander à l’assistant d’intelligence artificielle"`);
  await sleep(300);
  const m = await measure();
  fits(m, "long label");
  const ask = await browser!.ev<{ cut: boolean; ellipsis: boolean; icon: number; title: string }>(`(() => {
    const a = document.querySelector(".docs-side .docs-ask"), l = a.querySelector(".docs-ask-lbl");
    return { cut: l.scrollWidth > l.clientWidth, ellipsis: getComputedStyle(l).textOverflow === "ellipsis", icon: a.querySelector(".ico").getBoundingClientRect().width, title: a.title };
  })()`);
  assert.ok(ask.cut && ask.ellipsis, "the Ask label is cut with an ellipsis");
  assert.equal(Math.round(ask.icon), 15, "the Ask icon keeps its size");
  // (The test swaps the text behind React, so the tooltip holds the configured label.)
  assert.notEqual(ask.title, "", "and a cut label gets a tooltip");
  assert.ok(m.ask! <= m.row / 2 + 0.5, `Ask AI takes at most half the row (${m.ask} of ${m.row})`);
  assert.ok(m.button >= m.row / 2 - 8.5, `the search box keeps the rest (${m.button})`);
});

test("without Ask AI the search box fills the row with everything in it", { skip }, async () => {
  await at(1000);
  await browser!.ev(`document.querySelector(".docs-side .docs-ask").remove()`);
  await sleep(100);
  const m = await measure();
  fits(m, "no Ask AI");
  assert.equal(Math.round(m.button), Math.round(m.row));
  assert.equal(m.label, "Search docs ⌘K");
});

test("when even the short label doesn't fit (a larger font), the label is what gives way", { skip }, async () => {
  await at(1000);
  await browser!.ev(`document.querySelector(".docs-side .docs-search-trigger").style.fontSize = "24px"`);
  await sleep(100);
  const m = await measure();
  fits(m, "24px font");
  assert.equal(m.kbd, null, "no room for ⌘K");
  assert.ok(await browser!.ev<boolean>(`(() => { const l = document.querySelector(".docs-side .docs-search-trigger .docs-search-lbl"); return l.scrollWidth > l.clientWidth && getComputedStyle(l).textOverflow === "ellipsis"; })()`), "the label is cut with an ellipsis");
});
