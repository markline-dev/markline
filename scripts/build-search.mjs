// Build a Pagefind static search index from the documentation *source*
// (_docs MDX + the OpenAPI spec) rather than from rendered HTML. Indexing the
// source keeps URLs correct and makes the index identical across every hosting
// target (static export, Docker/Node, Vercel). The bundle is written to
// public/pagefind, so it must run BEFORE `next build` (which copies public/).
//
// Run directly: `npm run search`. Wired into `npm run build`.

import fs from "node:fs";
import path from "node:path";
import matter from "gray-matter";
import * as pagefind from "pagefind";

/** Read MARKLINE_CONTENT from the environment, falling back to .env.local / .env. */
function resolveContentEnv() {
  if (process.env.MARKLINE_CONTENT) return process.env.MARKLINE_CONTENT;
  for (const f of [".env.local", ".env"]) {
    try {
      const txt = fs.readFileSync(path.join(process.cwd(), f), "utf8");
      const m = txt.match(/^\s*MARKLINE_CONTENT\s*=\s*(.+?)\s*$/m);
      if (m) return m[1].replace(/^["']|["']$/g, "");
    } catch {
      // no such file — keep looking
    }
  }
  return undefined;
}

function contentRoot() {
  const c = resolveContentEnv();
  if (c && c.length > 0) return path.isAbsolute(c) ? c : path.join(process.cwd(), c);
  return path.join(process.cwd(), "content");
}

/** Strip MDX/markdown down to indexable plain text. */
function toPlainText(md) {
  return md
    .replace(/```[\s\S]*?```/g, " ")          // fenced code
    .replace(/`[^`]*`/g, " ")                  // inline code
    .replace(/<\/?[A-Za-z][^>]*>/g, " ")       // JSX / HTML tags
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")     // images
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")   // links -> text
    .replace(/^[ \t]*[#>*\-+]+[ \t]*/gm, " ")  // heading / list / quote markers
    .replace(/[*_~]/g, " ")                     // emphasis
    .replace(/\s+/g, " ")
    .trim();
}

function walk(dir) {
  if (!fs.existsSync(dir)) return [];
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(p));
    else if (entry.isFile() && entry.name.endsWith(".mdx")) out.push(p);
  }
  return out;
}

function slugToUrl(root, file) {
  const rel = path.relative(root, file).replace(/\.mdx$/, "");
  if (rel === "index") return "/";
  const parts = rel.split(path.sep);
  const trimmed = parts[parts.length - 1] === "index" ? parts.slice(0, -1) : parts;
  return "/" + trimmed.join("/");
}

function docRecords(root, versionId) {
  const docsDir = versionId ? path.join(root, versionId, "docs") : path.join(root, "docs");
  return walk(docsDir).map((file) => {
    const { data, content } = matter(fs.readFileSync(file, "utf8"));
    const rel = slugToUrl(docsDir, file); // "/" or "/quickstart"
    const url = versionId ? `/${versionId}${rel === "/" ? "" : rel}` : rel;
    const title = String(data.title ?? url);
    const lede = data.lede ? String(data.lede) + " " : "";
    return { url, title, content: lede + toPlainText(content), meta: versionId ? versionId : undefined };
  });
}

/** Non-default content prefix ids (versions + locales) declared in the config. */
function contentPrefixIds(root) {
  const env = process.env.MARKLINE_CONFIG;
  const branded = path.join(root, "markline.json");
  const configPath = env
    ? (path.isAbsolute(env) ? env : path.join(process.cwd(), env))
    : (fs.existsSync(branded) ? branded : path.join(root, "docs.json"));
  try {
    const cfg = JSON.parse(fs.readFileSync(configPath, "utf8"));
    const tail = (arr) => (Array.isArray(arr) && arr.length > 1 ? arr.slice(1).map((v) => v.id) : []);
    return [...tail(cfg.versions), ...tail(cfg.i18n?.locales)];
  } catch {
    return [];
  }
}

function slugifyOpId(method, pathStr) {
  return `${method}_${pathStr.replace(/[^a-zA-Z0-9]+/g, "_")}`.replace(/^_+|_+$/g, "");
}

function apiRecords(root) {
  const specFile = path.join(root, "api", "openapi.json");
  if (!fs.existsSync(specFile)) return [];
  const spec = JSON.parse(fs.readFileSync(specFile, "utf8"));
  const methods = ["get", "post", "put", "patch", "delete", "options", "head"];
  const records = [];
  for (const [pathStr, item] of Object.entries(spec.paths ?? {})) {
    for (const method of methods) {
      const op = item[method];
      if (!op) continue;
      const operationId = op.operationId ?? slugifyOpId(method, pathStr);
      const title = op.summary ?? operationId;
      const content = toPlainText(
        [op.summary, op.description, `${method.toUpperCase()} ${pathStr}`, (op.tags ?? []).join(" ")]
          .filter(Boolean)
          .join(" "),
      );
      records.push({ url: `/api-reference/${operationId}`, title, content, meta: "API reference" });
    }
  }
  return records;
}

/* ── llms.txt / llms-full.txt ──────────────────────────────────────────────
   Machine-readable docs for LLMs, written to public/ (served statically by any
   host, survives static export). llms.txt is the llmstxt.org index; llms-full
   concatenates every doc's Markdown for one-shot context. */

function loadJsonConfig(root) {
  const env = process.env.MARKLINE_CONFIG;
  const branded = path.join(root, "markline.json");
  const configPath = env
    ? (path.isAbsolute(env) ? env : path.join(process.cwd(), env))
    : (fs.existsSync(branded) ? branded : path.join(root, "docs.json"));
  try {
    return JSON.parse(fs.readFileSync(configPath, "utf8"));
  } catch {
    return {};
  }
}

/** MDX body → portable Markdown: drop import/export lines, collapse blank runs.
 *  (Authored components like <Note> stay — they read fine as context.) */
function mdxToMarkdown(md) {
  return md
    .replace(/^\s*import\s.*$/gm, "")
    .replace(/^\s*export\s.*$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function docPagesForLlms(root) {
  const docsDir = path.join(root, "docs");
  const map = new Map();
  for (const file of walk(docsDir)) {
    const { data, content } = matter(fs.readFileSync(file, "utf8"));
    const url = slugToUrl(docsDir, file);
    map.set(url, {
      url,
      title: String(data.title ?? url),
      lede: data.lede ? String(data.lede).trim() : "",
      body: mdxToMarkdown(content),
      layout: data.layout ?? "doc",
    });
  }
  return map;
}

/** Unique OpenAPI tags → resource-page links (the reference is per-tag). */
function apiResources(root) {
  const specFile = path.join(root, "api", "openapi.json");
  if (!fs.existsSync(specFile)) return [];
  const spec = JSON.parse(fs.readFileSync(specFile, "utf8"));
  const tags = new Map();
  for (const t of spec.tags ?? []) tags.set(t.name, t.description ? String(t.description).split("\n")[0].trim() : "");
  for (const item of Object.values(spec.paths ?? {})) {
    for (const op of Object.values(item)) {
      if (op && Array.isArray(op.tags)) for (const t of op.tags) if (!tags.has(t)) tags.set(t, "");
    }
  }
  const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  const pretty = (s) =>
    String(s).split("/").pop()
      .replace(/[-_]/g, " ").replace(/([a-z0-9])([A-Z])/g, "$1 $2")
      .split(/\s+/).filter(Boolean)
      .map((w) => w[0].toUpperCase() + w.slice(1).toLowerCase()).join(" ");
  return [...tags].map(([name, desc]) => ({ url: `/api-reference/${slug(name)}`, title: pretty(name), desc }));
}

function writeLlms(root) {
  const cfg = loadJsonConfig(root);
  const name = cfg.name ?? cfg.seo?.title ?? "Documentation";
  const desc = cfg.seo?.description ?? cfg.description ?? "";
  const base = String(cfg.seo?.metadataBase ?? process.env.MARKLINE_SITE_URL ?? "").replace(/\/$/, "");
  const abs = (u) => (base ? base + u : u);

  const docMap = docPagesForLlms(root);

  // Order docs by the documentation tab's nav groups; skip landing pages.
  const tabs = cfg.navigation?.tabs ?? [];
  const docTab = tabs.find((t) => !t.openapi) ?? tabs[0];
  const sections = [];
  const used = new Set();
  for (const g of docTab?.groups ?? []) {
    const pages = [];
    for (const p of g.pages ?? []) {
      const d = docMap.get(p.href);
      used.add(p.href);
      if (d && d.layout === "landing") continue;
      pages.push({ title: p.label ?? d?.title ?? p.href, url: p.href, lede: d?.lede ?? "" });
    }
    if (pages.length) sections.push({ group: g.group, pages });
  }
  const leftover = [...docMap.values()].filter((d) => !used.has(d.url) && d.layout !== "landing");
  const apis = apiResources(root);

  // ---- llms.txt (index) ----
  let idx = `# ${name}\n\n`;
  if (desc) idx += `> ${desc}\n\n`;
  for (const s of sections) {
    idx += `## ${s.group}\n\n`;
    for (const p of s.pages) idx += `- [${p.title}](${abs(p.url)})${p.lede ? `: ${p.lede}` : ""}\n`;
    idx += "\n";
  }
  if (leftover.length) {
    idx += `## More\n\n`;
    for (const d of leftover) idx += `- [${d.title}](${abs(d.url)})${d.lede ? `: ${d.lede}` : ""}\n`;
    idx += "\n";
  }
  if (apis.length) {
    idx += `## API reference\n\n`;
    idx += `- [API reference](${abs("/api-reference")}): interactive OpenAPI reference\n`;
    for (const a of apis) idx += `- [${a.title}](${abs(a.url)})${a.desc ? `: ${a.desc}` : ""}\n`;
    idx += "\n";
  }

  // ---- llms-full.txt (concatenated prose) ----
  const ordered = [
    ...sections.flatMap((s) => s.pages.map((p) => docMap.get(p.url)).filter(Boolean)),
    ...leftover,
  ];
  let full = `# ${name}\n\n`;
  if (desc) full += `> ${desc}\n\n`;
  for (const d of ordered) {
    full += `\n\n---\n\n# ${d.title}\n\n`;
    if (d.lede) full += `${d.lede}\n\n`;
    full += `${d.body}\n`;
  }

  const pub = path.join(process.cwd(), "public");
  fs.mkdirSync(pub, { recursive: true });
  fs.writeFileSync(path.join(pub, "llms.txt"), `${idx.trim()}\n`);
  fs.writeFileSync(path.join(pub, "llms-full.txt"), `${full.trim().replace(/\n{3,}/g, "\n\n")}\n`);
  const docCount = sections.reduce((n, s) => n + s.pages.length, 0) + leftover.length;
  console.log(`[markline] llms.txt (${docCount} docs, ${apis.length} API resources) + llms-full.txt -> public/`);
}

async function main() {
  const root = contentRoot();
  const prefixes = contentPrefixIds(root);
  const records = [
    ...docRecords(root),
    ...prefixes.flatMap((p) => docRecords(root, p)),
    ...apiRecords(root),
  ];

  const { index } = await pagefind.createIndex();
  for (const r of records) {
    await index.addCustomRecord({
      url: r.url,
      content: `${r.title}. ${r.content}`,
      language: "en",
      meta: { title: r.title, ...(r.meta ? { section: r.meta } : {}) },
    });
  }

  const outDir = path.join(process.cwd(), "public", "pagefind");
  fs.mkdirSync(outDir, { recursive: true });
  await index.writeFiles({ outputPath: outDir });
  await pagefind.close();

  console.log(`[markline] search index built: ${records.length} records -> public/pagefind`);

  writeLlms(root);
}

main().catch((err) => {
  console.error("[markline] search index failed:", err);
  process.exit(1);
});
