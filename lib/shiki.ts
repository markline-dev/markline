import { createHighlighter, type Highlighter, type ShikiTransformer } from "shiki";
import { marklineDark } from "./shiki-theme";

// Shared bundle-aware highlighter. Single instance, cached across server
// renders. Used by:
//   - rehype-pretty-code for MDX fenced blocks (app/[[...slug]]/page.tsx)
//   - highlightToHtml() below for <CodeBlock> and the API code/response panels
let _highlighter: Highlighter | undefined;

export const SHIKI_LANGS = [
  "bash", "shell", "sh", "console",
  "json", "yaml", "toml", "diff",
  "python", "javascript", "typescript", "tsx", "jsx",
  "go", "rust", "zig", "c", "cpp", "java", "ruby", "php", "sql",
  "html", "css", "markdown", "mdx", "plaintext",
] as const;

export async function getHighlighter(): Promise<Highlighter> {
  if (!_highlighter) {
    _highlighter = await createHighlighter({
      themes: [marklineDark],
      langs: SHIKI_LANGS as unknown as string[],
    });
  }
  return _highlighter;
}

// Map our friendly tab labels to Shiki grammars.
const LANG_ALIASES: Record<string, string> = {
  curl: "bash",
  shell: "bash",
  sh: "bash",
  node: "typescript",
  ts: "typescript",
  js: "javascript",
  py: "python",
};

function resolveLang(lang: string): string {
  return LANG_ALIASES[lang] ?? lang;
}

// Bash's TextMate grammar lacks specific scopes for CLI flags (`--header`,
// `-H`) and HTTP methods (`GET`, `POST`), so they land in
// `string.unquoted.shell` alongside arbitrary words. This transformer re-paints
// those tokens post-tokenization so flags and methods stand out from URLs and
// string arguments.
const FLAG_COLOR   = "#73A9F4"; // light blue (matches FUNCTION in shiki-theme)
const METHOD_COLOR = "#C678DD"; // magenta keyword color

const FLAG_RE   = /^--?[A-Za-z][\w-]*$/;
const METHOD_RE = /^(GET|POST|PUT|PATCH|DELETE|OPTIONS|HEAD)$/;

const SHELL_LANGS = new Set(["bash", "shell", "sh", "console", "ansi"]);

export function shellEnhancer(): ShikiTransformer {
  return {
    name: "markline-shell-enhancer",
    tokens(lines) {
      // `this.options.lang` is the resolved grammar name for this block.
      const lang = (this as unknown as { options?: { lang?: string } }).options?.lang ?? "";
      if (!SHELL_LANGS.has(lang)) return;
      for (const line of lines) {
        for (const tok of line) {
          const t = tok.content.trim();
          if (!t) continue;
          if (FLAG_RE.test(t)) tok.color = FLAG_COLOR;
          else if (METHOD_RE.test(t)) tok.color = METHOD_COLOR;
        }
      }
    },
  };
}

/**
 * Highlight a code string to HTML using the shared Shiki theme. Returns just
 * the inner spans (no outer <pre>/<code>) so callers can wrap the markup in
 * their own panel chrome.
 */
export async function highlightToHtml(code: string, lang: string): Promise<string> {
  const hl = await getHighlighter();
  const resolved = resolveLang(lang);
  const grammars = new Set(hl.getLoadedLanguages());
  const final = grammars.has(resolved) ? resolved : "plaintext";

  const html = hl.codeToHtml(code, {
    lang: final,
    theme: "markline-dark",
    transformers: [shellEnhancer()],
  });

  return html
    .replace(/^<pre[^>]*><code[^>]*>/, "")
    .replace(/<\/code><\/pre>$/, "");
}
