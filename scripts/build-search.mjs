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

/** Non-default content prefix ids (versions + locales) declared in docs.json. */
function contentPrefixIds(root) {
  const configPath = process.env.MARKLINE_CONFIG
    ? (path.isAbsolute(process.env.MARKLINE_CONFIG) ? process.env.MARKLINE_CONFIG : path.join(process.cwd(), process.env.MARKLINE_CONFIG))
    : path.join(root, "docs.json");
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
}

main().catch((err) => {
  console.error("[markline] search index failed:", err);
  process.exit(1);
});
