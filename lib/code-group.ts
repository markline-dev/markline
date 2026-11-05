/* <CodeGroup>: tab labels, the sync key groups share, and the remark step
 * that turns a fence's bare meta into its title. Pure, so it's unit-tested;
 * components/docs/code-group.tsx renders the tabs. */

import { isValidElement, type ReactNode } from "react";

/** How common fence languages read on a tab. Anything else shows as written. */
const LANG_LABELS: Record<string, string> = {
  bash: "Shell", sh: "Shell", shell: "Shell", zsh: "Shell", console: "Shell",
  curl: "cURL",
  py: "Python", python: "Python",
  ts: "TypeScript", typescript: "TypeScript", tsx: "TSX",
  js: "JavaScript", javascript: "JavaScript", jsx: "JSX", mjs: "JavaScript", cjs: "JavaScript",
  json: "JSON", jsonc: "JSON", yaml: "YAML", yml: "YAML", toml: "TOML", xml: "XML",
  html: "HTML", css: "CSS", sql: "SQL", graphql: "GraphQL",
  go: "Go", rust: "Rust", rs: "Rust", ruby: "Ruby", rb: "Ruby", java: "Java",
  kotlin: "Kotlin", kt: "Kotlin", swift: "Swift", php: "PHP", dart: "Dart",
  cs: "C#", csharp: "C#", cpp: "C++", c: "C", elixir: "Elixir",
  text: "Text", txt: "Text", plaintext: "Text",
};

/** A node's text, however it's nested (the copy button's code). A blank line
 *  in highlighted code is a line holding one space; copy it as blank. */
export function nodeText(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(nodeText).join("");
  if (!isValidElement(node)) return "";
  const props = node.props as { children?: ReactNode; "data-line"?: unknown };
  const text = nodeText(props.children);
  return "data-line" in props && text === " " ? "" : text;
}

/** A tab's label: the fence's `title`, else its language. */
export function codeGroupLabel(title: string | undefined, lang: string | undefined): string {
  const t = title?.trim();
  if (t) return t;
  const l = (lang ?? "").trim();
  return LANG_LABELS[l.toLowerCase()] ?? (l || "Code");
}

/**
 * Which groups switch together. By default it's the group's set of labels,
 * so every "Python / TypeScript / cURL" group follows the reader's last pick
 * and a "JSON / YAML" group doesn't. `sync="name"` puts groups with
 * different labels on one channel; `sync={false}` opts out.
 */
export function codeGroupSyncKey(labels: string[], sync?: string | boolean): string | null {
  if (sync === false) return null;
  if (typeof sync === "string" && sync.trim()) return sync.trim();
  return [...new Set(labels)].sort().join("|");
}

/**
 * Which tab shows after a synced pick of `label`: the current one if it already
 * has that label (two fences can share one), else the first that does.
 */
export function syncedTab(labels: string[], label: string, current: number): number {
  if (labels[current] === label) return current;
  const i = labels.indexOf(label);
  return i >= 0 ? i : current;
}

/** Labels used by more than one tab, which readers can't tell apart. */
export function duplicateLabels(labels: string[]): string[] {
  return [...new Set(labels.filter((l, i) => labels.indexOf(l) !== i))];
}

/** localStorage key for a sync channel. */
export function codeGroupStorageKey(key: string): string {
  return `markline:code-group:${key}`;
}

type MdNode = {
  type: string;
  name?: string | null;
  meta?: string | null;
  children?: MdNode[];
};

/** Bare fence meta that means something to rehype-pretty-code, not a label. */
const PRETTY_CODE_META = /^(?:showLineNumbers|\/.*\/[\w#-]*)$/;

/**
 * Remark plugin: inside a <CodeGroup>, a fence whose meta is a bare label
 * (```bash cURL, the Mintlify way) gets it as its title (title="cURL"), so it
 * names the tab. Meta that already has key=value pairs or {line ranges} is left
 * to rehype-pretty-code, as are showLineNumbers and /highlighted text/ beside a
 * label.
 */
export function remarkCodeGroupTitles() {
  return (tree: MdNode) => {
    const visit = (node: MdNode, inGroup: boolean) => {
      const group = inGroup || ((node.type === "mdxJsxFlowElement" || node.type === "mdxJsxTextElement") && node.name === "CodeGroup");
      if (group && node.type === "code" && node.meta) {
        const meta = node.meta.trim();
        if (meta && !/[={}]/.test(meta)) {
          const words = meta.split(/\s+/);
          const label = words.filter((w) => !PRETTY_CODE_META.test(w)).join(" ");
          const rest = words.filter((w) => PRETTY_CODE_META.test(w));
          node.meta = [...(label ? [`title="${label.replace(/"/g, "'")}"`] : []), ...rest].join(" ");
        }
      }
      for (const c of node.children ?? []) visit(c, group);
    };
    visit(tree, false);
  };
}
