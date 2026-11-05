import { test } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
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

test("prose that starts with import or export stays", async () => {
  const { pageMarkdown } = await load();
  const body = "To use this you can\nexport the data as CSV, or\nimport the file later.\n";
  assert.equal(pageMarkdown({ title: "T", body }), `# T\n\n${body}`);
});

test("a multi-line export goes whole", async () => {
  const { pageMarkdown } = await load();
  const body = 'export const data = {\n  a: 1,\n  b: 2,\n};\n\nimport {\n  X,\n} from "x";\n\nKept.\n';
  assert.equal(pageMarkdown({ title: "T", body }), "# T\n\nKept.\n");
});

test("MDX comments aren't published, other expressions are left alone", async () => {
  const { pageMarkdown } = await load();
  const body = "{/* draft: secret */}\n\nShown {/* inline secret */}here {1 + 1}.\n\n{/* one\ntwo */}\n\n```mdx\n{/* in code */}\n```\n";
  const md = pageMarkdown({ title: "T", body });
  assert.doesNotMatch(md, /secret|two \*\//);
  assert.match(md, /Shown here \{1 \+ 1\}\./);
  assert.match(md, /\{\/\* in code \*\/\}/);
});

type Generated = {
  removeGeneratedFiles: (appDir: string) => void;
  writeManifest: (appDir: string, files: string[]) => void;
};

async function generated(t: { after: (fn: () => void) => void }) {
  const modulePath = "../scripts/generated-files.mjs";
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "markline-public-")));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const app = path.join(root, "app");
  fs.mkdirSync(path.join(app, "public", "guides"), { recursive: true });
  return { ...((await import(modulePath)) as unknown as Generated), root, app, pub: path.join(app, "public") };
}

test("removing generated files keeps the site's own", async (t) => {
  const { removeGeneratedFiles, writeManifest, app, pub } = await generated(t);
  removeGeneratedFiles(app); // no manifest yet: nothing to do
  for (const f of ["guides/a.md", "guides/llms.txt", "own.md"]) fs.writeFileSync(path.join(pub, f), "x");
  writeManifest(app, ["guides/a.md", "guides/llms.txt"]);
  removeGeneratedFiles(app);
  assert.deepEqual(fs.readdirSync(pub).sort(), ["guides", "own.md"]);
  assert.deepEqual(fs.readdirSync(path.join(pub, "guides")), []);
  assert.deepEqual(fs.readdirSync(app), ["public"], "the manifest is gone too");
});

test("a file the site has since put at a generated path stays", async (t) => {
  const { removeGeneratedFiles, writeManifest, app, pub } = await generated(t);
  const file = path.join(pub, "foo.md");
  fs.writeFileSync(file, "generated");
  writeManifest(app, ["foo.md"]);
  fs.writeFileSync(file, "the site's own");
  removeGeneratedFiles(app);
  assert.equal(fs.readFileSync(file, "utf8"), "the site's own");
});

test("the manifest isn't read from public/, which the docs project supplies", async (t) => {
  const { removeGeneratedFiles, app, pub } = await generated(t);
  fs.writeFileSync(path.join(pub, "a.md"), "x");
  fs.writeFileSync(path.join(pub, ".markline-generated.json"), JSON.stringify([{ file: "a.md" }, "a.md"]));
  removeGeneratedFiles(app);
  assert.ok(fs.existsSync(path.join(pub, "a.md")));
});

test("a bad manifest never throws or deletes anything else", async (t) => {
  const { removeGeneratedFiles, root, app, pub } = await generated(t);
  const hash = crypto.createHash("sha256").update("x").digest("hex");
  const victim = path.join(root, "victim.md");
  const keep = path.join(pub, "keep.txt");
  const dir = path.join(pub, "sub.md");
  fs.symlinkSync(root, path.join(pub, "linked"));
  const write = (v: unknown) => {
    fs.writeFileSync(victim, "x");
    fs.writeFileSync(keep, "x");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(app, ".markline-generated.json"), typeof v === "string" ? v : JSON.stringify(v));
  };
  const hostile: unknown[] = [
    "not json",
    { a: 1 },
    ["sub"],
    [1, null, {}, { file: 1 }],
    [{ file: "../../victim.md", hash }],
    [{ file: victim, hash }],
    [{ file: "linked/victim.md", hash }],
    [{ file: "keep.txt", hash }],
    [{ file: "sub.md", hash }],
    [{ file: "gone.md", hash }],
  ];
  for (const manifest of hostile) {
    write(manifest);
    assert.doesNotThrow(() => removeGeneratedFiles(app), JSON.stringify(manifest));
    assert.ok(fs.existsSync(victim), JSON.stringify(manifest));
    assert.ok(fs.existsSync(keep), JSON.stringify(manifest));
    assert.ok(fs.existsSync(dir), JSON.stringify(manifest));
  }
});
