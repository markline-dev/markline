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
import { MarklineHome } from "@/components/landing/home/markline-home";

function slugify(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

/* ── Rich MDX-only components ── */

export function Paths({ children }: { children: React.ReactNode }) {
  return <div className="ml-paths-grid">{children}</div>;
}

export function Path({
  num, href, arrow, title, children,
}: { num: number; href: string; arrow: string; title: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="ml-path-card">
      <span className="ml-path-num">{num}</span>
      <h3>{title}</h3>
      <div className="ml-path-desc">{children}</div>
      <span className="ml-path-arrow">{arrow}</span>
    </Link>
  );
}

type Verb = "POST" | "GET" | "DELETE";

export function ApiRefs({ items }: { items: { verb: Verb; ep: string; desc?: string; href: string }[] }) {
  return (
    <div className="ml-apirefs-grid">
      {items.map((r) => (
        <Link key={r.ep} href={r.href} className="ml-apiref-card">
          <span className={`ml-apiref-verb verb-${r.verb}`}>{r.verb}</span>
          <span className="ml-apiref-ep">{r.ep}</span>
          {r.desc && <span className="ml-apiref-desc">{r.desc}</span>}
        </Link>
      ))}
    </div>
  );
}

export function MigrationCallout({ children }: { children?: React.ReactNode }) {
  return (
    <div className="ml-migrate">
      <span className="ml-migrate-badge">↗</span>
      <div>
        <strong>Migrating from OpenAI?</strong>
        <div className="ml-migrate-body">{children}</div>
      </div>
    </div>
  );
}

/* Re-export so MDX can use these without importing. */
export { Callout, CodeBlock };
export type { CodeSnippet };

/* ── MDX components map (passed to <MDXRemote components={…} />) ── */

export const mdxComponents: MDXComponents = {
  // Prose elements are styled structurally by app/docs.css (.docs-prose …) so
  // they stay token-driven and theme-aware; the components only carry anchor ids.
  h1: ({ children }) => <h1 className="docs-h1">{children}</h1>,
  h2: ({ children }) => {
    const id = typeof children === "string" ? slugify(children) : undefined;
    return <DocsH2 id={id ?? ""}>{children}</DocsH2>;
  },
  h3: ({ children }) => {
    const id = typeof children === "string" ? slugify(children) : undefined;
    return <h3 id={id}>{children}</h3>;
  },
  p: ({ children }) => <DocsP>{children}</DocsP>,
  ul: ({ children }) => <ul>{children}</ul>,
  ol: ({ children }) => <ol>{children}</ol>,
  li: ({ children }) => <li>{children}</li>,
  a: ({ href, children }) => <Link href={href ?? "#"}>{children}</Link>,
  strong: ({ children }) => <strong>{children}</strong>,
  hr: () => <hr />,
  blockquote: ({ children }) => <blockquote>{children}</blockquote>,
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
    <pre {...props} className="ml-mdx-pre">
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
    <div className="ml-table-wrap">
      <table className="ml-table">{children}</table>
    </div>
  ),
  thead: ({ children }) => <thead>{children}</thead>,
  th: ({ children }) => <th>{children}</th>,
  td: ({ children }) => <td>{children}</td>,

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
  MarklineHome,
};
