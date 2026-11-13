import { test } from "node:test";
import assert from "node:assert/strict";
import { extractToc, missingTocIds, remarkTocIds } from "../lib/toc";

/** The label "On this page" gives a ## heading. */
const labelOf = (md: string) => extractToc(`## ${md}\n`)[0]?.label;

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
  assert.equal(labelOf("The `init` command"), "The init command");
  assert.equal(labelOf("**Bold** and [a link](/x) ##"), "Bold and a link");
  assert.equal(extractToc("## Tabs & `accordions`\n")[0].id, "tabs-accordions");
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
  remarkTocIds(opts)(tree);
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
  assert.deepEqual(ids, ["step-install", "step-run", "install", "step-install-1"]);
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
  assert.deepEqual(clash, ["step-install-1", "step-install"]);
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

test("angle brackets inside inline code are kept, not stripped as HTML", () => {
  // The heading renders as <code>create &lt;volume&gt;</code>, so its id is
  // create-volume; the TOC link has to match.
  assert.equal(labelOf("`create <volume>`"), "create <volume>");
  assert.equal(labelOf("`get <name>` / `delete <name>`"), "get <name> / delete <name>");
  assert.deepEqual(extractToc("### `create <volume>`\n"), [
    { id: "create-volume", label: "create <volume>", depth: 3 },
  ]);
  // Code is literal: emphasis markers inside it stay.
  assert.equal(labelOf("`a*b*c`"), "a*b*c");
  assert.equal(labelOf("`snake_case_name`"), "snake_case_name");
  // Real inline HTML outside code is still dropped.
  assert.equal(labelOf("Hello <b>world</b> and `<x>`"), "Hello world and <x>");
});

test("a step's title is listed as its text, and its id has no URL", () => {
  const steps = (titles: string[]) => `<Steps toc>\n${titles.map((t) => `<Step title="${t}">x</Step>`).join("\n")}\n</Steps>`;
  const items = extractToc(steps(["Run **now** with `npm`", "See [the docs](https://x.test/a)", "1. Install"]));
  assert.deepEqual(items.map((i) => [i.label, i.id]), [
    ["Run now with npm", "step-run-now-with-npm"],
    ["See the docs", "step-see-the-docs"],
    ["1. Install", "step-1-install"],
  ]);
});

test("a plain title keeps the id it had", () => {
  for (const [title, id] of [["Install the SDK", "step-install-the-sdk"], ["Café & co", "step-caf-co"], ["Use v2.1 (beta)", "step-use-v2-1-beta"]]) {
    assert.equal(extractToc(`<Steps toc>\n<Step title="${title}">x</Step>\n</Steps>`)[0].id, id, title);
  }
});

const ids = (mdx: string, opts?: { steps?: boolean }) => extractToc(mdx, opts).map((i) => i.id);

test("headings that read the same get their own ids", () => {
  assert.deepEqual(ids("## Verify\n\n## Verify\n\n### Verify\n"), ["verify", "verify-1", "verify-2"]);
});

test("a repeat's id skips any heading's own slug", () => {
  assert.deepEqual(ids("## Verify\n\n## Verify\n\n## Verify 1\n"), ["verify", "verify-2", "verify-1"]);
  assert.deepEqual(ids("## A\n\n## A\n\n## A-1\n\n## A\n"), ["a", "a-2", "a-1", "a-3"]);
});

test("a heading with no slug gets no id and isn't listed", () => {
  assert.deepEqual(extractToc("## 🚀\n\n## ???\n\n## 🚀\n\n## Real\n"), [{ id: "real", label: "Real", depth: 2 }]);
});

test("a hidden heading still takes its id, so a shown repeat moves on", () => {
  const mdx = ['<Tabs>', '<Tab title="A">', "## Setup", "</Tab>", '<Tab title="B">', "## Setup", "</Tab>", "</Tabs>", "", "## Setup"].join("\n");
  assert.deepEqual(ids(mdx), ["setup", "setup-2"]);
});

test("an id written on an element is kept, and headings move round it", () => {
  assert.deepEqual(ids('<div id="intro" />\n\n## Intro\n'), ["intro-1"]);
});

test("a step and a heading that read the same get different ids", () => {
  assert.deepEqual(ids('## Step one\n\n<Steps toc>\n<Step title="One">x</Step>\n<Step title="One">y</Step>\n</Steps>\n'), ["step-one", "step-one-1", "step-one-2"]);
});

async function headingIdsIn(mdx: string, opts?: { steps?: boolean; reserved?: string[] }): Promise<string[]> {
  const parser = ["unified", "remark-parse", "remark-mdx"];
  const [{ unified }, { default: remarkParse }, { default: remarkMdx }] = await Promise.all(parser.map((m) => import(m)));
  const tree = unified().use(remarkParse).use(remarkMdx).parse(mdx);
  remarkTocIds(opts)(tree);
  const out: string[] = [];
  const walk = (n: { type: string; name?: string; data?: { hProperties?: { id?: string } }; attributes?: { name: string; value: string }[]; children?: [] }) => {
    const id = n.type === "heading" ? n.data?.hProperties?.id : n.name === "Step" ? n.attributes?.find((a) => a.name === "id")?.value : undefined;
    if (id) out.push(id);
    (n.children ?? []).forEach(walk);
  };
  walk(tree);
  return out;
}

test("the page gets the ids the toc links to", async () => {
  const mdx = ["## A", "", "<Steps toc>", '<Step title="A">x</Step>', "</Steps>", "", "## A", "", "## 🚀", "", "## A-1", "", "### A"].join("\n");
  const listed = ids(mdx);
  assert.deepEqual(listed, ["a", "step-a", "a-2", "a-1", "a-3"]);
  assert.deepEqual((await headingIdsIn(mdx)).sort(), [...listed].sort());
});

test("a hand-written toc entry that matches nothing on the page is reported", () => {
  const body = '## Where they\'re served\n\n<div id="custom" />\n\n<Steps toc>\n<Step title="Go">x</Step>\n</Steps>\n';
  const toc = [
    { id: "where-they-re-served", label: "a" },
    { id: "where-theyre-served", label: "b" },
    { id: "custom", label: "c" },
    { id: "step-go", label: "d" },
  ];
  assert.deepEqual(missingTocIds(body, toc), ["where-theyre-served"]);
});

test("a repeated heading's id skips a step's own id", () => {
  const mdx = '## Step X\n\n## Step X\n\n<Steps toc>\n<Step title="X 1">y</Step>\n</Steps>\n';
  assert.deepEqual(ids(mdx), ["step-x", "step-x-2", "step-x-1"]);
});

test("ids the page already has elsewhere are skipped", async () => {
  const ids = await headingIdsIn("## 2026 10 15\n\n## 2026 10 15 fixes\n\n## Other\n", { reserved: ["2026-10-15", "2026-10-15-fixes"] });
  assert.deepEqual(ids, ["2026-10-15-1", "2026-10-15-fixes-1", "other"]);
  assert.deepEqual(await headingIdsIn("## 2026 10 15\n"), ["2026-10-15"], "nothing reserved, nothing moves");
});
