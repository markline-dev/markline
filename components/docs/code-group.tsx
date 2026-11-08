import { Children, cloneElement, isValidElement, type ReactElement, type ReactNode } from "react";
import { codeGroupLabel, codeGroupSyncKey, duplicateLabels, nodeText } from "@/lib/code-group";
import { CodeGroupTabs } from "./code-tabs";

type AnyProps = Record<string, unknown> & { children?: ReactNode };

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
      if (!pre) {
        console.warn("[markline] <CodeGroup> shows only fenced code blocks; other content in it is dropped.");
        return undefined;
      }
      return {
        label: codeGroupLabel(title ? nodeText(title.props.children) : undefined, pre.props["data-language"] as string),
        code: nodeText(pre.props.children).replace(/\n$/, ""),
        panel: pre,
      };
    })
    .filter((t) => t !== undefined);
  if (tabs.length === 0) return null;
  const labels = tabs.map((t) => t.label);
  for (const label of duplicateLabels(labels)) {
    console.warn(`[markline] <CodeGroup> has more than one "${label}" tab; give those fences a title.`);
  }
  return (
    <CodeGroupTabs labels={labels} codes={tabs.map((t) => t.code)} syncKey={codeGroupSyncKey(labels, sync)}>
      {tabs.map((t, i) => cloneElement(t.panel, { key: i }))}
    </CodeGroupTabs>
  );
}
