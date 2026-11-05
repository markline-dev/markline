import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

type Doc = { url: string; title: string; lede?: string; body: string; layout?: string };
type Llms = {
  pageMarkdown: (d: Pick<Doc, "title" | "lede" | "body">) => string;
  markdownPath: (url: string) => string;
  pathFromMarkdown: (p: string) => string;
  sectionIds: (docs: Pick<Doc, "url">[]) => string[];
  sectionIndex: (cfg: object, docs: Doc[], section: string, opts?: { name?: string; abs?: (u: string) => string }) => string | undefined;
};

async function load(): Promise<Llms> {
  const modulePath = "../scripts/llms.mjs";
  return (await import(modulePath)) as unknown as Llms;
}

test("a page's Markdown is its title, lede and body without imports", async () => {
  const { pageMarkdown } = await load();
  const md = pageMarkdown({ title: "Models", lede: "Pick one.", body: 'import X from "x";\n\n\n\n## Flash\n\n<Note>Fast.</Note>\n' });
  assert.equal(md, "# Models\n\nPick one.\n\n## Flash\n\n<Note>Fast.</Note>\n");
});

test(".md paths map to pages and back", async () => {
  const { markdownPath, pathFromMarkdown } = await load();
  assert.equal(markdownPath("/overview/models"), "/overview/models.md");
  assert.equal(markdownPath("/"), "/index.md");
  assert.equal(pathFromMarkdown("/overview/models.md"), "/overview/models");
  assert.equal(pathFromMarkdown("/index.md"), "/");
});

const cfg = {
  navigation: {
    tabs: [
      { label: "Overview", groups: [{ group: "Get started", pages: [{ href: "/" }, { href: "/overview/models" }] }] },
      {
        label: "ElevenAPI",
        groups: [
          { group: "Get started", pages: [{ href: "/eleven-api/quickstart", label: "Quickstart" }] },
          { group: "Cookbooks", pages: [{ label: "Folder", pages: [{ href: "/eleven-api/cookbooks/stt" }] }] },
        ],
      },
      { label: "API reference", openapi: true },
    ],
  },
};
const docs: Doc[] = [
  { url: "/", title: "Home", body: "" },
  { url: "/overview/models", title: "Models", lede: "Pick one.", body: "" },
  { url: "/eleven-api/quickstart", title: "ElevenAPI quickstart", body: "" },
  { url: "/eleven-api/cookbooks/stt", title: "Speech to text", body: "" },
  { url: "/eleven-api/unlisted", title: "Unlisted", body: "" },
  { url: "/about", title: "About", body: "" },
];

test("sections are the top-level folders that hold pages", async () => {
  const { sectionIds } = await load();
  assert.deepEqual(sectionIds(docs), ["overview", "eleven-api"]);
});

test("a section's llms.txt follows the sidebar, then lists the rest", async () => {
  const { sectionIndex } = await load();
  const txt = sectionIndex(cfg, docs, "eleven-api", { name: "ElevenLabs", abs: (u) => `https://x.dev${u}` });
  assert.ok(txt);
  assert.match(txt, /^# ElevenLabs: ElevenAPI\n/);
  assert.match(txt, /\[llms\.txt\]\(https:\/\/x\.dev\/llms\.txt\)/);
  const body = txt.slice(txt.indexOf("## "));
  assert.equal(
    body,
    [
      "## Get started",
      "",
      "- [Quickstart](https://x.dev/eleven-api/quickstart)",
      "",
      "## Cookbooks",
      "",
      "- [Speech to text](https://x.dev/eleven-api/cookbooks/stt)",
      "",
      "## More",
      "",
      "- [Unlisted](https://x.dev/eleven-api/unlisted)",
      "",
    ].join("\n"),
  );
  assert.match(sectionIndex(cfg, docs, "overview") ?? "", /- \[Models\]\(\/overview\/models\): Pick one\./);
  assert.equal(sectionIndex(cfg, docs, "about"), undefined);
  assert.equal(sectionIndex(cfg, docs, "nope"), undefined);
});

test("import lines in code blocks are kept", async () => {
  const { pageMarkdown } = await load();
  const md = pageMarkdown({ title: "T", body: 'import A from "a";\n\n```python\nimport requests\nexport_x = 1\n```\n' });
  assert.equal(md, "# T\n\n```python\nimport requests\nexport_x = 1\n```\n");
});

test("import lines in nested fences are kept", async () => {
  const { pageMarkdown } = await load();
  const nested = "````mdx\n```python\nimport inner\n```\nimport after\n````\nimport real from 'x';\n";
  assert.equal(pageMarkdown({ title: "T", body: nested }), "# T\n\n````mdx\n```python\nimport inner\n```\nimport after\n````\n");
  const info = "```bash\n```python\nimport still_in\n```\n";
  assert.equal(pageMarkdown({ title: "T", body: info }), "# T\n\n```bash\n```python\nimport still_in\n```\n");
});

test("removing generated files keeps the site's own", async (t) => {
  const modulePath = "../scripts/generated-files.mjs";
  const { removeGeneratedFiles, writeManifest } = (await import(modulePath)) as unknown as {
    removeGeneratedFiles: (pub: string) => void;
    writeManifest: (pub: string, files: string[]) => void;
  };
  const pub = fs.mkdtempSync(path.join(os.tmpdir(), "markline-public-"));
  t.after(() => fs.rmSync(pub, { recursive: true, force: true }));
  removeGeneratedFiles(pub); // no manifest yet: nothing to do
  fs.mkdirSync(path.join(pub, "guides"));
  for (const f of ["guides/a.md", "guides/llms.txt", "own.md"]) fs.writeFileSync(path.join(pub, f), "x");
  writeManifest(pub, ["guides/a.md", "guides/llms.txt", "already-gone.md"]);
  removeGeneratedFiles(pub);
  assert.deepEqual(fs.readdirSync(pub).sort(), ["guides", "own.md"]);
  assert.deepEqual(fs.readdirSync(path.join(pub, "guides")), []);
});
