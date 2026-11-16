/* The links in a page's MDX that markline shows as text rather than as links
 * (see scripts/safe-href.mjs), so the build and the dev server can say so.
 * Pure, so it's unit-tested. */

import remarkGfm from "remark-gfm";
import remarkMdx from "remark-mdx";
import remarkParse from "remark-parse";
import { unified } from "unified";
import { ALLOWED_LINKS, quoteHref, safeHref } from "@/scripts/safe-href.mjs";

type Node = {
  type: string;
  name?: string | null;
  url?: string;
  value?: unknown;
  identifier?: string;
  attributes?: { type: string; name?: string; value?: unknown }[];
  children?: Node[];
};

/** Components whose `href` becomes a link. */
const LINKING = new Set(["a", "Card", "LinkItem", "Path", "BentoCard", "Feature", "CTAButton"]);

const parser = unified().use(remarkParse).use(remarkGfm).use(remarkMdx);

const textOf = (node: Node): string =>
  node.type === "text" || node.type === "inlineCode" ? String(node.value ?? "") : (node.children ?? []).map(textOf).join("");

const attr = (node: Node, name: string) => {
  const a = node.attributes?.find((x) => x.type === "mdxJsxAttribute" && x.name === name);
  return typeof a?.value === "string" ? a.value : undefined;
};

export type BodyLinkIssue = { text: string; href: string };

/** Each link in `body` markline won't render as one, with its text, in order. */
export function bodyLinkIssues(body: string): BodyLinkIssue[] {
  let tree: Node;
  try {
    tree = parser.parse(body) as Node;
  } catch {
    return []; // the page's own render reports a parse error
  }
  const defs = new Map<string, string>();
  const collect = (n: Node) => {
    if (n.type === "definition" && n.identifier && n.url !== undefined) defs.set(n.identifier, n.url);
    n.children?.forEach(collect);
  };
  collect(tree);

  const issues: BodyLinkIssue[] = [];
  const check = (href: string | undefined, text: string) => {
    if (href !== undefined && href.trim() && !safeHref(href)) issues.push({ text: text.trim().replace(/\s+/g, " ") || href, href });
  };
  const walk = (n: Node) => {
    if (n.type === "link") check(n.url, textOf(n));
    else if (n.type === "linkReference" && n.identifier) check(defs.get(n.identifier), textOf(n));
    else if ((n.type === "mdxJsxFlowElement" || n.type === "mdxJsxTextElement") && n.name && LINKING.has(n.name)) {
      check(attr(n, "href"), attr(n, "title") ?? textOf(n));
    }
    n.children?.forEach(walk);
  };
  walk(tree);
  return issues;
}

const warned = new Set<string>();

/** Say, once each per process, which of a file's links are shown as text. The
 *  build and the dev server both report through this, so they say the same. */
export function warnBodyLinks(file: string, body: string, warn: (msg: string) => void = console.warn): void {
  for (const { text, href } of bodyLinkIssues(body)) {
    const msg = `[markline] ${file}: the link "${text}" goes to ${quoteHref(href)}, which markline doesn't link to (use ${ALLOWED_LINKS}); it's shown as text.`;
    if (warned.has(msg)) continue;
    warned.add(msg);
    warn(msg);
  }
}

/**
 * Remark plugin: an <a> written as JSX with a literal href markline doesn't
 * render becomes a <span>, keeping its text. (A Markdown link goes through
 * the `a` component, which does the same; JSX tags don't.)
 */
export function remarkSafeLinks() {
  return (tree: Node) => {
    const walk = (n: Node) => {
      if ((n.type === "mdxJsxFlowElement" || n.type === "mdxJsxTextElement") && n.name === "a") {
        const href = n.attributes?.find((x) => x.type === "mdxJsxAttribute" && x.name === "href");
        if (href && typeof href.value === "string" && !safeHref(href.value)) {
          n.name = "span";
          n.attributes = n.attributes!.filter((x) => x !== href);
        }
      }
      n.children?.forEach(walk);
    };
    walk(tree);
  };
}
