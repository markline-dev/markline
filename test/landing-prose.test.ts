import { test } from "node:test";
import assert from "node:assert/strict";
import { remarkLandingProse } from "../lib/landing-prose";

const jsx = (name: string) => ({ type: "mdxJsxFlowElement", name, children: [] });
const md = (type: string) => ({ type, children: [] });

function run(children: any[]) {
  const tree = { type: "root", children };
  remarkLandingProse()(tree);
  return tree.children.map((n: any) =>
    n.name === "div" ? `prose(${n.children.map((c: any) => c.name ?? c.type).join(",")})` : n.name ?? n.type,
  );
}

test("wraps markdown runs between landing sections", () => {
  assert.deepEqual(
    run([jsx("Hero"), md("heading"), md("paragraph"), md("list"), jsx("FeatureGrid"), md("paragraph")]),
    ["Hero", "prose(heading,paragraph,list)", "FeatureGrid", "prose(paragraph)"],
  );
});

test("docs components join the prose column; sections and imports stay at the root", () => {
  assert.deepEqual(
    run([{ type: "mdxjsEsm" }, md("paragraph"), jsx("Note"), jsx("CardGroup"), jsx("CTASection")]),
    ["mdxjsEsm", "prose(paragraph,Note,CardGroup)", "CTASection"],
  );
});

test("a page of only sections is left alone", () => {
  assert.deepEqual(run([jsx("MarklineHome")]), ["MarklineHome"]);
});

test("the wrapper carries the classes templates style", () => {
  const tree: any = { type: "root", children: [md("paragraph")] };
  remarkLandingProse()(tree);
  assert.equal(tree.children[0].attributes[0].value, "docs-prose ml-landing-prose");
});
