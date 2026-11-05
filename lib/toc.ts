/* "On this page", built from a page's own ## and ### headings when its
 * frontmatter doesn't list them. Pure, so it's unit-tested. The heading ids
 * here and in components/docs/mdx.tsx both come from slugify(), so the links
 * land. */

import remarkMdx from "remark-mdx";
import remarkParse from "remark-parse";
import { unified } from "unified";

export type TocItem = { id: string; label: string; depth?: 2 | 3 };

export function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

/** Inline markdown in a heading → its visible text. */
export function headingText(md: string): string {
  return md
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1") // images
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1") // links
    .replace(/<[^>]+>/g, "") // inline JSX / HTML
    .replace(/`([^`]*)`/g, "$1") // code
    .replace(/(\*\*|__|\*|_|~~)(.+?)\1/g, "$2") // emphasis
    .replace(/\s+#+\s*$/, "") // closing #s
    .trim();
}

type MdxAttr = { type: string; name?: string; value?: string | { value?: string } | null };
type MdxNode = {
  type: string;
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

/** A heading's visible text, as its rendered id reads it (mdx.tsx textOf). */
function nodeText(node: MdxNode): string {
  if (node.type === "text" || node.type === "inlineCode") return node.value ?? "";
  return (node.children ?? []).map(nodeText).join("");
}

/** A <Steps> asks for its titles with `toc`, unless it's toc={false}. */
function listsSteps(node: MdxNode): boolean {
  const toc = attrOf(node, "toc");
  if (!toc) return false;
  return !(typeof toc.value === "object" && toc.value?.value?.trim() === "false");
}

/**
 * What "On this page" lists, and the id of each step in it, from one walk of
 * the parsed page, so the links and the page can't disagree. A step's id is
 * `step-<slug>`, moved along if a heading, an element or an earlier step has it.
 */
function planToc(tree: MdxNode, opts: { steps?: boolean }) {
  const taken = new Set<string>();
  const reserve = (node: MdxNode) => {
    if (node.type === "heading") taken.add(slugify(nodeText(node)));
    const id = stringAttr(node, "id");
    if (id) taken.add(id);
    (node.children ?? []).forEach(reserve);
  };
  reserve(tree);

  const stepId = (slug: string) => {
    let id = `step-${slug}`;
    for (let n = 2; taken.has(id); n++) id = `step-${slug}-${n}`;
    taken.add(id);
    return id;
  };

  const items: TocItem[] = [];
  const steps = new Map<MdxNode, string>();
  let underH2 = false;
  const visit = (node: MdxNode, listing: boolean) => {
    let list = listing;
    if (node.type === "heading") {
      if (node.depth === 2) underH2 = true;
      const label = nodeText(node).trim();
      const id = slugify(label);
      if ((node.depth === 2 || node.depth === 3) && label && id) items.push({ id, label, depth: node.depth });
      return;
    }
    if (node.name === "Steps") list = !!opts.steps || listsSteps(node);
    else if (node.name === "Step" && listing) {
      const label = headingText(stringAttr(node, "title") ?? "");
      const slug = slugify(label);
      if (label && slug) {
        const id = stepId(slug);
        steps.set(node, id);
        items.push({ id, label, depth: underH2 ? 3 : 2 });
      }
    }
    (node.children ?? []).forEach((c) => visit(c, list));
  };
  visit(tree, false);
  return { items, steps };
}

const parser = unified().use(remarkParse).use(remarkMdx);

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
 * Remark plugin: the id of each step extractToc lists, so its link lands. Other
 * steps get none, so they can't take over a heading's anchor.
 */
export function remarkStepIds(opts: { steps?: boolean } = {}) {
  return (tree: MdxNode) => {
    for (const [node, id] of planToc(tree, opts).steps) {
      (node.attributes ??= []).push({ type: "mdxJsxAttribute", name: "id", value: id });
    }
  };
}
