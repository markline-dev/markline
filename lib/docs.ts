import fs from "node:fs";
import path from "node:path";
import matter from "gray-matter";
import { contentRoot } from "./paths";
import { loadConfig, contentPrefixIds } from "./config";

export type TocItem = { id: string; label: string };

export type DocFrontmatter = {
  title: string;
  lede?: string;
  toc?: TocItem[];
  last_updated?: string;
  crumbs?: { label: string; href?: string }[];
  /** Page layout: "doc" (default, sidebar+TOC) or "landing" (full-width marketing). */
  layout?: "doc" | "landing";
};

export type Doc = {
  slug: string[];          // [] for root /
  pathname: string;        // "/" or "/concepts/ledger"
  fm: DocFrontmatter;
  body: string;
  sourcePath: string;      // path of the source file relative to the content root
  variant?: string;        // non-default version/locale id, when this doc belongs to one
};

/** Docs root for a content variant (version or locale). The default lives at <root>/docs. */
function docsRoot(variantId?: string): string {
  return variantId
    ? path.join(contentRoot(), variantId, "docs")
    : path.join(contentRoot(), "docs");
}

function readMdx(filePath: string): { fm: DocFrontmatter; body: string } {
  const raw = fs.readFileSync(filePath, "utf8");
  const { data, content } = matter(raw);
  const fm: DocFrontmatter = {
    title: String(data.title ?? ""),
    lede: data.lede ? String(data.lede) : undefined,
    toc: Array.isArray(data.toc) ? data.toc as TocItem[] : undefined,
    last_updated: data.last_updated ? String(data.last_updated) : undefined,
    crumbs: Array.isArray(data.crumbs) ? data.crumbs : undefined,
    layout: data.layout === "landing" ? "landing" : undefined,
  };
  return { fm, body: content };
}

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(p));
    else if (entry.isFile() && entry.name.endsWith(".mdx")) out.push(p);
  }
  return out;
}

/** Relative slug within a version's docs root ([] for its index). */
function slugFromFile(root: string, filePath: string): string[] {
  const rel = path.relative(root, filePath).replace(/\.mdx$/, "");
  if (rel === "index") return [];
  const parts = rel.split(path.sep);
  return parts[parts.length - 1] === "index" ? parts.slice(0, -1) : parts;
}

function listVariantDocs(variantId?: string): Doc[] {
  const root = docsRoot(variantId);
  if (!fs.existsSync(root)) return [];
  return walk(root).map((filePath) => {
    const rel = slugFromFile(root, filePath);
    const slug = variantId ? [variantId, ...rel] : rel;
    const { fm, body } = readMdx(filePath);
    return {
      slug,
      pathname: slug.length === 0 ? "/" : `/${slug.join("/")}`,
      fm,
      body,
      sourcePath: path.relative(contentRoot(), filePath),
      variant: variantId,
    };
  });
}

export function listDocs(): Doc[] {
  const prefixes = contentPrefixIds(loadConfig());
  return [listVariantDocs(undefined), ...prefixes.map((p) => listVariantDocs(p))].flat();
}

export function getDoc(slug: string[] | undefined): Doc | undefined {
  const s = slug ?? [];
  const prefixes = contentPrefixIds(loadConfig());
  const variantId = s.length > 0 && prefixes.includes(s[0]) ? s[0] : undefined;
  const rest = variantId ? s.slice(1) : s;
  const root = docsRoot(variantId);

  const candidates: string[] = [];
  if (rest.length === 0) {
    candidates.push(path.join(root, "index.mdx"));
  } else {
    candidates.push(path.join(root, `${rest.join(path.sep)}.mdx`));
    candidates.push(path.join(root, rest.join(path.sep), "index.mdx"));
  }
  const found = candidates.find((c) => fs.existsSync(c));
  if (!found) return undefined;
  const { fm, body } = readMdx(found);
  return {
    slug: s,
    pathname: s.length === 0 ? "/" : `/${s.join("/")}`,
    fm,
    body,
    sourcePath: path.relative(contentRoot(), found),
    variant: variantId,
  };
}
