import { getHighlighter, shellEnhancer } from "@/lib/shiki";

// One transformer instance reused across all blocks — it's stateless.
const shellTransformer = shellEnhancer();

/** rehype-pretty-code options for docs pages and changelog entries. */
export const prettyCodeOptions = {
  theme: "markline-dark",
  keepBackground: false,
  defaultLang: "plaintext",
  bypassInlineCode: true,
  getHighlighter,
  // Apply the same shell flag / HTTP method re-coloring used by <CodeBlock> and
  // the API code panels. The transformer's tokens() hook decides per-token
  // whether to repaint, so applying it to all langs is safe (it only matches
  // CLI-flag / HTTP-method shapes).
  transformers: [shellTransformer],
} as const;
