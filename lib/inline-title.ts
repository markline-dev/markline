/* A title written as a string prop (<Step title="Set `API_KEY`">) read as
 * inline Markdown: code, bold, italics, strikethrough and links. Anything else
 * (an image, HTML, a list marker) keeps only its text. Pure, so it's
 * unit-tested; the step heading renders `titleNodes`, and "On this page" and
 * the step's id use `titleText`. */

import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import { unified } from "unified";

export type TitleNode =
  | { type: "text"; value: string }
  | { type: "code"; value: string }
  | { type: "strong" | "em" | "del"; children: TitleNode[] }
  | { type: "link"; href?: string; children: TitleNode[] };

type Md = { type: string; value?: string; url?: string; alt?: string; children?: Md[] };

const parser = unified().use(remarkParse).use(remarkGfm);

/** A link a title may have: a path or #anchor on this site, http(s) or mailto.
 *  Anything else (javascript:, data:, vbscript:, …) is dropped. */
export function safeHref(url: string | undefined): string | undefined {
  if (!url) return undefined;
  const u = url.trim();
  if (/^(\/|#|\.{0,2}\/)/.test(u) || /^[^:/?#]+(\/|$|[?#])/.test(u)) return u; // relative
  return /^(https?:|mailto:)/i.test(u) ? u : undefined;
}

function convert(node: Md): TitleNode[] {
  const kids = () => (node.children ?? []).flatMap(convert);
  switch (node.type) {
    case "text":
      return [{ type: "text", value: node.value ?? "" }];
    case "inlineCode":
      return [{ type: "code", value: node.value ?? "" }];
    case "strong":
      return [{ type: "strong", children: kids() }];
    case "emphasis":
      return [{ type: "em", children: kids() }];
    case "delete":
      return [{ type: "del", children: kids() }];
    case "link":
      return [{ type: "link", href: safeHref(node.url), children: kids() }];
    case "image":
      return node.alt ? [{ type: "text", value: node.alt }] : [];
    case "break":
      return [{ type: "text", value: " " }];
    case "html":
      return []; // raw HTML isn't rendered, and has no text of its own
    default:
      return kids();
  }
}

/** A title is one line of inline text, so what would start a block (a list
 *  marker, "1.", "#", ">", indentation) is kept as text. */
function inlineOnly(title: string): string {
  return title
    .trim()
    .replace(/^(\d+)([.)])(?=\s|$)/, "$1\\$2")
    .replace(/^([#>*+-])(?=\s|$)/, "\\$1");
}

/** The title as a small tree to render. A title that doesn't parse is its own text. */
export function titleNodes(title: string): TitleNode[] {
  try {
    const root = parser.parse(inlineOnly(title)) as Md;
    // Block content (a list, a heading marker) is read as the text inside it.
    return (root.children ?? []).flatMap((b, i) => [...(i ? [{ type: "text" as const, value: " " }] : []), ...convert(b)]);
  } catch {
    return [{ type: "text", value: title }];
  }
}

/** What a reader sees: code keeps its content, a link its text, never its URL. */
export function titleText(title: string): string {
  const text = (nodes: TitleNode[]): string =>
    nodes.map((n) => ("value" in n ? n.value : text(n.children))).join("");
  return text(titleNodes(title)).trim();
}
