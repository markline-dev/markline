// Markdown for agents: each page's Markdown (served at <page>.md) and an
// llms.txt index per top-level section (/<section>/llms.txt). Pure, so it's
// unit-tested; build-search.mjs writes the files to public/ (static export),
// and app/api/md + app/api/llms serve the same text under `next dev` and the
// Node server, where those files may not exist yet.
//
// A "doc" here is { url, title, lede, body, layout }: body is the MDX source
// without its frontmatter.

/** MDX body → portable Markdown: drop the MDX import/export lines (not the
 *  ones in code blocks), collapse blank runs. (Authored components like <Note>
 *  stay — they read fine as context.) */
export function mdxToMarkdown(md) {
  let fence = null;
  const kept = md.split("\n").filter((line) => {
    const f = line.match(/^\s*(```+|~~~+)/);
    if (f) {
      if (!fence) fence = f[1][0];
      else if (f[1][0] === fence) fence = null;
      return true;
    }
    return fence || !/^\s*(import|export)\s/.test(line);
  });
  return kept.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

/** A page as one Markdown document: its title, lede, then its body. */
export function pageMarkdown(doc) {
  let md = `# ${doc.title}\n\n`;
  if (doc.lede) md += `${doc.lede}\n\n`;
  md += mdxToMarkdown(doc.body);
  return `${md.trim()}\n`;
}

/** Where a page's Markdown is served: "/a/b" → "/a/b.md", "/" → "/index.md". */
export function markdownPath(url) {
  return url === "/" ? "/index.md" : `${url.replace(/\/$/, "")}.md`;
}

/** The page a .md path asks for: the inverse of markdownPath. */
export function pathFromMarkdown(mdPath) {
  const p = mdPath.replace(/\.md$/, "");
  return p === "/index" || p === "" ? "/" : p;
}

/** Every sidebar link of the docs tabs, in sidebar order, with its tab and group. */
function sidebarEntries(cfg) {
  const tabs = (cfg.navigation?.tabs ?? []).filter((t) => !t.openapi);
  const out = [];
  const flatten = (items) => (items ?? []).flatMap((p) => [...(p.href ? [p] : []), ...flatten(p.pages)]);
  for (const tab of tabs) {
    for (const g of tab.groups ?? []) {
      for (const p of flatten(g.pages)) out.push({ href: p.href, label: p.label, tab: tab.label ?? "", group: g.group ?? "" });
    }
  }
  return out;
}

/** The top-level folders that hold pages: "/eleven-api/quickstart" → "eleven-api". */
export function sectionIds(docs) {
  const ids = [];
  for (const d of docs) {
    const parts = d.url.split("/").filter(Boolean);
    if (parts.length > 1 && !ids.includes(parts[0])) ids.push(parts[0]);
  }
  return ids;
}

const pretty = (s) => s.replace(/[-_]+/g, " ").replace(/^./, (c) => c.toUpperCase());

/**
 * llms.txt for one top-level folder (`section`, e.g. "eleven-api"): the pages
 * under /<section>/, grouped and ordered as in the sidebar, with any the
 * sidebar doesn't list under "More". Undefined when the folder has no pages.
 *
 * `opts.name` is the site's name, `opts.abs` turns a path into a link.
 */
export function sectionIndex(cfg, docs, section, opts = {}) {
  const abs = opts.abs ?? ((u) => u);
  const prefix = `/${section}`;
  const inSection = (u) => u === prefix || u.startsWith(`${prefix}/`);
  const byUrl = new Map(docs.filter((d) => inSection(d.url) && d.layout !== "landing").map((d) => [d.url, d]));
  if (![...byUrl.keys()].some((u) => u !== prefix)) return undefined;

  const entries = sidebarEntries(cfg).filter((e) => byUrl.has(e.href));
  const tabs = [...new Set(entries.map((e) => e.tab))];
  // Named after the tab most of its pages sit in, else after the folder.
  const count = (t) => entries.filter((e) => e.tab === t).length;
  const title = [...tabs].sort((a, b) => count(b) - count(a))[0] || pretty(section);

  const groups = [];
  const used = new Set();
  for (const e of entries) {
    if (used.has(e.href)) continue;
    used.add(e.href);
    const heading = tabs.length > 1 ? [e.tab, e.group].filter(Boolean).join(" · ") : e.group || title;
    let g = groups.find((x) => x.heading === heading);
    if (!g) groups.push((g = { heading, pages: [] }));
    g.pages.push({ ...byUrl.get(e.href), title: e.label ?? byUrl.get(e.href).title });
  }
  const leftover = [...byUrl.values()].filter((d) => !used.has(d.url));
  if (leftover.length) groups.push({ heading: "More", pages: leftover });

  let txt = `# ${opts.name ? `${opts.name}: ` : ""}${title}\n\n`;
  txt +=
    `This index lists the pages under ${prefix}. Add \`.md\` to a page's URL for its Markdown. ` +
    `The index of the whole site is at [llms.txt](${abs("/llms.txt")}).\n\n`;
  for (const g of groups) {
    txt += `## ${g.heading}\n\n`;
    for (const p of g.pages) txt += `- [${p.title}](${abs(p.url)})${p.lede ? `: ${p.lede}` : ""}\n`;
    txt += "\n";
  }
  return `${txt.trim()}\n`;
}
