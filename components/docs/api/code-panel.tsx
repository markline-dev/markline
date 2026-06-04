import { highlightToHtml } from "@/lib/shiki";
import { CodeTabs, ResponseTabs } from "@/components/docs/code-tabs";

type Snippet = { lang: string; label?: string; code: string };

const PRE_MAX = "min(60vh, 520px)";

/**
 * Server component: pre-highlights the cURL/TS/Python snippets and ships HTML
 * to the client tab component.
 */
export async function RequestPanel({ title, snippets }: { title: string; snippets: Snippet[] }) {
  const highlighted = await Promise.all(
    snippets.map(async (s) => ({
      lang: s.lang,
      label: s.label ?? s.lang,
      code: s.code,
      html: await highlightToHtml(s.code, s.lang),
    })),
  );
  return <CodeTabs title={title} snippets={highlighted} maxHeight={PRE_MAX} margin="0 0 20px" />;
}

export async function ResponsePanel({
  tabs,
}: {
  tabs: { status: string; description?: string; body: string }[];
}) {
  const highlighted = await Promise.all(
    tabs.map(async (t) => ({
      status: t.status,
      description: t.description,
      code: t.body,
      html: await highlightToHtml(t.body, "json"),
    })),
  );
  return <ResponseTabs tabs={highlighted} maxHeight={PRE_MAX} />;
}
