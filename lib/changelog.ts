import fs from "node:fs";
import path from "node:path";
import matter from "gray-matter";
import { contentRoot } from "./paths";
import { entryDate } from "./changelog-core";

/**
 * The changelog's entries: one MDX file per release in `<content>/changelog/`,
 * newest first. A file without a usable date (frontmatter `date`, or a
 * `YYYY-MM-DD` name) is skipped with a warning.
 */
export type ChangelogEntry = {
  date: string;
  title?: string;
  tags: string[];
  /** Frontmatter `breaking: true`: the release needs readers to change something. */
  breaking: boolean;
  body: string;
};

let cache: ChangelogEntry[] | undefined;
const warned = new Set<string>();

export function changelogDir(): string {
  return path.join(contentRoot(), "changelog");
}

export function listChangelog(): ChangelogEntry[] {
  if (cache && process.env.NODE_ENV === "production") return cache;
  const dir = changelogDir();
  if (!fs.existsSync(dir)) return (cache = []);
  const entries: ChangelogEntry[] = [];
  for (const name of fs.readdirSync(dir)) {
    if (!/\.mdx?$/.test(name)) continue;
    const { data, content } = matter(fs.readFileSync(path.join(dir, name), "utf8"));
    const date = entryDate(data.date, name);
    if (!date) {
      if (!warned.has(name)) {
        warned.add(name);
        console.warn(`[markline] changelog/${name} has no date — name it YYYY-MM-DD.mdx or set \`date:\` in its frontmatter.`);
      }
      continue;
    }
    entries.push({
      date,
      title: typeof data.title === "string" && data.title.trim() ? data.title.trim() : undefined,
      tags: Array.isArray(data.tags) ? data.tags.filter((t: unknown) => typeof t === "string") : [],
      breaking: data.breaking === true,
      body: content,
    });
  }
  entries.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  return (cache = entries);
}

export function getChangelogEntry(date: string): ChangelogEntry | undefined {
  return listChangelog().find((e) => e.date === date);
}
