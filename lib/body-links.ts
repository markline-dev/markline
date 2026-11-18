/* Links in a page's MDX that markline shows as text rather than as links
 * (scripts/safe-href.mjs). remarkSafeLinks runs in the page's own compile: it
 * turns an <a> written as JSX into a <span> when its href is one, and says
 * which links were dropped, by file, so `markline dev` and `markline build`
 * report the same thing without parsing the page again. */

import remarkGfm from "remark-gfm";
import remarkMdx from "remark-mdx";
import remarkParse from "remark-parse";
import { unified } from "unified";
import { BLOCKED_LINKS, quoteHref, safeHref } from "@/scripts/safe-href.mjs";

type Estree = { type: string; value?: unknown; quasis?: { value: { cooked?: string } }[]; expressions?: unknown[]; properties?: Estree[]; argument?: Estree; key?: Estree & { name?: string }; computed?: boolean; expression?: Estree; body?: Estree[] };
type Attr = { type: string; name?: string; value?: unknown; data?: { estree?: Estree } };
type Node = {
  type: string;
  name?: string | null;
  url?: string;
  value?: unknown;
  identifier?: string;
  attributes?: Attr[];
  children?: Node[];
};

/** Components whose `href` becomes a link (each checks it again as it renders). */
const LINKING = new Set(["a", "Card", "LinkItem", "Path", "BentoCard", "Feature", "CTAButton"]);

/** A string an estree expression is, written as a literal: "x", 'x' or `x`. */
function literal(e: Estree | undefined): string | undefined {
  if (e?.type === "Literal" && typeof e.value === "string") return e.value;
  if (e?.type === "TemplateLiteral" && !e.expressions?.length) return e.quasis?.[0]?.value.cooked;
  return undefined;
}

const expressionOf = (a: Attr) => a.data?.estree?.body?.[0]?.expression;

/** What an object literal sets `href` to, written out, as in
 *  {...{ href: "x" }}; the last one wins, as in JSX. A value not written out
 *  ({ href: url }, a computed key, a spread of a variable) isn't known here and
 *  leaves the last known one standing, so a written-out bad href still counts. */
function hrefInObject(e: Estree | undefined): string | undefined {
  if (e?.type !== "ObjectExpression") return undefined;
  let href: string | undefined;
  for (const p of e.properties ?? []) {
    if (p.type === "Property" && !p.computed && (p.key?.name === "href" || p.key?.value === "href")) {
      href = literal(p.value as Estree) ?? href;
    } else if (p.type === "SpreadElement") {
      href = hrefInObject(p.argument) ?? href;
    }
  }
  return href;
}

/** The href an element ends up with, as far as it's written out (href="x",
 *  href={"x"}, href={`x`} or {...{ href: "x" }}; the last one wins, as in
 *  JSX), and every attribute that sets one. A computed href ({someVariable})
 *  isn't known here. */
function hrefOf(node: Node): { href: string; attrs: Attr[] } | undefined {
  let href: string | undefined;
  const attrs: Attr[] = [];
  for (const a of node.attributes ?? []) {
    let s: string | undefined;
    if (a.type === "mdxJsxAttribute" && a.name === "href") {
      const v = a.value as Attr | string | null | undefined;
      s = typeof v === "string" ? v : v && typeof v === "object" ? literal(expressionOf(v)) : undefined;
    } else if (a.type === "mdxJsxExpressionAttribute") {
      s = hrefInObject(expressionOf(a)); // {...x} is read as the object { ...x }
    }
    if (s !== undefined) {
      href = s;
      attrs.push(a);
    }
  }
  return href === undefined ? undefined : { href, attrs };
}

function stringAttr(node: Node, name: string): string | undefined {
  const a = node.attributes?.find((x) => x.type === "mdxJsxAttribute" && x.name === name);
  return typeof a?.value === "string" ? a.value : undefined;
}

const textOf = (node: Node): string =>
  node.type === "text" || node.type === "inlineCode" ? String(node.value ?? "") : (node.children ?? []).map(textOf).join("");

export type BodyLinkIssue = { text: string; href: string };

const isJsx = (n: Node) => n.type === "mdxJsxFlowElement" || n.type === "mdxJsxTextElement";

/** The links in a parsed page markline won't render, in order; an <a> with
 *  one becomes a <span> as they're found. */
function dropLinks(tree: Node): BodyLinkIssue[] {
  const defs = new Map<string, string>();
  const collect = (n: Node) => {
    if (n.type === "definition" && n.identifier && n.url !== undefined) defs.set(n.identifier, n.url);
    n.children?.forEach(collect);
  };
  collect(tree);

  const issues: BodyLinkIssue[] = [];
  const bad = (href: string | undefined) => href !== undefined && href.trim() !== "" && !safeHref(href);
  const add = (href: string, text: string) => issues.push({ text: text.trim().replace(/\s+/g, " ") || href, href });
  const walk = (n: Node) => {
    if (n.type === "link" && bad(n.url)) add(n.url!, textOf(n));
    else if (n.type === "linkReference" && n.identifier && bad(defs.get(n.identifier))) add(defs.get(n.identifier)!, textOf(n));
    else if (isJsx(n) && n.name && LINKING.has(n.name)) {
      const found = hrefOf(n);
      if (found && bad(found.href)) {
        // A component's title is its label; an <a>'s is a tooltip.
        add(found.href, (n.name !== "a" && stringAttr(n, "title")) || textOf(n));
        // A component checks its href as it renders; a JSX <a> goes straight to the page.
        if (n.name === "a") {
          n.name = "span";
          n.attributes = n.attributes!.filter((x) => !found.attrs.includes(x));
        }
      }
    }
    n.children?.forEach(walk);
  };
  walk(tree);
  return issues;
}

const parser = unified().use(remarkParse).use(remarkGfm).use(remarkMdx);

/** Each link in `body` markline won't render as one, with its text, in order. */
export function bodyLinkIssues(body: string): BodyLinkIssue[] {
  try {
    return dropLinks(parser.parse(body) as Node);
  } catch {
    return []; // the page's own render reports a parse error
  }
}

const warned = new Set<string>();

/** The warning for one dropped link in `file`, said once per process. */
export function warnBodyLink(file: string, { text, href }: BodyLinkIssue, warn: (msg: string) => void = console.warn): void {
  const msg = `[markline] ${file}: the link "${text}" goes to ${quoteHref(href)}, and markline doesn't link to ${BLOCKED_LINKS}; it's shown as text.`;
  if (warned.has(msg)) return;
  warned.add(msg);
  warn(msg);
}

/**
 * Remark plugin, in every compile of page MDX: an <a> written as JSX whose
 * href markline won't render becomes a <span>, keeping its text (a Markdown
 * link goes through the `a` component, which does the same, but JSX tags
 * don't). With `file`, each dropped link is reported as `file`.
 */
export function remarkSafeLinks(opts: { file?: string; warn?: (msg: string) => void } = {}) {
  return (tree: Node) => {
    const issues = dropLinks(tree);
    if (opts.file) for (const issue of issues) warnBodyLink(opts.file, issue, opts.warn);
  };
}
