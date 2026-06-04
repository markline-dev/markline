import React from "react";
import Link from "next/link";
import { highlightToHtml } from "@/lib/shiki";

/* ──────────────────────────────────────────────────────────────────────────
 * Landing-page components — for pages with `layout: landing` in frontmatter.
 * Full-bleed marketing sections; available in MDX without an import.
 * ────────────────────────────────────────────────────────────────────────── */

/** Full-bleed wrapper for landing pages. The `.landing` class triggers CSS in
 * globals.css that removes the docs sidebar/TOC and un-grids the shell. */
export function LandingPage({ children }: { children: React.ReactNode }) {
  return <div className="landing ml-landing">{children}</div>;
}

const ACCENTS: Record<string, string> = {
  brand: "rgb(var(--c-brand))",
  blue: "#3C87F0",
  green: "#15A66B",
  amber: "#E8951F",
  violet: "#7C5CFC",
  red: "#E14F4F",
};
function accentColor(a?: string) {
  return a ? ACCENTS[a] ?? a : "rgb(var(--c-brand))";
}

function Section({ className = "", children }: { className?: string; children: React.ReactNode }) {
  return <section className={`ml-l-section ${className}`}>{<div className="ml-l-section-inner">{children}</div>}</section>;
}

/* ── Steel-inspired primitives ─────────────────────────────────────────────
 * Monospace bracket kickers, blueprint grids, hairline bento panels with
 * corner ticks, and a stats band. Engineering-blueprint aesthetic. */

/** Monospace bracketed kicker, e.g. `[ OPENAPI ]`. */
export function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <span className="ml-l-eyebrow">
      <span className="bk">[</span>
      {children}
      <span className="bk">]</span>
    </span>
  );
}

/** Section heading with a mono kicker above a tight grotesque title. */
export function SectionHead({
  kicker,
  title,
  subtitle,
  align = "center",
}: {
  kicker?: string;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  align?: "center" | "left";
}) {
  return (
    <div className={`ml-l-sechead align-${align}`}>
      {kicker && <div className="kicker"><Eyebrow>{kicker}</Eyebrow></div>}
      <h2>{title}</h2>
      {subtitle && <p>{subtitle}</p>}
    </div>
  );
}

/** Horizontal band of big metric figures separated by hairline rules. */
export function StatStrip({ children }: { children: React.ReactNode }) {
  const n = Math.max(1, React.Children.count(children));
  return (
    <Section className="pad-sm">
      <div
        className="ml-l-statstrip blueprint-grid"
        style={{ gridTemplateColumns: `repeat(${n}, minmax(0,1fr))` }}
      >
        {children}
      </div>
    </Section>
  );
}

export function Stat({ value, label }: { value: React.ReactNode; label: string }) {
  return (
    <div className="ml-l-stat">
      <div className="v">{value}</div>
      <div className="l">{label}</div>
    </div>
  );
}

/** Bento layout — asymmetric hairline-bordered cells. */
export function Bento({ children }: { children: React.ReactNode }) {
  return (
    <Section className="pad-sm">
      <div className="ml-l-bento">{children}</div>
    </Section>
  );
}

/** A single bento cell. `span` is out of 6 columns (default 3 = half). */
export function BentoCard({
  kicker,
  title,
  span = 3,
  href,
  children,
}: {
  kicker?: string;
  title?: React.ReactNode;
  span?: number;
  href?: string;
  children?: React.ReactNode;
}) {
  const inner = (
    <>
      <span aria-hidden className="bento-tick" data-c="tl" />
      <span aria-hidden className="bento-tick" data-c="br" />
      {kicker && <div className="kicker"><Eyebrow>{kicker}</Eyebrow></div>}
      {title && <h3>{title}</h3>}
      {children && <div className="body">{children}</div>}
    </>
  );
  const cls = "ml-l-bento-card";
  return href ? (
    <Link href={href} className={cls} style={{ gridColumn: `span ${span}` }}>{inner}</Link>
  ) : (
    <div className={cls} style={{ gridColumn: `span ${span}` }}>{inner}</div>
  );
}

export function CTAButton({
  href,
  variant = "primary",
  size = "md",
  external,
  children,
}: {
  href: string;
  variant?: "primary" | "secondary" | "ghost";
  size?: "md" | "lg";
  external?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      {...(external ? { target: "_blank", rel: "noreferrer" } : {})}
      className={`ml-l-btn size-${size} v-${variant}`}
    >
      {children}
    </Link>
  );
}

export function Hero({
  eyebrow,
  title,
  subtitle,
  actions,
  media,
  gradient,
  grid,
}: {
  eyebrow?: string;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
  media?: React.ReactNode;
  gradient?: boolean;
  grid?: boolean;
}) {
  return (
    <Section className="ml-l-hero">
      {grid && <div aria-hidden className="ml-l-hero-grid blueprint-grid blueprint-fade" />}
      {gradient && <div aria-hidden className="ml-l-hero-gradient" />}
      {eyebrow && <div className="kicker"><Eyebrow>{eyebrow}</Eyebrow></div>}
      <h1>{title}</h1>
      {subtitle && <p className="sub">{subtitle}</p>}
      {actions && <div className="actions">{actions}</div>}
      {media && <div className="media">{media}</div>}
    </Section>
  );
}

export function FeatureGrid({
  cols = 3,
  title,
  subtitle,
  children,
}: {
  cols?: 2 | 3 | 4;
  title?: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <Section className="ml-l-featuregrid">
      {(title || subtitle) && (
        <div className="head">
          {title && <h2>{title}</h2>}
          {subtitle && <p>{subtitle}</p>}
        </div>
      )}
      <div className="ml-l-featuregrid-cols" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
        {children}
      </div>
    </Section>
  );
}

export function Feature({
  icon,
  title,
  href,
  accent,
  children,
}: {
  icon?: React.ReactNode;
  title: string;
  href?: string;
  accent?: string;
  children?: React.ReactNode;
}) {
  const color = accentColor(accent);
  const inner = (
    <>
      {icon && (
        <span
          className="ico"
          style={{ background: `color-mix(in oklab, ${color} 14%, transparent)`, color }}
        >
          {icon}
        </span>
      )}
      <h3>{title}</h3>
      {children && <p>{children}</p>}
    </>
  );
  return href ? (
    <Link href={href} className="ml-l-feature linked">{inner}</Link>
  ) : (
    <div className="ml-l-feature">{inner}</div>
  );
}

export function CTASection({
  title,
  subtitle,
  actions,
  gradient,
  grid,
}: {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
  gradient?: boolean;
  grid?: boolean;
}) {
  return (
    <Section className="ml-l-cta">
      <div
        className={`ml-l-cta-box${grid ? " blueprint-grid" : ""}`}
        style={
          gradient
            ? { background: "radial-gradient(80% 120% at 50% 0%, color-mix(in oklab, var(--accent) 12%, transparent), transparent 70%)" }
            : undefined
        }
      >
        {grid && (
          <div
            aria-hidden
            className="ml-l-cta-overlay"
            style={{ background: "radial-gradient(80% 120% at 50% 0%, color-mix(in oklab, var(--accent) 14%, transparent), transparent 72%)" }}
          />
        )}
        <div className="ml-l-cta-inner">
          <h2>{title}</h2>
          {subtitle && <p>{subtitle}</p>}
          {actions && <div className="actions">{actions}</div>}
        </div>
      </div>
    </Section>
  );
}

/** Server component: highlights a single snippet for the hero/feature demo slot. */
export async function CodeShowcase({
  code,
  lang = "bash",
  title,
}: {
  code: string;
  lang?: string;
  title?: string;
}) {
  const html = await highlightToHtml(code.trim(), lang);
  return (
    <div className="ml-l-showcase">
      <div className="ml-l-showcase-head">
        <span className="ml-l-showcase-dot r" />
        <span className="ml-l-showcase-dot y" />
        <span className="ml-l-showcase-dot g" />
        {title && <span className="ml-l-showcase-title">{title}</span>}
      </div>
      <div className="ml-l-showcase-body" dangerouslySetInnerHTML={{ __html: html }} />
    </div>
  );
}
