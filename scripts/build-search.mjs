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
import { orderedResourceTags } from "./openapi-order.mjs";
import { searchGroups, searchTrails } from "./search-groups.mjs";
import { markdownPath, mdxToMarkdown, pageMarkdown, sectionIds, sectionIndex } from "./llms.mjs";
import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import remarkRehype from "remark-rehype";
import rehypeStringify from "rehype-stringify";

/** Read an env var, falling back to .env.local / .env (plain node script —
 *  Next's automatic env loading doesn't apply here). */
function readEnvVar(name) {
  if (process.env[name]) return process.env[name];
  for (const f of [".env.local", ".env"]) {
    try {
      const txt = fs.readFileSync(path.join(process.cwd(), f), "utf8");
      const m = txt.match(new RegExp(`^\\s*${name}\\s*=\\s*(.+?)\\s*$`, "m"));
      if (m) return m[1].replace(/^["']|["']$/g, "");
    } catch {
      // no such file — keep looking
    }
  }
  return undefined;
}

/** Read MARKLINE_CONTENT from the environment, falling back to .env.local / .env. */
function resolveContentEnv() {
  return readEnvVar("MARKLINE_CONTENT");
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
    .replace(/^[ \t]*[|:\-][ |:\-\t]*$/gm, " ") // table separator / divider rows (|---|, ---)
    .replace(/\|/g, " ")                        // remaining table cell pipes -> space
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
  const records = [];
  const methods = ["get", "post", "put", "patch", "delete", "options", "head"];
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

/* ── Changelog ──────────────────────────────────────────────────────────────
   <content>/changelog/*.mdx, one file per release (lib/changelog-core.ts has
   the same date and path rules for the pages). Entries go into search and the
   sitemap, and into an RSS feed at /changelog/rss.xml, written as a static
   file so it survives static export. Feeds need absolute links, so the feed is
   only written when seo.metadataBase (or MARKLINE_SITE_URL) is set. */

const ENTRY_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

function changelogEntries(root) {
  const dir = path.join(root, "changelog");
  if (!fs.existsSync(dir)) return [];
  const out = [];
  for (const name of fs.readdirSync(dir)) {
    if (!/\.mdx?$/.test(name)) continue;
    const { data, content } = matter(fs.readFileSync(path.join(dir, name), "utf8"));
    const fm = data.date instanceof Date ? data.date.toISOString().slice(0, 10) : typeof data.date === "string" ? data.date.trim().slice(0, 10) : "";
    const date = [fm, name.replace(/\.mdx?$/, "")].find((d) => ENTRY_DATE.test(d) && !Number.isNaN(Date.parse(`${d}T00:00:00Z`)));
    if (!date) continue; // the pages warn about these
    out.push({
      date,
      url: `/changelog/${date.replace(/-/g, "/")}`,
      title: typeof data.title === "string" && data.title.trim() ? data.title.trim() : "",
      tags: Array.isArray(data.tags) ? data.tags.filter((t) => typeof t === "string") : [],
      breaking: data.breaking === true,
      body: content,
    });
  }
  return out.sort((a, b) => (a.date < b.date ? 1 : -1));
}

const longDate = (d) =>
  new Date(`${d}T00:00:00Z`).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" });

function changelogRecords(root) {
  return changelogEntries(root).map((e) => ({
    url: e.url,
    title: e.title || `Changelog: ${longDate(e.date)}`,
    content: `${longDate(e.date)} ${e.breaking ? "Breaking change " : ""}${e.tags.join(" ")} ${toPlainText(e.body)}`,
    meta: "Changelog",
  }));
}

/** An entry's MDX as HTML for a feed reader: components are unwrapped to
 *  their text, and site-relative links made absolute. */
async function entryHtml(body, base) {
  const md = body.replace(/^\s*(import|export)\s.*$/gm, "").replace(/<\/?[A-Z][\w.]*[^>]*>/g, "");
  const html = String(await unified().use(remarkParse).use(remarkGfm).use(remarkRehype).use(rehypeStringify).process(md));
  return html.replace(/(href|src)="\//g, `$1="${base}/`);
}

async function writeChangelogFeed(root) {
  const entries = changelogEntries(root);
  const feedFile = path.join(process.cwd(), "public", "changelog", "rss.xml");
  if (!entries.length) {
    fs.rmSync(feedFile, { force: true }); // don't leave a stale feed behind
    return;
  }
  const cfg = loadJsonConfig(root);
  const base = String(cfg.seo?.metadataBase ?? process.env.MARKLINE_SITE_URL ?? "").replace(/\/$/, "");
  if (!base) {
    console.warn("[markline] changelog: no RSS feed (set seo.metadataBase so the feed can use absolute links)");
    fs.rmSync(feedFile, { force: true });
    return;
  }
  const name = cfg.name ?? "Docs";
  const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const cdata = (s) => `<![CDATA[${s.replace(/]]>/g, "]]]]><![CDATA[>")}]]>`;
  const rfc822 = (d) => new Date(`${d}T00:00:00Z`).toUTCString();
  const items = [];
  for (const e of entries.slice(0, 50)) {
    items.push(
      [
        "    <item>",
        `      <title>${esc(`${e.breaking ? "Breaking: " : ""}${e.title || longDate(e.date)}`)}</title>`,
        `      <link>${esc(base + e.url)}</link>`,
        `      <guid isPermaLink="true">${esc(base + e.url)}</guid>`,
        `      <pubDate>${rfc822(e.date)}</pubDate>`,
        ...[...(e.breaking ? ["Breaking"] : []), ...e.tags].map((t) => `      <category>${esc(t)}</category>`),
        `      <description>${cdata(await entryHtml(e.body, base))}</description>`,
        "    </item>",
      ].join("\n"),
    );
  }
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${esc(`${name} changelog`)}</title>
    <link>${esc(`${base}/changelog`)}</link>
    <description>${esc(`What's new in ${name}.`)}</description>
    <language>en</language>
    <lastBuildDate>${rfc822(entries[0].date)}</lastBuildDate>
    <atom:link href="${esc(`${base}/changelog/rss.xml`)}" rel="self" type="application/rss+xml" />
${items.join("\n")}
  </channel>
</rss>
`;
  fs.mkdirSync(path.dirname(feedFile), { recursive: true });
  fs.writeFileSync(feedFile, xml);
  console.log(`[markline] changelog: ${entries.length} entries, RSS -> public/changelog/rss.xml`);
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

/** Docs by URL. `versionId` reads a version's or locale's docs instead. */
function docPagesForLlms(root, versionId) {
  const docsDir = versionId ? path.join(root, versionId, "docs") : path.join(root, "docs");
  const map = new Map();
  for (const file of walk(docsDir)) {
    const { data, content } = matter(fs.readFileSync(file, "utf8"));
    const rel = slugToUrl(docsDir, file);
    const url = versionId ? `/${versionId}${rel === "/" ? "" : rel}` : rel;
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
  const descriptions = new Map();
  const labels = new Map(); // `x-displayName` (Redoc convention) wins over the derived title
  for (const t of spec.tags ?? []) {
    descriptions.set(t.name, t.description ? String(t.description).split("\n")[0].trim() : "");
    const label = typeof t["x-displayName"] === "string" ? t["x-displayName"].trim() : "";
    if (label) labels.set(t.name, label);
  }
  const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  const pretty = (s) =>
    String(s).split("/").pop()
      .replace(/[-_]/g, " ").replace(/([a-z0-9])([A-Z])/g, "$1 $2")
      .split(/\s+/).filter(Boolean)
      .map((w) => w[0].toUpperCase() + w.slice(1).toLowerCase()).join(" ");
  return orderedResourceTags(spec).map((name) => ({
    url: `/api-reference/${slug(name)}`,
    title: labels.get(name) ?? pretty(name),
    desc: descriptions.get(name) ?? "",
  }));
}

function writeLlms(root) {
  const cfg = loadJsonConfig(root);
  const name = cfg.name ?? cfg.seo?.title ?? "Documentation";
  const desc = cfg.seo?.description ?? cfg.description ?? "";
  const base = String(cfg.seo?.metadataBase ?? process.env.MARKLINE_SITE_URL ?? "").replace(/\/$/, "");
  const abs = (u) => (base ? base + u : u);

  const docMap = docPagesForLlms(root);

  // Order docs by the nav groups of every content tab (an OpenAPI tab has no
  // groups of its own). Walking only the first one dropped the pages of any
  // second content tab — e.g. a Guides tab — into the ungrouped "More" bucket.
  const tabs = cfg.navigation?.tabs ?? [];
  const docTabs = tabs.filter((t) => !t.openapi);
  const walkTabs = docTabs.length ? docTabs : tabs.slice(0, 1);
  // Group titles are only unique within a tab, so qualify them once there's
  // more than one tab in play ("Guides · Overview").
  const qualify = walkTabs.length > 1;
  const sections = [];
  const used = new Set();
  for (const tab of walkTabs) {
    for (const g of tab.groups ?? []) {
      const pages = [];
      // Sidebar items can nest (`pages` inside a page); list them depth first,
      // in sidebar order. Folders with no `href` contribute only their children.
      const flatten = (items) => (items ?? []).flatMap((p) => [...(p.href ? [p] : []), ...flatten(p.pages)]);
      for (const p of flatten(g.pages)) {
        const d = docMap.get(p.href);
        used.add(p.href);
        if (d && d.layout === "landing") continue;
        pages.push({ title: p.label ?? d?.title ?? p.href, url: p.href, lede: d?.lede ?? "" });
      }
      if (pages.length) sections.push({ group: qualify ? `${tab.label} · ${g.group}` : g.group, pages });
    }
  }
  const leftover = [...docMap.values()].filter((d) => !used.has(d.url) && d.layout !== "landing");
  const apis = apiResources(root);

  // ---- llms.txt (index) ----
  let idx = `# ${name}\n\n`;
  if (desc) idx += `> ${desc}\n\n`;
  idx += `This index lists the documentation. The full text of every page concatenated into one file is available at [llms-full.txt](${abs("/llms-full.txt")}).\n\n`;
  const sectionDocs = [...docMap.values()];
  const sectionList = sectionIds(sectionDocs).filter((id) => sectionIndex(cfg, sectionDocs, id));
  idx += `Add \`.md\` to any page's URL for its Markdown${sectionList.length ? `, and \`/llms.txt\` to a section's URL (such as [/${sectionList[0]}/llms.txt](${abs(`/${sectionList[0]}/llms.txt`)})) for an index of that section` : ""}.\n\n`;
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

  // ---- sitemap.xml + robots.txt ----
  // Written as static files (like llms.txt) so they survive `output: export`,
  // where Next strips `.ts` metadata routes. Sitemaps need absolute URLs, so a
  // sitemap is only written when seo.metadataBase is set.
  const xmlEsc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const pages = new Set([...docMap.keys()]);
  const changelog = changelogEntries(root);
  if (changelog.length) {
    pages.add("/changelog");
    for (const e of changelog) pages.add(e.url);
  }
  if (apis.length) {
    pages.add("/api-reference");
    for (const a of apis) pages.add(a.url);
  }
  if (base) {
    const urls = [...pages]
      .map((u) => `  <url>\n    <loc>${xmlEsc(base + u)}</loc>\n    <changefreq>weekly</changefreq>\n  </url>`)
      .join("\n");
    fs.writeFileSync(
      path.join(pub, "sitemap.xml"),
      `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`,
    );
  }
  fs.writeFileSync(
    path.join(pub, "robots.txt"),
    `User-agent: *\nAllow: /\n${base ? `\nSitemap: ${base}/sitemap.xml\n` : ""}`,
  );
  const docCount = sections.reduce((n, s) => n + s.pages.length, 0) + leftover.length;
  console.log(`[markline] llms.txt (${docCount} docs, ${apis.length} API resources) + llms-full.txt -> public/`);

  writeMarkdownFiles(root, cfg, { name, abs }, sectionList);
}

/* ── <page>.md and <section>/llms.txt ──────────────────────────────────────
   Each page's Markdown at its URL plus `.md`, and an llms.txt per top-level
   folder, written into public/ so they're plain files on any host. Their
   paths depend on the content, so the list is kept in a manifest and the
   previous build's files are removed first. A file the site's own public/
   already has is never overwritten. */

const MANIFEST = ".markline-generated.json";

function writeMarkdownFiles(root, cfg, opts, sectionList) {
  const pub = path.join(process.cwd(), "public");
  const manifestFile = path.join(pub, MANIFEST);
  let previous = [];
  try {
    previous = JSON.parse(fs.readFileSync(manifestFile, "utf8"));
  } catch {
    // first build
  }
  for (const rel of previous) fs.rmSync(path.join(pub, rel), { force: true });

  const written = [];
  const write = (rel, text) => {
    const file = path.join(pub, rel);
    if (fs.existsSync(file)) return; // the site's own file
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, text);
    written.push(rel);
  };

  const docs = [...docPagesForLlms(root).values()];
  const variants = contentPrefixIds(root).flatMap((id) => [...docPagesForLlms(root, id).values()]);
  for (const d of [...docs, ...variants]) {
    if (d.layout === "landing") continue;
    write(markdownPath(d.url).slice(1), pageMarkdown(d));
  }
  for (const id of sectionList) write(`${id}/llms.txt`, sectionIndex(cfg, docs, id, opts));

  fs.writeFileSync(manifestFile, JSON.stringify(written));
  const pages = written.filter((f) => f.endsWith(".md")).length;
  console.log(`[markline] ${pages} page .md files + ${written.length - pages} section llms.txt -> public/`);
}

/* ── ai-suggestions.json ───────────────────────────────────────────────────
   Per-page Ask-AI starter questions, generated at build time on the operator's
   key (opt-in: `ai.suggestions: true` + MARKLINE_AI_KEY). Written to public/
   as a static file the dock fetches at runtime — zero runtime AI cost, works
   on pure-static hosting. Pages are cached by content hash, so unchanged pages
   never re-call the provider on rebuilds. Heading-template generation was
   rejected on purpose: arbitrary docs headings produce embarrassing grammar. */

const AI_BASE_URLS = {
  openai: "https://api.openai.com/v1",
  openrouter: "https://openrouter.ai/api/v1",
  together: "https://api.together.xyz/v1",
  groq: "https://api.groq.com/openai/v1",
  fireworks: "https://api.fireworks.ai/inference/v1",
  local: "http://localhost:11434/v1",
};

async function generateQuestions({ baseUrl, key, model, provider, title, lede, body }) {
  const prompt =
    `You write starter questions for a documentation page's AI assistant. ` +
    `Given the page below, return a JSON array of exactly 3 short questions (each under 60 characters) ` +
    `a reader of THIS page would actually ask. Write them in the same language as the page. ` +
    `Return ONLY the JSON array, no prose.\n\n` +
    `Page title: ${title}\n${lede ? `Summary: ${lede}\n` : ""}\n${body.slice(0, 5000)}`;
  const headers = { Authorization: `Bearer ${key}`, "content-type": "application/json" };
  if (provider === "openrouter") headers["X-Title"] = "Markline build (ai-suggestions)";
  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      model,
      stream: false,
      // Generous cap: reasoning models (e.g. deepseek-flash) spend tokens on
      // hidden reasoning BEFORE the visible answer — a small cap yields
      // finish_reason=length with empty content.
      max_tokens: 1500,
      messages: [{ role: "user", content: prompt }],
    }),
    signal: AbortSignal.timeout(45000),
  });
  if (!res.ok) throw new Error(`provider ${res.status}`);
  const data = await res.json();
  const text = data?.choices?.[0]?.message?.content ?? "";
  if (!text.includes("[")) throw new Error(`no JSON array (finish=${data?.choices?.[0]?.finish_reason})`);
  const arr = JSON.parse(text.slice(text.indexOf("["), text.lastIndexOf("]") + 1));
  const qs = (Array.isArray(arr) ? arr : [])
    .filter((q) => typeof q === "string" && q.trim())
    .map((q) => q.trim().slice(0, 80))
    .slice(0, 3);
  if (!qs.length) throw new Error("no questions in response");
  return qs;
}

async function writeAiSuggestions(root) {
  const cfg = loadJsonConfig(root);
  const ai = cfg.ai;
  if (!ai?.enabled || ai.suggestions !== true) return; // opt-in only
  const key = readEnvVar("MARKLINE_AI_KEY");
  if (!key) {
    console.log("[markline] ai-suggestions: skipped (no MARKLINE_AI_KEY)");
    return;
  }
  const provider = ai.provider ?? "openai";
  const baseUrl = (ai.baseUrl ?? AI_BASE_URLS[provider] ?? "").replace(/\/$/, "");
  if (!baseUrl) {
    console.log("[markline] ai-suggestions: skipped (no base URL for provider)");
    return;
  }
  const model = ai.model ?? "gpt-4o-mini";

  const outFile = path.join(process.cwd(), "public", "ai-suggestions.json");
  let prev = {};
  try {
    prev = JSON.parse(fs.readFileSync(outFile, "utf8"));
  } catch {
    // first run — no cache
  }

  const { createHash } = await import("node:crypto");
  const pages = [...docPagesForLlms(root).values()].filter((d) => d.layout !== "landing");
  const out = {};
  let generated = 0, cached = 0, failed = 0;

  // Small concurrency pool — be polite to the provider.
  const queue = [...pages];
  const workers = Array.from({ length: 5 }, async () => {
    for (let d = queue.shift(); d; d = queue.shift()) {
      const h = createHash("sha1").update(`${d.title}\n${d.lede}\n${d.body}`).digest("hex").slice(0, 12);
      if (prev[d.url]?.h === h && prev[d.url]?.q?.length) {
        out[d.url] = prev[d.url];
        cached++;
        continue;
      }
      let q = null;
      for (let attempt = 0; attempt < 2 && !q; attempt++) {
        try {
          q = await generateQuestions({ baseUrl, key, model, provider, title: d.title, lede: d.lede, body: d.body });
        } catch (e) {
          if (attempt === 1) {
            failed++;
            if (failed <= 3) console.warn(`[markline] ai-suggestions: ${d.url} failed (${e.message ?? e})`);
            if (prev[d.url]?.q?.length) out[d.url] = prev[d.url]; // keep stale over nothing
          }
        }
      }
      if (q) {
        out[d.url] = { h, q };
        generated++;
      }
    }
  });
  await Promise.all(workers);

  fs.writeFileSync(outFile, JSON.stringify(out));
  console.log(`[markline] ai-suggestions.json: ${generated} generated, ${cached} cached, ${failed} failed -> public/`);
}

async function main() {
  const root = contentRoot();
  const prefixes = contentPrefixIds(root);
  const records = [
    ...docRecords(root),
    ...prefixes.flatMap((p) => docRecords(root, p)),
    ...apiRecords(root),
    ...changelogRecords(root),
  ];

  // Filter chips in the search dialog: each page's collection or sidebar group.
  const { order, byUrl } = searchGroups(loadJsonConfig(root));
  // Shown beside each result: where the page sits ("Agents › Persona").
  const trails = searchTrails(loadJsonConfig(root));
  const groupOf = (r) => byUrl.get(r.url) ?? (r.meta === "API reference" || r.meta === "Changelog" ? r.meta : undefined);
  if (records.some((r) => r.meta === "API reference")) order.push("API reference");
  if (records.some((r) => r.meta === "Changelog") && !order.includes("Changelog")) order.push("Changelog");

  const { index } = await pagefind.createIndex();
  for (const r of records) {
    const group = groupOf(r);
    await index.addCustomRecord({
      url: r.url,
      content: `${r.title}. ${r.content}`,
      language: "en",
      meta: { title: r.title, ...((r.meta ?? trails.get(r.url) ?? group) ? { section: r.meta ?? trails.get(r.url) ?? group } : {}) },
      ...(group ? { filters: { group: [group] } } : {}),
    });
  }

  const outDir = path.join(process.cwd(), "public", "pagefind");
  fs.mkdirSync(outDir, { recursive: true });
  await index.writeFiles({ outputPath: outDir });
  await pagefind.close();
  // Pagefind reports filter values unordered; the dialog shows them in sidebar order.
  fs.writeFileSync(path.join(outDir, "groups.json"), JSON.stringify(order));

  console.log(`[markline] search index built: ${records.length} records -> public/pagefind`);

  writeLlms(root);
  await writeChangelogFeed(root);
  await writeAiSuggestions(root);
}

main().catch((err) => {
  console.error("[markline] search index failed:", err);
  process.exit(1);
});
