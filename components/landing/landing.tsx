import Link from "next/link";
import { highlightToHtml } from "@/lib/shiki";

/* ──────────────────────────────────────────────────────────────────────────
 * Landing-page components — for pages with `layout: landing` in frontmatter.
 * Full-bleed marketing sections; available in MDX without an import.
 * ────────────────────────────────────────────────────────────────────────── */

/** Full-bleed wrapper for landing pages. The `.landing` class triggers CSS in
 * globals.css that removes the docs sidebar/TOC and un-grids the shell. */
export function LandingPage({ children }: { children: React.ReactNode }) {
  return <div className="landing w-full">{children}</div>;
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
  return <section className={`w-full px-6 ${className}`}>{<div className="mx-auto max-w-[1100px]">{children}</div>}</section>;
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
  const base =
    "inline-flex items-center justify-center gap-2 font-medium no-underline rounded-2 transition-colors whitespace-nowrap";
  const sizes = size === "lg" ? "h-12 px-6 text-15" : "h-10 px-4 text-14";
  const variants =
    variant === "primary"
      ? "bg-brand text-on-brand hover:opacity-90"
      : variant === "secondary"
        ? "border border-slate-4 text-ink hover:border-slate-6 bg-paper"
        : "text-brand hover:underline";
  return (
    <Link
      href={href}
      {...(external ? { target: "_blank", rel: "noreferrer" } : {})}
      className={`${base} ${sizes} ${variants}`}
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
}: {
  eyebrow?: string;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
  media?: React.ReactNode;
  gradient?: boolean;
}) {
  return (
    <Section className="relative pt-20 pb-16 text-center overflow-hidden">
      {gradient && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-[420px] -z-10"
          style={{
            background:
              "radial-gradient(60% 60% at 50% 0%, color-mix(in oklab, rgb(var(--c-brand)) 18%, transparent), transparent 70%)",
          }}
        />
      )}
      {eyebrow && (
        <div className="mb-4 inline-block font-mono text-12 uppercase tracking-[0.1em] text-brand">{eyebrow}</div>
      )}
      <h1
        className="mx-auto max-w-[18ch] font-semibold text-ink"
        style={{ fontSize: "clamp(34px, 6vw, 60px)", lineHeight: 1.05, letterSpacing: "-0.03em", textWrap: "balance" }}
      >
        {title}
      </h1>
      {subtitle && (
        <p className="mx-auto mt-5 max-w-[52ch] text-17 leading-[1.55] text-slate-6" style={{ textWrap: "balance" }}>
          {subtitle}
        </p>
      )}
      {actions && <div className="mt-8 flex flex-wrap items-center justify-center gap-3">{actions}</div>}
      {media && <div className="mt-12">{media}</div>}
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
    <Section className="py-16">
      {(title || subtitle) && (
        <div className="mb-10 text-center">
          {title && <h2 className="text-28 font-semibold tracking-[-0.02em] text-ink">{title}</h2>}
          {subtitle && <p className="mt-2 text-15 text-slate-6">{subtitle}</p>}
        </div>
      )}
      <div className="grid gap-4 featuregrid" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
        <style>{`@media (max-width: 860px) { .featuregrid { grid-template-columns: 1fr 1fr !important; } } @media (max-width: 560px) { .featuregrid { grid-template-columns: 1fr !important; } }`}</style>
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
          className="mb-3 inline-flex h-9 w-9 items-center justify-center rounded-2 text-16"
          style={{ background: `color-mix(in oklab, ${color} 14%, transparent)`, color }}
        >
          {icon}
        </span>
      )}
      <h3 className="text-16 font-semibold text-ink">{title}</h3>
      {children && <p className="mt-1.5 text-14 leading-[1.55] text-slate-6">{children}</p>}
    </>
  );
  const cls = "block p-5 rounded-3 border border-slate-3 bg-paper-2 no-underline text-ink";
  return href ? (
    <Link href={href} className={`${cls} hover:border-brand transition-colors`}>{inner}</Link>
  ) : (
    <div className={cls}>{inner}</div>
  );
}

export function CTASection({
  title,
  subtitle,
  actions,
  gradient,
}: {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
  gradient?: boolean;
}) {
  return (
    <Section className="py-20 text-center">
      <div
        className="rounded-3 border border-slate-3 px-6 py-14"
        style={
          gradient
            ? { background: "radial-gradient(80% 120% at 50% 0%, color-mix(in oklab, rgb(var(--c-brand)) 12%, transparent), transparent 70%)" }
            : undefined
        }
      >
        <h2 className="mx-auto max-w-[20ch] text-32 font-semibold tracking-[-0.02em] text-ink" style={{ textWrap: "balance" }}>
          {title}
        </h2>
        {subtitle && <p className="mx-auto mt-3 max-w-[46ch] text-15 text-slate-6">{subtitle}</p>}
        {actions && <div className="mt-7 flex flex-wrap items-center justify-center gap-3">{actions}</div>}
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
    <div
      className="mx-auto max-w-[640px] overflow-hidden rounded-3 shadow-elev-2 text-left border"
      style={{ background: "rgb(var(--c-panel-bg))", borderColor: "rgb(var(--c-panel-border))" }}
    >
      <div
        className="flex items-center gap-1.5 px-4 py-2.5 border-b"
        style={{ borderColor: "rgb(var(--c-panel-border))" }}
      >
        <span className="h-2.5 w-2.5 rounded-full bg-[#E14F4F]/70" />
        <span className="h-2.5 w-2.5 rounded-full bg-[#E8951F]/70" />
        <span className="h-2.5 w-2.5 rounded-full bg-[#15A66B]/70" />
        {title && <span className="ml-2 font-mono text-11" style={{ color: "rgb(var(--c-panel-muted))" }}>{title}</span>}
      </div>
      <div
        className="px-5 py-4 overflow-x-auto text-13 leading-[1.7] font-mono [&_pre]:!bg-transparent [&_pre]:m-0"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </div>
  );
}
