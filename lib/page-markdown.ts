/* A docs page's Markdown read from its rendered DOM, for the page actions until
 * or unless its .md file has loaded. Takes the elements rather than finding
 * them, so it's unit-tested. */

const clean = (s?: string | null) => (s || "").replace(/\s+/g, " ").trim();

const BLOCK = /^(?:H[1-6]|P|DIV|LI|UL|OL|PRE|BLOCKQUOTE|TABLE|TR)$/;

/** The tab on screen in a <CodeGroup>, as a fenced block. */
function groupFence(group: Element): string {
  const shown = group.querySelector('[role="tabpanel"]:not([hidden]) pre');
  return shown ? "```\n" + (shown.textContent || "").replace(/^ $/gm, "").trim() + "\n```" : "";
}

/** A component's text with its blocks spaced apart and its code groups fenced,
 *  however deep they sit. */
function flatten(root: Element): string {
  const parts = [""]; // text at even indexes, fences at odd
  const walk = (node: Node) => {
    if (node.nodeType === 3) parts[parts.length - 1] += node.textContent;
    if (node.nodeType !== 1) return;
    const el = node as Element;
    if (el.matches(".ml-codegroup")) {
      parts.push(groupFence(el), "");
      return;
    }
    if (el.matches(".num")) {
      parts[parts.length - 1] += `${el.textContent}. `;
      return;
    }
    el.childNodes.forEach(walk);
    if (BLOCK.test(el.tagName)) parts[parts.length - 1] += " ";
  };
  walk(root);
  return parts.map((p, i) => (i % 2 ? p : clean(p))).filter(Boolean).join("\n\n");
}

export function pageToMarkdown(title: string, lead: Element | null, prose: Element | null): string {
  let md = `# ${clean(title)}\n\n`;
  if (lead) md += clean(lead.textContent) + "\n\n";
  if (!prose) return md.trim();

  // Walk top-level prose nodes and emit a faithful-enough Markdown view.
  prose.childNodes.forEach((node) => {
    if (node.nodeType !== 1) return;
    const el = node as Element;
    const tag = el.tagName.toLowerCase();
    const text = clean(el.textContent);
    if (!text && tag !== "hr") return;
    switch (tag) {
      case "h2": md += `## ${text}\n\n`; break;
      case "h3": md += `### ${text}\n\n`; break;
      case "p": md += `${text}\n\n`; break;
      case "ul":
      case "ol": {
        el.querySelectorAll(":scope > li").forEach((li) => {
          md += `- ${flatten(li)}\n`;
        });
        md += "\n";
        break;
      }
      case "pre": md += "```\n" + (el.textContent || "").trim() + "\n```\n\n"; break;
      case "hr": md += "---\n\n"; break;
      default: {
        // Code panels, callouts, steps, cards — flatten to text.
        md += `${flatten(el)}\n\n`;
      }
    }
  });
  return md.trim();
}
