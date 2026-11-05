import { test } from "node:test";
import assert from "node:assert/strict";
import { extractToc, remarkStepIds, headingText, slugify } from "../lib/toc";

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
    { id: "step-install-the-sdk", label: "Install the SDK", depth: 2 },
    { id: "step-set-api-key-env", label: "Set API_KEY > env", depth: 2 },
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

async function stepIdsIn(mdx: string, opts?: { steps?: boolean }): Promise<string[]> {
  const parser = ["unified", "remark-parse", "remark-mdx"];
  const [{ unified }, { default: remarkParse }, { default: remarkMdx }] = await Promise.all(parser.map((m) => import(m)));
  const tree = unified().use(remarkParse).use(remarkMdx).parse(mdx);
  remarkStepIds(opts)(tree);
  const ids: string[] = [];
  const walk = (n: { name?: string; attributes?: { name: string; value: string }[]; children?: [] }) => {
    if (n.name === "Step") {
      const id = n.attributes?.find((a) => a.name === "id")?.value;
      if (id) ids.push(id);
    }
    (n.children ?? []).forEach(walk);
  };
  walk(tree);
  return ids;
}

const COLLIDING = [
  "<Steps toc>",
  '  <Step title="Install">a</Step>',
  '  <Step title={"Run"}>b</Step>',
  "</Steps>",
  "",
  "## Install",
  "",
  "<Steps>",
  '  <Step title="Unlisted">c</Step>',
  "</Steps>",
  "",
  "<Steps toc>",
  '  <Step title="Install">d</Step>',
  "</Steps>",
].join("\n");

test("step ids don't collide with headings or each other", () => {
  const ids = extractToc(COLLIDING).map((i) => i.id);
  assert.deepEqual(ids, ["step-install", "step-run", "install", "step-install-2"]);
  assert.equal(new Set(ids).size, ids.length);
});

test("the page gives listed steps the ids the toc links to, and others none", async () => {
  const stepsOnly = (o?: { steps?: boolean }) => extractToc(COLLIDING, o).map((i) => i.id).filter((id) => id.startsWith("step-"));
  assert.deepEqual(await stepIdsIn(COLLIDING), stepsOnly());
  assert.deepEqual(await stepIdsIn(COLLIDING, { steps: true }), stepsOnly({ steps: true }));
  assert.deepEqual(await stepIdsIn('<Steps>\n  <Step title="Plain">x</Step>\n</Steps>'), []);
  assert.deepEqual(await stepIdsIn('<Steps toc={false}>\n  <Step title="Off">x</Step>\n</Steps>'), []);
});

test("a step whose tag spans lines is listed, with the id the page gives it", async () => {
  const mdx = ["<Steps toc>", "  <Step", '    title="Long title"', "    icon='x>y'", "  >", "    a", "  </Step>", '  <Step title="Short">b</Step>', "</Steps>"].join("\n");
  assert.deepEqual(extractToc(mdx).map((i) => i.id), ["step-long-title", "step-short"]);
  assert.deepEqual(await stepIdsIn(mdx), ["step-long-title", "step-short"]);
});

test("a tag in inline code isn't a real one", () => {
  const mdx = ['Write `<Steps toc>` and `<Step title="Mention">` like so.', "", "<Steps>", '  <Step title="Real">a</Step>', "</Steps>"].join("\n");
  assert.deepEqual(extractToc(mdx), []);
  const listed = ['`<Step title="Mention">` goes inside.', "", "<Steps toc>", '  <Step title="Real">a</Step>', "</Steps>"].join("\n");
  assert.deepEqual(extractToc(listed).map((i) => i.label), ["Real"]);
});

test("only a matching fence closes a code block", () => {
  const nested = ["````mdx", "```bash", "## Inside four", "```", "## Still inside", "````", "## Out one"].join("\n");
  assert.deepEqual(extractToc(nested).map((i) => i.label), ["Out one"]);
  const info = ["```bash", "```python", "## Inside", "```", "## Out two"].join("\n");
  assert.deepEqual(extractToc(info).map((i) => i.label), ["Out two"]);
  const tilde = ["~~~", "```", "## Inside", "~~~", "## Out three"].join("\n");
  assert.deepEqual(extractToc(tilde).map((i) => i.label), ["Out three"]);
  const inline = ["```not a fence```", "## Out four"].join("\n");
  assert.deepEqual(extractToc(inline).map((i) => i.label), ["Out four"]);
});

test("step ids avoid a heading that reads the same, and each other", () => {
  const steps = (titles: string[]) => `<Steps toc>\n${titles.map((t) => `<Step title="${t}">x</Step>`).join("\n")}\n</Steps>`;
  const clash = extractToc(`${steps(["Install"])}\n\n## Step Install\n`).map((i) => i.id);
  assert.deepEqual(clash, ["step-install-2", "step-install"]);
  const numbered = extractToc(steps(["Install", "Install", "Install 2"])).map((i) => i.id);
  assert.equal(new Set(numbered).size, 3);
});

test("the toc and the page agree on entities and comments", async () => {
  const mdx = [
    '<Steps toc>',
    '  <Step title="R&amp;D">a</Step>',
    '  {/* <Step title="Commented out">b</Step> */}',
    '  <Step title="Caf&#233; time">c</Step>',
    "</Steps>",
    "",
    "## R&amp;D heading",
    "",
    "{/* ## Hidden heading */}",
  ].join("\n");
  const items = extractToc(mdx);
  assert.deepEqual(items.map((i) => i.label), ["R&D", "Café time", "R&D heading"]);
  assert.deepEqual(items.map((i) => i.id), ["step-r-d", "step-caf-time", "r-d-heading"]);
  assert.deepEqual(await stepIdsIn(mdx), ["step-r-d", "step-caf-time"]);
});

test("the toc lists only what's in the page when it loads", () => {
  const mdx = [
    "<Tabs>",
    '  <Tab title="A">',
    "    ## In the first tab",
    "  </Tab>",
    '  <Tab title="B">',
    "    ## In the second tab",
    "  </Tab>",
    "</Tabs>",
    "",
    '<Accordion title="Closed">',
    "  ## In a closed one",
    "</Accordion>",
    "",
    '<Accordion title="Open" defaultOpen>',
    "  ## In an open one",
    "</Accordion>",
    "",
    "<CodeGroup>",
    "## In a group",
    "</CodeGroup>",
    "",
    "<Note>",
    "  ## In a note",
    "</Note>",
  ].join("\n");
  assert.deepEqual(extractToc(mdx).map((i) => i.label), ["In the first tab", "In an open one", "In a note"]);
});

test("a step in a hidden tab isn't listed and gets no id", async () => {
  const mdx = '<Tabs>\n<Tab title="A">x</Tab>\n<Tab title="B">\n<Steps toc>\n<Step title="Hidden">y</Step>\n</Steps>\n</Tab>\n</Tabs>';
  assert.deepEqual(extractToc(mdx), []);
  assert.deepEqual(await stepIdsIn(mdx), []);
});

test("struck-through text in a heading reads as the page does", () => {
  assert.deepEqual(extractToc("## ~~Old~~ new\n"), [{ id: "old-new", label: "Old new", depth: 2 }]);
});

test("a comment or space before the first tab doesn't hide it from the toc", () => {
  const tabs = (before: string) => [before, "<Tabs>", before, '<Tab title="A">', "## In first", "</Tab>", '<Tab title="B">', "## In second", "</Tab>", "</Tabs>"].join("\n");
  assert.deepEqual(extractToc(tabs("{/* note */}")).map((i) => i.label), ["In first"]);
  assert.deepEqual(extractToc(tabs('{" "}'), { steps: true }).map((i) => i.label), ["In first"]);
});

