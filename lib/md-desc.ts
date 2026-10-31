import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import remarkRehype from "remark-rehype";
import rehypeSanitize from "rehype-sanitize";
import rehypeStringify from "rehype-stringify";

// Descriptions come from the OpenAPI spec and are injected via
// dangerouslySetInnerHTML, so the output is sanitized: raw HTML in the source
// is already dropped (no rehype-raw), and rehype-sanitize's default (GitHub)
// schema strips unsafe URL schemes like `javascript:` while keeping the
// elements GFM produces (links, code, tables, lists).
const mdProcessor = unified()
  .use(remarkParse)
  .use(remarkGfm)
  .use(remarkRehype)
  .use(rehypeSanitize)
  .use(rehypeStringify);

/** Render markdown from spec descriptions to sanitized HTML. Unwraps single paragraphs to keep inline flow. */
export function mdToHtml(s: string): string;
export function mdToHtml(s?: string): string | undefined;
export function mdToHtml(s?: string): string | undefined {
  if (!s) return s;
  try {
    const html = String(mdProcessor.processSync(s)).trim();
    const m = html.match(/^<p>([\s\S]*)<\/p>$/);
    return m && !m[1].includes("<p>") ? m[1] : html;
  } catch {
    return s;
  }
}

/**
 * Plain-text rendition of a markdown description, for `meta`/OG/Twitter tags.
 * Renders the markdown and strips the markup, so constructs that carry their
 * meaning in the syntax (`code`, [links](url), **bold**) degrade to their text
 * instead of reaching a search snippet raw. Collapsed to one line and truncated
 * on a word boundary.
 */
export function mdToText(s: string, max?: number): string;
export function mdToText(s?: string, max?: number): string | undefined;
export function mdToText(s?: string, max = 160): string | undefined {
  if (!s) return s;
  const text = (mdToHtml(s) ?? "")
    .replace(/<[^>]+>/g, " ")
    // Decode after tag-stripping, and &amp; last, so a literal "&lt;b&gt;" in
    // the source can't reappear as a tag.
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#(?:39|x27);/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    // Tags become spaces so block boundaries still separate words, which leaves
    // a gap where an inline tag closed before punctuation (`code`. → "code .").
    .replace(/\s+([,.;:!?)\]])/g, "$1")
    .replace(/([(\[])\s+/g, "$1")
    .trim();
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const sp = cut.lastIndexOf(" ");
  return (sp > max * 0.6 ? cut.slice(0, sp) : cut).replace(/[\s,;:.]+$/, "") + "…";
}
