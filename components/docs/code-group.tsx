import { Children, cloneElement, isValidElement, type ReactElement, type ReactNode } from "react";
import { codeGroupLabel, codeGroupSyncKey } from "@/lib/code-group";
import { CodeGroupTabs } from "./code-tabs";

type AnyProps = Record<string, unknown> & { children?: ReactNode };

/** A node's text, however it's nested (the copy button's code). */
function nodeText(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(nodeText).join("");
  if (isValidElement(node)) return nodeText((node.props as AnyProps).children);
  return "";
}

/** The first element under `node` (itself included) whose props match. */
function find(node: ReactNode, match: (p: AnyProps) => boolean): ReactElement<AnyProps> | undefined {
  for (const child of Children.toArray(node)) {
    if (!isValidElement(child)) continue;
    const el = child as ReactElement<AnyProps>;
    if (match(el.props)) return el;
    const deeper = find(el.props.children, match);
    if (deeper) return deeper;
  }
  return undefined;
}

/**
 * Plain fenced code blocks as tabs:
 *
 *   <CodeGroup>
 *   ```python
 *   …
 *   ```
 *   ```bash title="cURL"
 *   …
 *   ```
 *   </CodeGroup>
 *
 * Each fence is already highlighted by rehype-pretty-code (a <figure> with an
 * optional title <figcaption>, then the <pre>). The tab is named by the title,
 * else the language, and the <pre> is the panel. `sync` is described in
 * lib/code-group.ts.
 */
export function CodeGroup({ children, sync }: { children: ReactNode; sync?: string | boolean }) {
  const tabs = Children.toArray(children)
    .filter(isValidElement)
    .map((child) => {
      const title = find(child, (p) => "data-rehype-pretty-code-title" in p);
      const pre = find(child, (p) => typeof p["data-language"] === "string" && !("data-rehype-pretty-code-title" in p));
      if (!pre) return undefined;
      return {
        label: codeGroupLabel(title ? nodeText(title.props.children) : undefined, pre.props["data-language"] as string),
        code: nodeText(pre.props.children).replace(/\n$/, ""),
        panel: pre,
      };
    })
    .filter((t) => t !== undefined);
  if (tabs.length === 0) return null;
  const labels = tabs.map((t) => t.label);
  return (
    <CodeGroupTabs labels={labels} codes={tabs.map((t) => t.code)} syncKey={codeGroupSyncKey(labels, sync)}>
      {tabs.map((t, i) => cloneElement(t.panel, { key: i }))}
    </CodeGroupTabs>
  );
}
