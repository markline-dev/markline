/**
 * A long example, cut for its card: the first lines of its highlighted HTML,
 * whole lines only, so what shows still reads as the code it is (no string or
 * object cut off mid-way) and every tag it opens is closed. Pure, so it's tested.
 * The card keeps the whole code beside it for Copy and Expand.
 */
export const CUT_LINES = 200;
export const CUT_BYTES = 64 * 1024;

export type Cut = { html: string; shown: number; total: number };

/** Opening tags minus closing ones in `s` (void tags don't occur in highlighted code). */
const depth = (s: string) => (s.match(/<[a-zA-Z][^>]*>/g)?.length ?? 0) - (s.match(/<\/[a-zA-Z][^>]*>/g)?.length ?? 0);

/**
 * The first lines of `html` when it's over `maxLines` lines or `maxBytes`
 * characters, else null. Stops at a line where every tag opened so far is
 * closed; if no such line comes before the end, it isn't cut.
 */
export function cutHtml(html: string, maxLines = CUT_LINES, maxBytes = CUT_BYTES): Cut | null {
  const lines = html.split("\n");
  if (lines.length <= maxLines && html.length <= maxBytes) return null;
  let open = 0;
  let size = 0;
  let end = 0; // lines kept, at the last balanced point within the limits
  for (let i = 0; i < lines.length; i++) {
    open += depth(lines[i]);
    size += lines[i].length + 1;
    if (i + 1 > maxLines || size > maxBytes) break;
    if (open === 0) end = i + 1;
  }
  if (end === 0 || end >= lines.length) return null;
  return { html: lines.slice(0, end).join("\n"), shown: end, total: lines.length };
}
