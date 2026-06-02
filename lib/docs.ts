import fs from "node:fs";
import path from "node:path";
import matter from "gray-matter";
import { contentRoot } from "./paths";

export type TocItem = { id: string; label: string };

export type DocFrontmatter = {
  title: string;
  lede?: string;
  toc?: TocItem[];
  last_updated?: string;
  crumbs?: { label: string; href?: string }[];
};

export type Doc = {
  slug: string[];          // [] for root /
  pathname: string;        // "/" or "/concepts/ledger"
  fm: DocFrontmatter;
  body: string;
  sourcePath: string;      // path of the source file relative to the content root
};

const ROOT = path.join(contentRoot(), "docs");

function readMdx(filePath: string): { fm: DocFrontmatter; body: string } {
  const raw = fs.readFileSync(filePath, "utf8");
  const { data, content } = matter(raw);
  const fm: DocFrontmatter = {
    title: String(data.title ?? ""),
    lede: data.lede ? String(data.lede) : undefined,
    toc: Array.isArray(data.toc) ? data.toc as TocItem[] : undefined,
    last_updated: data.last_updated ? String(data.last_updated) : undefined,
    crumbs: Array.isArray(data.crumbs) ? data.crumbs : undefined,
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

function slugFromFile(filePath: string): string[] {
  const rel = path.relative(ROOT, filePath).replace(/\.mdx$/, "");
  if (rel === "index") return [];
  const parts = rel.split(path.sep);
  return parts[parts.length - 1] === "index" ? parts.slice(0, -1) : parts;
}

export function listDocs(): Doc[] {
  if (!fs.existsSync(ROOT)) return [];
  return walk(ROOT).map((filePath) => {
    const slug = slugFromFile(filePath);
    const { fm, body } = readMdx(filePath);
    return {
      slug,
      pathname: slug.length === 0 ? "/" : `/${slug.join("/")}`,
      fm,
      body,
      sourcePath: path.relative(contentRoot(), filePath),
    };
  });
}

export function getDoc(slug: string[] | undefined): Doc | undefined {
  const s = slug ?? [];
  const candidates: string[] = [];
  if (s.length === 0) {
    candidates.push(path.join(ROOT, "index.mdx"));
  } else {
    candidates.push(path.join(ROOT, `${s.join(path.sep)}.mdx`));
    candidates.push(path.join(ROOT, s.join(path.sep), "index.mdx"));
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
  };
}
