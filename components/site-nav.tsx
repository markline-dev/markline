"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { Wordmark } from "./landing/home/wordmark";
import { variantOf, variantPath, type Variants } from "@/lib/variant-path";
import { BANNER_KEY } from "@/lib/banner";

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

// Loaded only on pages that have no search dialog of their own (home,
// landing pages, 404), so the docs bundle isn't duplicated into every page.
const FallbackSearch = dynamic(() => import("./docs/search").then((m) => m.DocsSearch), { ssr: false });

export type SiteNavLink = { label: string; href: string };
type NavTabLink = SiteNavLink & { match?: string[] };
export type SiteNavMenu = { label: string; items: (SiteNavLink & { description?: string })[] };
export type SiteNavItem = SiteNavLink | SiteNavMenu;
export type SiteBannerData = {
  text: string;
  link?: SiteNavLink;
  dismissible: boolean;
  tone: "neutral" | "brand";
  id: string;
};

const isMenu = (i: SiteNavItem): i is SiteNavMenu => "items" in i;
const external = (href: string) => /^[a-z][a-z0-9+.-]*:/i.test(href);

/** A link that opens other sites in a new tab. */
function NavHref({ link, className, onClick, children }: {
  link: SiteNavLink; className?: string; onClick?: () => void; children?: React.ReactNode;
}) {
  return external(link.href) ? (
    <a className={className} href={link.href} target="_blank" rel="noopener noreferrer" onClick={onClick}>
      {children ?? link.label}
    </a>
  ) : (
    <Link className={className} href={link.href} onClick={onClick}>{children ?? link.label}</Link>
  );
}

type Logo = { light?: string; dark?: string; text?: string };

export function SiteNav({
  brand,
  tabs: defaultTabs,
  variants,
  tabsByVariant,
  navLinks,
  links: extraLinks = [],
  githubUrl,
  badge,
  stars,
  cta,
  secondaryCta,
  banner,
  width = "full",
  homeWidth = "contained",
  header = "single",
  search = "sidebar",
}: {
  /** Brand lockup: a logo image and/or text from config. Falls back to the
   *  Markline <Wordmark/> when no logo is configured. */
  brand?: { name?: string; logo?: Logo };
  /** Primary nav links — the config navigation tabs. */
  tabs?: NavTabLink[];
  /** `versions` or `i18n.locales`: shows a switcher and picks each one's tabs. */
  variants?: Variants | null;
  /** The tabs of each version or locale, by id. */
  tabsByVariant?: Record<string, NavTabLink[]>;
  /** Extra header links beyond the doc tabs (e.g. marketing anchors). */
  navLinks?: SiteNavLink[];
  /** topbar.links other than GitHub: links and dropdowns on the right. */
  links?: SiteNavItem[];
  /** Repo URL for the GitHub badge (from config topbar links). */
  githubUrl?: string;
  /** topbar.badge: a short label beside the logo, e.g. "Docs". */
  badge?: string;
  /** Optional star count shown in the badge. */
  stars?: string;
  /** Primary CTA (from config topbar.cta). */
  cta?: SiteNavLink;
  /** An outlined button before the CTA (topbar.secondaryCta). */
  secondaryCta?: SiteNavLink;
  /** topbar.banner, unless it had expired at build time. */
  banner?: SiteBannerData;
  /** Topbar layout on docs + API reference. */
  width?: "full" | "contained";
  /** Topbar layout on the homepage ("/") — independent from `width`. */
  homeWidth?: "full" | "contained";
  /** layout.header: tabs on the logo row, or on a row of their own. */
  header?: "single" | "stacked";
  /** layout.search: "header" puts the search box in the topbar. */
  search?: "sidebar" | "header";
}) {
  const pathname = usePathname();
  const tabs = (variants && tabsByVariant?.[variantOf(pathname, variants)]) || defaultTabs;
  // The homepage ("/") uses its own width knob; every other route uses `width`.
  const layout = pathname === "/" ? homeWidth : width;
  const [menuOpen, setMenuOpen] = useState(false);
  // Mirror body.docnav-open: the drawer is also closed from outside this
  // component (scrim, sidebar links), so the burger reads its state back
  // instead of tracking it locally.
  const [drawerOpen, setDrawerOpen] = useState(false);
  const expanded = menuOpen || drawerOpen;

  useEffect(() => {
    const body = document.body;
    const sync = () => setDrawerOpen(body.classList.contains("docnav-open"));
    sync();
    const mo = new MutationObserver(sync);
    mo.observe(body, { attributes: true, attributeFilter: ["class"] });
    return () => mo.disconnect();
  }, []);

  // Esc closes whichever menu is open.
  useEffect(() => {
    if (!expanded) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setMenuOpen(false);
      document.body.classList.remove("docnav-open");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [expanded]);

  // Close the mobile menu / page drawer whenever the route changes.
  useEffect(() => {
    setMenuOpen(false);
    document.body.classList.remove("docnav-open");
  }, [pathname]);

  // Mobile menu button. Pages that ship a sidebar drawer (docs shell, API
  // reference) use the shared body.docnav-open contract; pages without one
  // (home, 404) fall back to the SiteNav's own dropdown panel with the links.
  const onBurger = () => {
    if (document.querySelector(".docs-side, .api-side")) {
      setMenuOpen(false);
      document.body.classList.toggle("docnav-open");
      return;
    }
    document.body.classList.remove("docnav-open");
    setMenuOpen((v) => !v);
  };

  const isActive = (href: string) => {
    const path = href.split(/[#?]/)[0] || "/";
    if (path === "/") return pathname === "/";
    return pathname === path || pathname.startsWith(path + "/");
  };

  const logo = brand?.logo;
  const hasImg = !!(logo?.light || logo?.dark);
  const links = [...(tabs ?? []), ...(navLinks ?? [])];
  const activeTab = pickActiveTab(tabs ?? [], pathname);
  // Tabs follow their `match` rules; extra nav links compare hrefs. Shared by
  // the header links and the mobile panel so both mark the same link.
  const isCurrent = (l: SiteNavLink) => ((tabs ?? []).includes(l) ? l === activeTab : isActive(l.href));
  const stacked = header === "stacked";

  const linksNav = (
    <nav className="nav-links">
      {links.map((l) => (
        <Link
          key={l.href + l.label}
          href={l.href}
          className={isCurrent(l) ? "active" : undefined}
        >
          {l.label}
        </Link>
      ))}
    </nav>
  );

  return (
    <header className={`nav${stacked ? " nav--stacked" : ""}`}>
      {banner && <SiteBanner banner={banner} />}
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
        {badge && <span className="nav-badge">{badge}</span>}
        {!stacked && linksNav}
        {search === "header" && <HeaderSearch pathname={pathname} />}
        <div className="nav-right">
          {extraLinks.length > 0 && (
            <nav className="nav-extra" aria-label="More">
              {extraLinks.map((l) =>
                isMenu(l) ? (
                  <NavMenu key={l.label} menu={l} pathname={pathname} />
                ) : (
                  <NavHref key={l.href + l.label} link={l} className="nav-xlink" />
                ),
              )}
            </nav>
          )}
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
          {variants && variants.entries.length > 1 && <VariantSwitcher variants={variants} pathname={pathname} />}
          <ThemeBtn />
          {secondaryCta && <NavHref link={secondaryCta} className="btn btn-ghost btn-sm nav-cta2" />}
          {cta && (
            <Link className="btn btn-primary btn-sm" href={cta.href}>
              {cta.label}
            </Link>
          )}
          <button
            className="nav-burger"
            type="button"
            onClick={onBurger}
            aria-label={expanded ? "Close menu" : "Open menu"}
            aria-expanded={expanded}
          >
            {expanded ? (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                <path d="M4 7h16M4 12h16M4 17h16" />
              </svg>
            )}
          </button>
        </div>
      </div>
      {stacked && (
        <div className="nav-tabs">
          <div className={`nav-in nav-in--${layout} nav-tabs-in`}>{linksNav}</div>
        </div>
      )}
      {menuOpen && (
        <div className="nav-mobile-panel">
          {links.map((l) => (
            <Link
              key={l.href + l.label}
              href={l.href}
              className={isCurrent(l) ? "active" : undefined}
              onClick={() => setMenuOpen(false)}
            >
              {l.label}
            </Link>
          ))}
          {extraLinks.flatMap((l) => (isMenu(l) ? l.items : [l])).map((l) => (
            <NavHref key={"x" + l.href + l.label} link={l} onClick={() => setMenuOpen(false)} />
          ))}
          {secondaryCta && <NavHref link={secondaryCta} onClick={() => setMenuOpen(false)} />}
          {cta && (
            <Link className="btn btn-primary btn-sm" href={cta.href} onClick={() => setMenuOpen(false)}>
              {cta.label}
            </Link>
          )}
        </div>
      )}
    </header>
  );
}

/**
 * The tab the current page belongs to, using each tab's `match` prefixes the
 * same way the docs sidebar does — so a "Documentation" tab whose href is "/"
 * still reads as current on /quickstart. Tabs without `match` fall back to
 * comparing hrefs. On the homepage only a tab linking to "/" is current.
 */
function pickActiveTab<T extends SiteNavLink & { match?: string[] }>(tabs: T[], pathname: string): T | undefined {
  const under = (p: string) => pathname === p || pathname.startsWith(p.replace(/\/$/, "") + "/");
  if (pathname === "/") return tabs.find((t) => t.href === "/");
  const explicit = tabs.find((t) => t.match?.some((m) => m !== "__default__" && under(m)));
  if (explicit) return explicit;
  const byHref = tabs.find((t) => !t.match?.length && t.href !== "/" && under(t.href.split(/[#?]/)[0]));
  if (byHref) return byHref;
  return tabs.find((t) => t.match?.includes("__default__"));
}

/**
 * The topbar search box (layout.search: "header"). Docs pages and the API
 * reference each mount their own search dialog, so the box asks whichever one
 * the page has. Pages with neither get a docs search mounted here instead —
 * only there, so ⌘K never opens two dialogs at once.
 */
function HeaderSearch({ pathname }: { pathname: string }) {
  const [needsFallback, setNeedsFallback] = useState(false);
  useEffect(() => {
    // Re-check after each navigation, once the new page has rendered.
    setNeedsFallback(!document.querySelector(".docs-shell, .ml-apiref"));
  }, [pathname]);

  const open = () => {
    const inApiRef = !!document.querySelector(".ml-apiref");
    window.dispatchEvent(new CustomEvent(inApiRef ? "ml-search-open" : "ml-docs-search-open"));
  };

  return (
    <>
      <button type="button" className="nav-search" onClick={open} aria-label="Search">
        <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
          <circle cx="11" cy="11" r="7" />
          <path d="m21 21-4.3-4.3" />
        </svg>
        <span className="lbl">Search</span>
        <span className="kbd">⌘K</span>
      </button>
      {needsFallback && <FallbackSearch triggerless />}
    </>
  );
}

const GlobeIcon = (
  <svg className="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
    <circle cx="12" cy="12" r="9" />
    <path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" />
  </svg>
);

/**
 * The version or language picker. Picking one goes to the same page there,
 * or to that version's or language's home page when the page doesn't exist
 * in it.
 */
function VariantSwitcher({ variants, pathname }: { variants: Variants; pathname: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const current = variantOf(pathname, variants);
  const label = variants.entries.find((e) => e.id === current)?.label ?? current;
  const locales = variants.kind === "locales";

  // The page's language, for screen readers and translation tools.
  useEffect(() => {
    if (locales) document.documentElement.lang = current;
  }, [locales, current]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const pick = async (id: string) => {
    setOpen(false);
    if (id === current) return;
    const target = variantPath(pathname, id, variants);
    let dest = target;
    try {
      const res = await fetch(target, { method: "HEAD" });
      if (!res.ok) dest = variantPath("/", id, variants);
    } catch {
      // Offline or blocked: try the page anyway.
    }
    router.push(dest);
  };

  return (
    <div className={`nav-variant${locales ? " nav-variant--locale" : ""}`} ref={ref}>
      <button
        type="button"
        className="nav-variant-btn"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`${locales ? "Language" : "Version"}: ${label}`}
        onClick={() => setOpen((o) => !o)}
      >
        {locales && GlobeIcon}
        <span className="lbl">{label}</span>
        <svg className="chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>
      {open && (
        <div className="nav-variant-pop" role="menu">
          {variants.entries.map((e) => (
            <button
              key={e.id}
              type="button"
              role="menuitemradio"
              aria-checked={e.id === current}
              lang={locales ? e.id : undefined}
              onClick={() => pick(e.id)}
            >
              <span>{e.label}</span>
              {e.id === current && (
                <svg className="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                  <path d="M20 6 9 17l-5-5" />
                </svg>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** A header dropdown (a topbar.links entry with `items`). */
function NavMenu({ menu, pathname }: { menu: SiteNavMenu; pathname: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="nav-menu" ref={ref}>
      <button type="button" className="nav-xlink" aria-haspopup="true" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        {menu.label}
        <svg className="chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>
      {open && (
        <div className="nav-menu-pop">
          {menu.items.map((it) => (
            <NavHref key={it.href + it.label} link={it} onClick={() => setOpen(false)}>
              <span className="t">{it.label}</span>
              {it.description && <span className="d">{it.description}</span>}
            </NavHref>
          ))}
        </div>
      )}
    </div>
  );
}

/** topbar.banner: a strip at the top of the header. Hidden by removing
 *  html[data-banner], which the pre-paint script also does for a banner the
 *  reader closed or one whose last day has passed. */
function SiteBanner({ banner }: { banner: SiteBannerData }) {
  const close = () => {
    document.documentElement.removeAttribute("data-banner");
    try {
      localStorage.setItem(BANNER_KEY, banner.id);
    } catch {}
  };
  return (
    <div className={`site-banner site-banner--${banner.tone}`} role="region" aria-label="Announcement">
      <p>
        <span className="txt">{banner.text}</span>
        {banner.link && <NavHref link={banner.link} className="lnk" />}
      </p>
      {banner.dismissible && (
        <button type="button" className="x" onClick={close} aria-label="Dismiss announcement">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        </button>
      )}
    </div>
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
