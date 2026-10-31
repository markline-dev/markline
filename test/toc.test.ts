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

const STEPS = [
  "Intro",
  "",
  "<Steps toc>",
  '  <Step title="Install the SDK">',
  "```bash",
  '<Step title="Not a step">',
  "```",
  "  </Step>",
  "  <Step title='Set `API_KEY` > env'>x</Step>",
  "</Steps>",
  "",
  "## Example response",
  "",
  "<Steps>",
  '  <Step title={"Unlisted"}>y</Step>',
  "</Steps>",
].join("\n");

test("extractToc lists step titles inside <Steps toc>", () => {
  assert.deepEqual(extractToc(STEPS), [
    { id: "install-the-sdk", label: "Install the SDK", depth: 2 },
    { id: "set-api-key-env", label: "Set API_KEY > env", depth: 2 },
    { id: "example-response", label: "Example response", depth: 2 },
  ]);
});

test("toc: steps lists every <Steps>, nested under the ## before it", () => {
  const items = extractToc(STEPS, { steps: true });
  assert.deepEqual(items.map((i) => [i.label, i.depth]), [
    ["Install the SDK", 2],
    ["Set API_KEY > env", 2],
    ["Example response", 2],
    ["Unlisted", 3],
  ]);
});

test("steps stay out of the toc by default", () => {
  assert.deepEqual(extractToc(STEPS.replace("<Steps toc>", "<Steps>")).map((i) => i.label), ["Example response"]);
  assert.deepEqual(extractToc(STEPS.replace("<Steps toc>", "<Steps toc={false}>")).map((i) => i.label), ["Example response"]);
});
