import Link from "next/link";
import { loadConfig } from "@/lib/config";
import { SiteCredit } from "@/components/site-credit";

/**
 * Global 404. Rendered inside the root layout (so the shared <SiteNav/> is
 * present). Wrapped in `.docs-shell` so the design-token aliases resolve, and
 * carries the same "built with Markline" credit footer as every other page.
 */
export default function NotFound() {
  const config = loadConfig();
  return (
    <div className="docs-shell ml-notfound">
      <main className="nf">
        <div className="nf-code" aria-hidden="true">404</div>
        <h1 className="nf-h">This page could not be found.</h1>
        <p className="nf-sub">
          The page you’re looking for doesn’t exist or may have moved.
        </p>
        <div className="nf-cta">
          <Link className="nf-btn" href="/">
            Back to home
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true">
              <path d="M5 12h14M13 6l6 6-6 6" />
            </svg>
          </Link>
        </div>
      </main>
      <SiteCredit name={config.name} year={new Date().getFullYear()} />
    </div>
  );
}
