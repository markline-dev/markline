import Link from "next/link";

/**
 * Chrome for `content/api/introduction.mdx`. Identical layout to the
 * default `ApiIntroPage` so authored intros sit in the same shell.
 */
export function ApiIntroMdxPage({ children }: { children: React.ReactNode }) {
  return (
    <>
      <main className="api-main px-12 pt-8 pb-24 api-main-pad">
        <style>{`@media (max-width: 720px) { .api-main-pad { padding-left: 20px !important; padding-right: 20px !important; } }`}</style>

        <nav className="font-mono text-12 text-slate-5 mb-4">
          <Link href="/" className="text-slate-5 no-underline hover:text-ink">Docs</Link>
          <span className="mx-2 text-slate-4">/</span>
          <span className="text-ink">API reference</span>
        </nav>

        <div className="docs-prose">{children}</div>
      </main>
      <aside />
    </>
  );
}
