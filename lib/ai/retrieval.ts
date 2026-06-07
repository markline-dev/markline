/**
 * Client-side documentation retrieval for Ask AI.
 *
 * The model was previously handed only a section-name string ("you are viewing
 * the X section") and never any real page text, so it couldn't answer. This
 * grounds answers in actual docs:
 *   1. the full text of the page the reader is on (read from the DOM), and
 *   2. the most relevant pages for the question, ranked from the build-time
 *      `llms-full.txt` corpus with a lightweight BM25-style score.
 *
 * Pure client-side (one cached fetch of /llms-full.txt) — no server, no
 * embeddings — so it works in BYOK mode and on pure-static hosting. If
 * llms-full.txt is missing (older build), retrieval degrades to current-page
 * context only.
 */

export type DocSection = { title: string; body: string };
export type Retrieved = DocSection & { score: number };

const STOP = new Set(
  "the a an of to in is are and or for on with your you it this that be as at by from into how do does can will not what when which".split(" "),
);

/** Light stemmer: collapses common inflections so a query for "create a
 *  service" matches a page titled "Services" (plural) or text about "creating".
 *  Not linguistically perfect — it only needs query and docs to stem alike. */
function stem(w: string): string {
  if (w.length <= 3) return w;
  if (w.endsWith("ing") && w.length > 5) w = w.slice(0, -3);
  else if (w.endsWith("ed") && w.length > 4) w = w.slice(0, -2);
  else if (w.endsWith("s") && !w.endsWith("ss")) w = w.slice(0, -1);
  if (w.endsWith("e") && w.length > 3) w = w.slice(0, -1);
  return w;
}

function tokenize(s: string): string[] {
  return (s.toLowerCase().match(/[a-z0-9]+/g) ?? [])
    .filter((w) => w.length > 2 && !STOP.has(w))
    .map(stem);
}

let corpusPromise: Promise<DocSection[]> | null = null;

/** Fetch + parse /llms-full.txt once; cached for the session. */
export function loadDocsCorpus(basePath = ""): Promise<DocSection[]> {
  if (!corpusPromise) {
    corpusPromise = (async () => {
      try {
        const res = await fetch(`${basePath}/llms-full.txt`, { cache: "force-cache" });
        if (!res.ok) return [];
        return parseLlmsFull(await res.text());
      } catch {
        return [];
      }
    })();
  }
  return corpusPromise;
}

/** Split llms-full.txt into per-page sections. Pages are separated by a `---`
 *  rule and start with a `# Title` heading (see scripts/build-search.mjs). */
export function parseLlmsFull(text: string): DocSection[] {
  const out: DocSection[] = [];
  for (const part of text.split(/\n-{3,}\n/)) {
    const m = part.match(/^\s*#\s+(.+?)\s*\n([\s\S]*)$/);
    if (!m) continue;
    const title = m[1].trim();
    const body = m[2].trim();
    if (title && body) out.push({ title, body });
  }
  return out;
}

/** Rank corpus sections against the question (saturating tf · idf, title-boosted). */
export function retrieve(question: string, corpus: DocSection[], k = 3): Retrieved[] {
  const qTerms = tokenize(question);
  if (!qTerms.length || !corpus.length) return [];

  const df = new Map<string, number>();
  const docTokens = corpus.map((d) => {
    const toks = tokenize(`${d.title} ${d.body}`);
    for (const t of new Set(toks)) df.set(t, (df.get(t) ?? 0) + 1);
    return toks;
  });
  const N = corpus.length;

  const scored: Retrieved[] = corpus.map((d, i) => {
    const tf = new Map<string, number>();
    for (const t of docTokens[i]) tf.set(t, (tf.get(t) ?? 0) + 1);
    const titleToks = new Set(tokenize(d.title));
    let score = 0;
    for (const q of qTerms) {
      const f = tf.get(q) ?? 0;
      if (!f) continue;
      const idf = Math.log(1 + N / ((df.get(q) ?? 0) + 0.5));
      score += idf * (f / (f + 1.5)); // saturating term frequency
      if (titleToks.has(q)) score += idf * 0.9; // boost title matches
    }
    return { ...d, score };
  });

  return scored.filter((s) => s.score > 0).sort((a, b) => b.score - a.score).slice(0, k);
}

/** Read the current page's title + visible prose from the DOM (docs or apiref). */
export function currentPageText(maxChars = 6000): { title: string; text: string } | null {
  if (typeof document === "undefined") return null;
  const title = document.querySelector("h1")?.textContent?.trim() || document.title || "This page";
  const main = document.querySelector(".docs-prose, .api-doc, main");
  if (!main) return null;
  const text = (main.textContent || "").replace(/\s+/g, " ").trim().slice(0, maxChars);
  return text ? { title, text } : null;
}

/**
 * Assemble grounding context for a question: the current page first, then the
 * top retrieved pages (deduped). Returns the context string (capped) plus the
 * list of source titles actually used (for the "Used N sources" UI).
 */
export async function buildGroundingContext(
  question: string,
  opts: { basePath?: string; sectionHint?: string; maxChars?: number; k?: number } = {},
): Promise<{ context: string; sources: string[] }> {
  const { basePath = "", sectionHint, maxChars = 14000, k = 3 } = opts;
  const corpus = await loadDocsCorpus(basePath);
  const top = retrieve(question, corpus, k);
  const cur = currentPageText();

  const blocks: string[] = [];
  const sources: string[] = [];

  if (cur) {
    blocks.push(`# Current page: ${cur.title}\n\n${cur.text}`);
    sources.push(cur.title);
  }
  for (const t of top) {
    if (cur && t.title.toLowerCase() === cur.title.toLowerCase()) continue; // already included
    blocks.push(`# ${t.title}\n\n${t.body}`);
    if (!sources.includes(t.title)) sources.push(t.title);
  }

  let context = blocks.join("\n\n---\n\n");
  if (sectionHint && !cur) context = `The reader is on the "${sectionHint}" page.\n\n${context}`;
  if (context.length > maxChars) context = context.slice(0, maxChars) + "\n\n[context truncated]";

  return { context, sources: sources.slice(0, 4) };
}
