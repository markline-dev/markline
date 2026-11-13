import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createSite, filesUnder } from "./site-server";

// A step title's inline Markdown on a built page.

const skip = process.platform === "win32" ? "builds are slow on Windows CI" : false;
const site = createSite();
let html = "";

before(() => {
  if (skip) return;
  const steps = [
    "<Steps toc>",
    '<Step title="Run **now** with `npm`">a</Step>',
    '<Step title="Read [the guide](/guides/a)">b</Step>',
    '<Step title="Click [here](javascript:alert(1))">c</Step>',
    '<Step title="Install the SDK">d</Step>',
    // The two ways Markdown writes a path with a space.
    '<Step title="Open [Getting Started](</Getting Started>)">e</Step>',
    '<Step title="See [it again](/Getting%20Started)">f</Step>',
    "</Steps>",
  ].join("\n");
  fs.writeFileSync(path.join(site.dir, "docs", "Getting Started.mdx"), "---\ntitle: GS\n---\n\ngs\n");
  fs.writeFileSync(path.join(site.dir, "docs", "steps.mdx"), `---\ntitle: Steps\n---\n\n${steps}\n`);
  site.build();
  const file = filesUnder(path.join(site.dir, ".markline", ".next", "server", "app")).find((f) => f.endsWith(`${path.sep}steps.html`));
  // React separates adjacent text with <!-- -->; it isn't part of the title.
  html = fs.readFileSync(file!, "utf8").replace(/<!-- -->/g, "");
});

after(() => site.destroy());

test("a step's heading shows its title formatted", { skip }, () => {
  assert.match(html, /<h3 id="step-run-now-with-npm">Run <strong>now<\/strong> with <code>npm<\/code><\/h3>/);
  assert.match(html, /<h3 id="step-read-the-guide">Read <a href="\/guides\/a">the guide<\/a><\/h3>/);
  assert.match(html, /<h3 id="step-install-the-sdk">Install the SDK<\/h3>/, "a plain title is as before");
  assert.match(html, /<a href="\/Getting%20Started">Getting Started<\/a>/, "an internal link is encoded like every other");
  assert.match(html, /<a href="\/Getting%20Started">it again<\/a>/, "and an encoded one isn't encoded twice");
});

test("a javascript: link in a title keeps its text and loses its URL", { skip }, () => {
  assert.match(html, /<h3 id="step-click-here">Click here<\/h3>/);
  assert.doesNotMatch(html, /javascript:alert/);
});

test("On this page lists the text, linking to the headings, and nothing nests a link in a link", { skip }, () => {
  for (const [id, label] of [["step-run-now-with-npm", "Run now with npm"], ["step-read-the-guide", "Read the guide"]]) {
    assert.match(html, new RegExp(`href="#${id}"[^>]*>${label}<`), label);
  }
  // No <a> opens inside another before it closes.
  let depth = 0;
  for (const m of html.matchAll(/<(\/?)a[\s>]/g)) {
    depth += m[1] ? -1 : 1;
    assert.ok(depth <= 1, "a link inside a link");
  }
  assert.doesNotMatch(html, /https?-|step-[a-z-]*-x-test/, "no URL in an id");
});
