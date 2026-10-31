/* Landing pages (`layout: landing`) render MDX straight into .ml-landing, so
 * plain markdown between landing sections had no width, padding or type.
 * This remark plugin wraps each run of top-level blocks that aren't landing
 * sections in <div class="docs-prose ml-landing-prose">: the docs prose styles
 * apply, and a template restyles the column through that class (or
 * --landing-prose-width) without touching the sections around it. */

type Node = { type: string; name?: string | null; children?: Node[] };

/** Landing components that lay out their own full-bleed section. */
export const LANDING_SECTIONS = new Set([
  "Hero",
  "FeatureGrid",
  "CTASection",
  "StatStrip",
  "Bento",
  "MarklineHome",
]);

function isSection(node: Node): boolean {
  return node.type === "mdxJsxFlowElement" && !!node.name && LANDING_SECTIONS.has(node.name);
}

function proseWrapper(children: Node[]): Node {
  return {
    type: "mdxJsxFlowElement",
    name: "div",
    attributes: [{ type: "mdxJsxAttribute", name: "className", value: "docs-prose ml-landing-prose" }],
    children,
  } as Node;
}

export function remarkLandingProse() {
  return (tree: Node) => {
    const out: Node[] = [];
    let run: Node[] = [];
    const flush = () => {
      if (run.length) out.push(proseWrapper(run));
      run = [];
    };
    for (const node of tree.children ?? []) {
      // Imports/exports stay at the root; sections break the run.
      if (node.type === "mdxjsEsm" || isSection(node)) {
        flush();
        out.push(node);
      } else {
        run.push(node);
      }
    }
    flush();
    tree.children = out;
  };
}
