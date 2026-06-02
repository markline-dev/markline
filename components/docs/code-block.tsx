import { highlightToHtml } from "@/lib/shiki";
import { CodeTabs, type HighlightedSnippet } from "./code-tabs";

export type CodeSnippet = { lang: string; label?: string; code: string };

/**
 * Server component: pre-highlights every snippet with Shiki, then hands the
 * HTML off to a small client component that owns the tab state.
 */
export async function CodeBlock({ snippets }: { snippets: CodeSnippet[] }) {
  const highlighted: HighlightedSnippet[] = await Promise.all(
    snippets.map(async (s) => ({
      lang: s.lang,
      label: s.label ?? s.lang,
      code: s.code,
      html: await highlightToHtml(s.code, s.lang),
    })),
  );
  return <CodeTabs snippets={highlighted} />;
}
