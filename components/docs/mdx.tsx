import Link from "next/link";
import type { MDXComponents } from "mdx/types";
import { Callout, DocsH2, DocsP } from "./page";
import { CodeBlock, type CodeSnippet } from "./code-block";
import { EndpointList } from "./api/endpoint-list";
import {
  Note, Info, Tip, Check, Warning, Danger,
  Card, CardGroup, Steps, Step, ParamField, ResponseField,
} from "./authoring";
import { Tabs, Tab, Accordion, AccordionGroup } from "./authoring-client";
import {
  Hero, CTAButton, FeatureGrid, Feature, CTASection, CodeShowcase,
  Eyebrow, SectionHead, StatStrip, Stat, Bento, BentoCard,
} from "@/components/landing/landing";

function slugify(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

/* ── Rich MDX-only components ── */

export function Paths({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid gap-3 my-6 paths-grid" style={{ gridTemplateColumns: "1fr 1fr 1fr" }}>
      <style>{`@media (max-width: 880px) { .paths-grid { grid-template-columns: 1fr !important; } }`}</style>
      {children}
    </div>
  );
}

export function Path({
  num, href, arrow, title, children,
}: { num: number; href: string; arrow: string; title: string; children: React.ReactNode }) {
  return (
    <Link href={href}
          className="group flex flex-col gap-2 p-5 border border-slate-3 rounded-3 bg-paper-2 no-underline text-ink hover:border-brand transition-colors">
      <span className="w-[26px] h-[26px] rounded-1 bg-brand text-on-brand flex items-center justify-center font-mono font-semibold text-13">
        {num}
      </span>
      <h3 className="text-16 font-semibold m-0">{title}</h3>
      <div className="text-13 text-slate-5 leading-[1.5]">{children}</div>
      <span className="font-mono text-12 text-slate-5 group-hover:text-brand mt-auto">{arrow}</span>
    </Link>
  );
}

type Verb = "POST" | "GET" | "DELETE";
const VERB_STYLE: Record<Verb, string> = {
  POST:   "bg-[#D6F0E1] text-[#15A66B]",
  GET:    "bg-[#DDE8FB] text-[#2A6FDB]",
  DELETE: "bg-[#F8D8D2] text-[#D43A2C]",
};

export function ApiRefs({ items }: { items: { verb: Verb; ep: string; desc?: string; href: string }[] }) {
  return (
    <div className="grid gap-2 my-6 refs-grid" style={{ gridTemplateColumns: "1fr 1fr" }}>
      <style>{`@media (max-width: 720px) { .refs-grid { grid-template-columns: 1fr !important; } }`}</style>
      {items.map((r) => (
        <Link key={r.ep} href={r.href}
              className="flex items-center gap-3 px-4 py-3 border border-slate-3 rounded-2 bg-paper-2 no-underline text-ink hover:border-slate-4 transition-colors">
          <span className={`font-mono text-11 px-1.5 py-0.5 rounded-sm font-semibold ${VERB_STYLE[r.verb]}`}>
            {r.verb}
          </span>
          <span className="font-mono text-13 flex-1 min-w-0 truncate">{r.ep}</span>
          {r.desc && <span className="text-12 text-slate-5">{r.desc}</span>}
        </Link>
      ))}
    </div>
  );
}

export function MigrationCallout({ children }: { children?: React.ReactNode }) {
  return (
    <div className="my-6 flex items-start gap-3.5 px-5 py-4 rounded-3 border border-brand"
         style={{ background: "color-mix(in oklab, rgb(var(--c-brand)) 12%, rgb(var(--c-paper-2)))" }}>
      <span className="font-mono font-bold text-12 w-[22px] h-[22px] rounded-full bg-brand text-on-brand flex items-center justify-center flex-shrink-0">↗</span>
      <div>
        <strong className="text-ink">Migrating from OpenAI?</strong>
        <div className="text-14 text-slate-6 leading-[1.55] mt-0.5">{children}</div>
      </div>
    </div>
  );
}

/* Re-export so MDX can use these without importing. */
export { Callout, CodeBlock };
export type { CodeSnippet };

/* ── MDX components map (passed to <MDXRemote components={…} />) ── */

export const mdxComponents: MDXComponents = {
  h1: ({ children }) => (
    <h1 className="font-semibold text-ink mb-3" style={{ fontSize: 36, letterSpacing: "-0.02em", lineHeight: 1.1 }}>
      {children}
    </h1>
  ),
  h2: ({ children }) => {
    const id = typeof children === "string" ? slugify(children) : undefined;
    return <DocsH2 id={id ?? ""}>{children}</DocsH2>;
  },
  h3: ({ children }) => {
    const id = typeof children === "string" ? slugify(children) : undefined;
    return (
      <h3 id={id} className="text-18 font-semibold tracking-[-0.01em] mt-6 mb-2 text-ink">
        {children}
      </h3>
    );
  },
  p: ({ children }) => <DocsP>{children}</DocsP>,
  ul: ({ children }) => (
    <ul className="list-disc pl-6 my-4 text-15 leading-[1.65] text-slate-6 space-y-1.5">{children}</ul>
  ),
  ol: ({ children }) => (
    <ol className="list-decimal pl-6 my-4 text-15 leading-[1.65] text-slate-6 space-y-1.5">{children}</ol>
  ),
  li: ({ children }) => <li className="pl-1">{children}</li>,
  a: ({ href, children }) => (
    <Link href={href ?? "#"} className="text-ink underline underline-offset-2 hover:text-slate-7">
      {children}
    </Link>
  ),
  strong: ({ children }) => <strong className="text-ink font-semibold">{children}</strong>,
  hr: () => <hr className="my-8 border-slate-3" />,
  blockquote: ({ children }) => (
    <blockquote className="my-5 pl-4 border-l-2 border-brand text-15 leading-[1.65] text-slate-6 italic">
      {children}
    </blockquote>
  ),
  // Inline code (single backticks) vs fenced code blocks.
  // rehype-pretty-code marks fenced blocks with data-language; inline code
  // doesn't get that attribute. We use it as the discriminator so the
  // cream-pill .ci style only fires for true inline code, never for tokens
  // inside a <pre> block.
  code: ({ children, className, ...props }: any) => {
    const isBlock =
      typeof props["data-language"] === "string" ||
      (typeof className === "string" && className.startsWith("language-"));
    if (isBlock) {
      return <code className={className} {...props}>{children}</code>;
    }
    return <code className="ci">{children}</code>;
  },
  // Code blocks (fenced ```...```). rehype-pretty-code wraps them in
  // <figure><pre><code>; the figure component below strips the wrapper.
  pre: ({ children, ...props }: any) => (
    <pre
      {...props}
      className="my-6 rounded-3 overflow-x-auto bg-ink border border-ink-2 shadow-elev-2 p-5 text-13 leading-[1.7] font-mono text-[#E8E7E0]"
    >
      {children}
    </pre>
  ),
  // rehype-pretty-code wraps blocks in <figure data-rehype-pretty-code-figure>.
  // Render as a transparent fragment so the <pre>'s my-6 alone controls spacing.
  figure: ({ children, ...props }: any) => {
    if ("data-rehype-pretty-code-figure" in props) {
      return <>{children}</>;
    }
    return <figure {...props}>{children}</figure>;
  },
  table: ({ children }) => (
    <div className="my-6 overflow-x-auto rounded-2 border border-slate-3">
      <table className="w-full text-14 border-collapse">{children}</table>
    </div>
  ),
  thead: ({ children }) => <thead className="bg-slate-2 border-b border-slate-3">{children}</thead>,
  th: ({ children }) => <th className="text-left px-4 py-2.5 font-semibold text-ink">{children}</th>,
  td: ({ children }) => <td className="px-4 py-2.5 border-t border-slate-3 text-slate-6">{children}</td>,

  // Rich custom blocks available in any MDX page
  Callout,
  CodeBlock,
  Paths,
  Path,
  ApiRefs,
  MigrationCallout,
  EndpointList,
  Link,

  // Authoring component library
  Note,
  Info,
  Tip,
  Check,
  Warning,
  Danger,
  Card,
  CardGroup,
  Steps,
  Step,
  Tabs,
  Tab,
  Accordion,
  AccordionGroup,
  ParamField,
  ResponseField,

  // Landing-page components (layout: landing)
  Hero,
  CTAButton,
  FeatureGrid,
  Feature,
  CTASection,
  CodeShowcase,
  Eyebrow,
  SectionHead,
  StatStrip,
  Stat,
  Bento,
  BentoCard,
};
