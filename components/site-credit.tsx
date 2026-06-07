import Link from "next/link";

/**
 * "Built with Markline" credit footer — rendered at the foot of every page
 * (docs, API reference, 404). The homepage has its own full <footer> and uses
 * the matching `.footer-bottom .credit-built` treatment instead of this.
 *
 * Presentational only (no hooks), so it renders inside both server trees (the
 * docs shell) and client trees (the API reference). It must sit INSIDE a
 * surface container (.docs-shell / .ml-apiref) so the alias design tokens
 * (--line, --mono, --ink-4, …) resolve for the active surface + theme.
 */
export function SiteCredit({ name, year }: { name: string; year: number }) {
  return (
    <footer className="site-credit">
      <span>
        © {year} <Link href="/">{name}</Link>
      </span>
      <span className="credit-built">
        <Heart />
        built with{" "}
        <a href="https://markline.dev" target="_blank" rel="noopener noreferrer">
          Markline
        </a>
      </span>
    </footer>
  );
}

/** Heart glyph used in the credit (matches the design handoff). */
export function Heart() {
  return (
    <svg className="heart" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <path d="M8 14.25l-.97-.88C3.6 10.27 1.5 8.36 1.5 6.02 1.5 4.1 3 2.6 4.92 2.6c1.08 0 2.12.5 2.8 1.3l.28.33.28-.33a3.66 3.66 0 0 1 2.8-1.3c1.92 0 3.42 1.5 3.42 3.42 0 2.34-2.1 4.25-5.53 7.36L8 14.25z" />
    </svg>
  );
}
