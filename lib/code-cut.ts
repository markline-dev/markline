/**
 * A very long example, cut for its card: the first lines of its highlighted HTML,
 * so the page doesn't build thousands of lines of DOM that most readers never
 * scroll to. Pure, so it's tested. The whole code isn't put in the page twice:
 * the card's component has it already (it arrives as its prop), and registers it
 * here, so Copy, Expand and Markdown read all of it, and "Show all" swaps it in.
 */
export const CUT_LINES = 1000;

export type Cut = { html: string; shown: number; total: number };

/** Lines in `html`, not counting the empty one after a final newline (as the Expand dialog numbers them). */
export function lineCount(html: string): number {
  return html.split("\n").length - (html.endsWith("\n") ? 1 : 0);
}

const TAG = /<(\/?)([a-zA-Z][\w-]*)[^>]*?(\/?)>/g;

/**
 * The first `maxLines` lines of `html` when it has more, else null. Tags still
 * open at the cut (a span around a whole cURL body, a string over several lines)
 * are closed there, so the cut is always at the limit and its markup is whole.
 */
export function cutHtml(html: string, maxLines = CUT_LINES): Cut | null {
  const total = lineCount(html);
  if (total <= maxLines) return null;
  // The end of the last line kept.
  let end = -1;
  for (let i = 0; i < maxLines; i++) end = html.indexOf("\n", end + 1);
  const kept = html.slice(0, end);
  const open: string[] = [];
  for (const m of kept.matchAll(TAG)) {
    const [, closing, name, selfClosing] = m;
    if (selfClosing) continue;
    if (closing) {
      const at = open.lastIndexOf(name.toLowerCase());
      if (at >= 0) open.splice(at, 1);
    } else open.push(name.toLowerCase());
  }
  return { html: kept + open.reverse().map((n) => `</${n}>`).join(""), shown: maxLines, total };
}

/** Text of highlighted HTML: its tags dropped, its entities decoded (what Copy puts on the clipboard). */
export function htmlText(html: string): string {
  return html
    .replace(/<[^>]*>/g, "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&amp;/g, "&");
}

/* ── the whole code of a cut card, for Copy, Expand and Markdown ───────────── */

const whole = new Map<string, string>();

/** A cut card's whole HTML, under the id its `<pre data-code>` carries. */
export function registerCode(id: string, html: string): () => void {
  whole.set(id, html);
  return () => {
    if (whole.get(id) === html) whole.delete(id);
  };
}

type PreLike = { getAttribute(name: string): string | null; innerHTML: string; textContent: string | null };

/** All of a card's code as HTML: a cut card's whole code, else what the `<pre>` shows. */
export function fullCodeHtml(pre: PreLike): string {
  const id = pre.getAttribute("data-code");
  return (id && whole.get(id)) ?? pre.innerHTML;
}

/** All of a card's code as text. */
export function fullCodeText(pre: PreLike): string {
  const id = pre.getAttribute("data-code");
  const html = id ? whole.get(id) : undefined;
  return html !== undefined ? htmlText(html) : (pre.textContent ?? "");
}
