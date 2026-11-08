import { test } from "node:test";
import assert from "node:assert/strict";
import { pageToMarkdown } from "../lib/page-markdown";

// Just enough DOM for the walk: elements with a tag, class and attributes.
type Fake = {
  nodeType: number;
  tagName?: string;
  cls?: string;
  attrs?: Record<string, string>;
  childNodes: Fake[];
  textContent: string;
  matches: (selector: string) => boolean;
  querySelector: (selector: string) => Fake | null;
  querySelectorAll: (selector: string) => Fake[];
};

const text = (value: string): Fake => ({
  nodeType: 3,
  childNodes: [],
  textContent: value,
  matches: () => false,
  querySelector: () => null,
  querySelectorAll: () => [],
});

function el(tag: string, props: { cls?: string; role?: string; hidden?: boolean }, ...kids: (Fake | string)[]): Fake {
  const childNodes = kids.map((k) => (typeof k === "string" ? text(k) : k));
  const node: Fake = {
    nodeType: 1,
    tagName: tag.toUpperCase(),
    cls: props.cls,
    childNodes,
    get textContent() {
      return childNodes.map((c) => c.textContent).join("");
    },
    matches: (selector) => selector === `.${props.cls}`,
    querySelector(selector) {
      assert.equal(selector, '[role="tabpanel"]:not([hidden]) pre');
      const panel = childNodes.find((c) => c.attrs?.role === "tabpanel" && c.attrs.hidden !== "true");
      return panel?.childNodes.find((c) => c.tagName === "PRE") ?? null;
    },
    querySelectorAll(selector) {
      assert.equal(selector, ":scope > li");
      return childNodes.filter((c) => c.tagName === "LI");
    },
  };
  node.attrs = { role: props.role ?? "", hidden: String(!!props.hidden) };
  return node;
}

const group = el(
  "div",
  { cls: "ml-codegroup" },
  el("div", { cls: "ml-codepanel-head" }, el("button", {}, "npm"), el("button", {}, "pnpm"), el("button", {}, "Copy")),
  el("div", { role: "tabpanel" }, el("pre", {}, "npm install\n \nnpm test\n")),
  el("div", { role: "tabpanel", hidden: true }, el("pre", {}, "pnpm-install-cmd")),
);

const render = (...kids: Fake[]) =>
  pageToMarkdown("T", null, el("div", {}, ...kids) as unknown as Element);

test("a top-level code group copies as the tab on screen", () => {
  assert.equal(render(group), "# T\n\n```\nnpm install\n\nnpm test\n```");
});

test("a code group inside a step or callout copies the same way", () => {
  const step = el(
    "div",
    { cls: "steps" },
    el("div", { cls: "step" }, el("span", { cls: "num" }, "1"), el("h3", {}, "Install"), el("div", { cls: "step-body" }, el("p", {}, "Run it."), group)),
    el("div", { cls: "step" }, el("span", { cls: "num" }, "2"), el("h3", {}, "Use"), el("div", { cls: "step-body" }, el("p", {}, "Done."))),
  );
  assert.equal(
    render(step),
    "# T\n\n1. Install Run it.\n\n```\nnpm install\n\nnpm test\n```\n\n2. Use Done.",
  );
});

test("prose and headings keep their Markdown", () => {
  const md = render(el("h2", {}, "Title"), el("p", {}, "Body  text."), el("aside", { cls: "note" }, el("p", {}, "Careful.")));
  assert.equal(md, "# T\n\n## Title\n\nBody text.\n\nCareful.");
});

test("a code group in a list item copies the same way", () => {
  const list = el("ul", {}, el("li", {}, "First"), el("li", {}, el("p", {}, "Second"), group));
  assert.equal(render(list), "# T\n\n- First\n- Second\n\n```\nnpm install\n\nnpm test\n```");
});

