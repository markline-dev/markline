"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Wordmark } from "./landing/home/wordmark";

/**
 * Shared site header — the design's `.nav`, rendered ONCE in app/layout.tsx for
 * every route (Home, Docs, API reference). This is the single source of the
 * top chrome; the marketing home and the API reference no longer render their
 * own `<header class="nav">`. Styling is global (app/markline-tokens.css).
 *
 * - Brand lockup reuses <Wordmark/> (the blue m| mark + Cooper "Markline").
 * - Internal nav uses next/link <Link> → instant, client-side navigation.
 * - The theme toggle follows the framework contract: toggles data-theme + the
 *   .dark class and persists to localStorage 'docs-theme'.
 * - The GitHub badge + "Get started" CTA come from the config topbar.
 */

export type SiteNavLink = { label: string; href: string };
type Logo = { light?: string; dark?: string; text?: string };

export function SiteNav({
  brand,
  tabs,
  navLinks,
  githubUrl,
  stars,
  cta,
  width = "full",
  homeWidth = "contained",
}: {
  /** Brand lockup: a logo image and/or text from config. Falls back to the
   *  Markline <Wordmark/> when no logo is configured. */
  brand?: { name?: string; logo?: Logo };
  /** Primary nav links — the config navigation tabs (label + href). */
  tabs?: SiteNavLink[];
  /** Extra header links beyond the doc tabs (e.g. marketing anchors). */
  navLinks?: SiteNavLink[];
  /** Repo URL for the GitHub badge (from config topbar links). */
  githubUrl?: string;
  /** Optional star count shown in the badge. */
  stars?: string;
  /** Primary CTA (from config topbar.cta). */
  cta?: SiteNavLink;
  /** Topbar layout on docs + API reference. */
  width?: "full" | "contained";
  /** Topbar layout on the homepage ("/") — independent from `width`. */
  homeWidth?: "full" | "contained";
}) {
  const pathname = usePathname();
  // The homepage ("/") uses its own width knob; every other route uses `width`.
  const layout = pathname === "/" ? homeWidth : width;

  const isActive = (href: string) => {
    const path = href.split(/[#?]/)[0] || "/";
    if (path === "/") return pathname === "/";
    return pathname === path || pathname.startsWith(path + "/");
  };

  const logo = brand?.logo;
  const hasImg = !!(logo?.light || logo?.dark);
  const links = [...(tabs ?? []), ...(navLinks ?? [])];

  return (
    <header className="nav">
      <div className={`nav-in nav-in--${layout}`}>
        <Link className="brand" href="/" aria-label={`${brand?.name ?? "Markline"} home`}>
          {hasImg ? (
            <>
              <img className="brand-logo brand-logo--light" src={logo!.light ?? logo!.dark} alt={brand?.name ?? ""} />
              <img className="brand-logo brand-logo--dark" src={logo!.dark ?? logo!.light} alt={brand?.name ?? ""} />
            </>
          ) : logo?.text ? (
            <span className="brand-text">{logo.text}</span>
          ) : (
            <Wordmark />
          )}
        </Link>
        <nav className="nav-links">
          {links.map((l) => (
            <Link key={l.href + l.label} href={l.href} className={isActive(l.href) ? "active" : undefined}>
              {l.label}
            </Link>
          ))}
        </nav>
        <div className="nav-right">
          {githubUrl && (
            <a className="ghbadge" href={githubUrl} target="_blank" rel="noopener noreferrer">
              <svg width="15" height="15" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
                <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0016 8c0-4.42-3.58-8-8-8z" />
              </svg>
              {stars && (
                <>
                  <span className="star">★</span>
                  <span className="lbl">{stars}</span>
                </>
              )}
            </a>
          )}
          <ThemeBtn />
          {cta && (
            <Link className="btn btn-primary btn-sm" href={cta.href}>
              {cta.label}
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}

/** Theme toggle — framework contract (data-theme + .dark + localStorage). */
function ThemeBtn() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const toggle = () => {
    const html = document.documentElement;
    const next = html.getAttribute("data-theme") === "light" ? "dark" : "light";
    html.setAttribute("data-theme", next);
    html.classList.toggle("dark", next === "dark");
    try {
      localStorage.setItem("docs-theme", next);
    } catch {}
  };
  return (
    <button className="theme-btn" type="button" onClick={toggle} aria-label="Toggle theme" suppressHydrationWarning>
      <svg className="ico moon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden={!mounted}>
        <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
      </svg>
      <svg className="ico sun" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden={!mounted}>
        <circle cx="12" cy="12" r="4.2" />
        <path d="M12 2v2.4M12 19.6V22M4.2 4.2l1.7 1.7M18.1 18.1l1.7 1.7M2 12h2.4M19.6 12H22M4.2 19.8l1.7-1.7M18.1 5.9l1.7-1.7" />
      </svg>
    </button>
  );
}
