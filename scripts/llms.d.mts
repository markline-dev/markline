// Types for scripts/llms.mjs, which app/api/md and app/api/llms import.

export type LlmsDoc = { url: string; title: string; lede?: string; body: string; layout?: string };

export function mdxToMarkdown(md: string): string;
export function pageMarkdown(doc: Pick<LlmsDoc, "title" | "lede" | "body">): string;
export function markdownPath(url: string): string;
export function pathFromMarkdown(mdPath: string): string;
export function sectionIds(docs: Pick<LlmsDoc, "url">[]): string[];
export function sectionIndex(
  cfg: { navigation?: { tabs?: unknown[] } },
  docs: LlmsDoc[],
  section: string,
  opts?: { name?: string; abs?: (url: string) => string },
): string | undefined;
