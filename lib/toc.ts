/* "On this page", built from a page's own ## and ### headings when its
 * frontmatter doesn't list them. Pure, so it's unit-tested. The page gets its
 * heading and step ids from remarkTocIds, from the same plan as extractToc, so
 * the links land. */

import remarkGfm from "remark-gfm";
import remarkMdx from "remark-mdx";
import remarkParse from "remark-parse";
import { unified } from "unified";
import { titleText } from "./inline-title";

export type TocItem = { id: string; label: string; depth?: 2 | 3 };

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

type MdxAttr = { type: string; name?: string; value?: string | { value?: string } | null };
type MdxNode = {
  type: string;
  data?: { hProperties?: Record<string, unknown> };
  name?: string | null;
  depth?: number;
  value?: string;
  attributes?: MdxAttr[];
  children?: MdxNode[];
};

const attrOf = (node: MdxNode, name: string) => node.attributes?.find((a) => a.type === "mdxJsxAttribute" && a.name === name);

/** An MDX attribute's string value, whether title="…" or title={"…"}. */
function stringAttr(node: MdxNode, name: string): string | undefined {
  const v = attrOf(node, name)?.value;
  if (typeof v === "string") return v;
  return v?.value?.match(/^\s*(["'`])([\s\S]*)\1\s*$/)?.[2];
}

/** A heading's visible text. */
function nodeText(node: MdxNode): string {
  if (node.type === "text" || node.type === "inlineCode") return node.value ?? "";
  return (node.children ?? []).map(nodeText).join("");
}

/** A boolean attribute: present, unless it's name={false}. */
function flag(node: MdxNode, name: string): boolean {
  const attr = attrOf(node, name);
  if (!attr) return false;
  return !(typeof attr.value === "object" && attr.value?.value?.trim() === "false");
}

/**
 * The children in the page when it loads, so a link to them lands: the first
 * <Tab>, an <Accordion> only if it starts open, and nothing in a <CodeGroup>,
 * which shows only its fences.
 */
function shownChildren(node: MdxNode): MdxNode[] {
  const children = node.children ?? [];
  if (node.name === "CodeGroup") return [];
  if (node.name === "Accordion" && !flag(node, "defaultOpen")) return [];
  // <Tabs> takes its first element: a comment or {" "} before it renders nothing.
  if (node.name === "Tabs") return children.filter((c) => !c.type.endsWith("Expression")).slice(0, 1);
  return children;
}

const isTocHeading = (node: MdxNode) => node.type === "heading" && (node.depth === 2 || node.depth === 3);

/**
 * What "On this page" lists, and the id of each ## and ### heading and listed
 * step, from one walk of the parsed page, so the links and the ids agree.
 *
 * Ids are unique in the page. A repeat gets -1, -2, …, skipping every id the
 * page has: one written on an element, and any heading's or step's own slug,
 * so "Verify", "Verify", "Verify 1" are verify, verify-2, verify-1. A heading
 * with no slug (only an emoji, say) gets no id and isn't listed. Headings that
 * aren't showing when the page loads (a later <Tab>, a closed <Accordion>) are
 * still on it, so they get ids too. A step's id is `step-<slug>`. (A <Tab> and
 * its <Steps> on one line are read as text, so a step there can still be listed
 * from a tab that isn't showing.) `reserved` are ids the page already has
 * outside this MDX, such as the changelog's entries around its intro; they're
 * skipped like an element's id.
 */
type TocOptions = { steps?: boolean; reserved?: string[] };

function planToc(tree: MdxNode, opts: TocOptions) {
  const used = new Set<string>(opts.reserved ?? []);
  const natural = new Set<string>();
  const reserve = (node: MdxNode) => {
    if (isTocHeading(node)) natural.add(slugify(nodeText(node)));
    if (node.name === "Step") natural.add(`step-${slugify(titleText(stringAttr(node, "title") ?? ""))}`);
    const id = stringAttr(node, "id");
    if (id) used.add(id);
    (node.children ?? []).forEach(reserve);
  };
  reserve(tree);

  const claim = (slug: string) => {
    let id = slug;
    for (let n = 1; used.has(id) || (id !== slug && natural.has(id)); n++) id = `${slug}-${n}`;
    used.add(id);
    return id;
  };

  const ids = new Map<MdxNode, string>();
  const name = (node: MdxNode) => {
    if (isTocHeading(node)) {
      const slug = slugify(nodeText(node));
      if (slug) ids.set(node, claim(slug));
    }
    (node.children ?? []).forEach(name);
  };
  name(tree);

  const items: TocItem[] = [];
  const steps = new Map<MdxNode, string>();
  let underH2 = false;
  const visit = (node: MdxNode, listing: boolean) => {
    let list = listing;
    if (node.type === "heading") {
      if (node.depth === 2) underH2 = true;
      const id = ids.get(node);
      if (id) items.push({ id, label: nodeText(node).trim(), depth: node.depth as 2 | 3 });
      return;
    }
    if (node.name === "Steps") list = !!opts.steps || flag(node, "toc");
    else if (node.name === "Step" && listing) {
      // What the reader sees: the title's text, without its Markdown or URLs.
      const label = titleText(stringAttr(node, "title") ?? "");
      const slug = slugify(label);
      if (slug) {
        const id = claim(`step-${slug}`);
        steps.set(node, id);
        items.push({ id, label, depth: underH2 ? 3 : 2 });
      }
    }
    shownChildren(node).forEach((c) => visit(c, list));
  };
  visit(tree, false);
  return { items, headings: ids, steps, ids: used };
}

const parser = unified().use(remarkParse).use(remarkGfm).use(remarkMdx);

/**
 * The page's ## and ### headings, in order.
 *
 * Step titles are listed too inside `<Steps toc>`, or in every <Steps> with
 * `steps: true` (frontmatter `toc: steps`). A step sits one level below the
 * ## heading before it, or at the top level when there's none. A page that
 * doesn't parse can't render either, so it has none.
 */
export function extractToc(body: string, opts: { steps?: boolean } = {}): TocItem[] {
  try {
    return planToc(parser.parse(body) as MdxNode, opts).items;
  } catch {
    return [];
  }
}

/**
 * The ids in a frontmatter `toc:` list that nothing on the page has, so a
 * hand-written link that misses its heading can be reported.
 */
export function missingTocIds(body: string, toc: TocItem[], opts: { steps?: boolean } = {}): string[] {
  let ids: Set<string>;
  try {
    ids = planToc(parser.parse(body) as MdxNode, opts).ids;
  } catch {
    return [];
  }
  return toc.map((t) => String(t?.id ?? "")).filter((id) => id && !ids.has(id));
}

/**
 * Remark plugin: the ids extractToc links to, on the page's headings and the
 * steps it lists. Other steps get none, so they can't take over a heading's
 * anchor.
 */
export function remarkTocIds(opts: TocOptions = {}) {
  return (tree: MdxNode) => {
    const { headings, steps } = planToc(tree, opts);
    for (const [node, id] of headings) {
      node.data ??= {};
      node.data.hProperties = { ...node.data.hProperties, id };
    }
    for (const [node, id] of steps) {
      (node.attributes ??= []).push({ type: "mdxJsxAttribute", name: "id", value: id });
    }
  };
}

/** The names of the MDX elements a page uses, as written (`<Callout>` gives
 *  "Callout"). One in a code block isn't one. A page that doesn't parse uses none. */
export function elementsIn(body: string): Set<string> {
  const names = new Set<string>();
  const walk = (node: MdxNode) => {
    if ((node.type === "mdxJsxFlowElement" || node.type === "mdxJsxTextElement") && node.name) names.add(node.name);
    (node.children ?? []).forEach(walk);
  };
  try {
    walk(parser.parse(body) as MdxNode);
  } catch {}
  return names;
}
