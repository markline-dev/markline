import { test } from "node:test";
import assert from "node:assert/strict";
import { extractToc, headingText, slugify } from "../lib/toc";

test("extractToc lists ## and ### headings with depth", () => {
  const body = "Intro\n\n## Set up\n\ntext\n\n### Install it\n\n#### Too deep\n\n## Next steps\n";
  assert.deepEqual(extractToc(body), [
    { id: "set-up", label: "Set up", depth: 2 },
    { id: "install-it", label: "Install it", depth: 3 },
    { id: "next-steps", label: "Next steps", depth: 2 },
  ]);
});

test("extractToc skips headings inside code fences", () => {
  const body = "## Real\n\n```md\n## Not a heading\n```\n\n~~~\n### Nor this\n~~~\n";
  assert.deepEqual(extractToc(body).map((i) => i.label), ["Real"]);
});

test("headings with inline markdown use their visible text", () => {
  assert.equal(headingText("The `init` command"), "The init command");
  assert.equal(headingText("**Bold** and [a link](/x) ##"), "Bold and a link");
  assert.equal(slugify(headingText("Tabs & `accordions`")), "tabs-accordions");
});
