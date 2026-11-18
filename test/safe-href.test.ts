import { test } from "node:test";
import assert from "node:assert/strict";
import remarkGfm from "remark-gfm";
import remarkMdx from "remark-mdx";
import remarkParse from "remark-parse";
import { unified } from "unified";
import { quoteHref, safeHref } from "../scripts/safe-href.mjs";
import { bodyLinkIssues, remarkSafeLinks, warnBodyLink } from "../lib/body-links";
import { cleanConfigLinks, dropUnsafeLinks, type MarklineConfig } from "../lib/config";

const RULE = "markline doesn't link to javascript:, data:, vbscript: or file: URLs";

test("a link is kept as written unless it's javascript:, data:, vbscript: or file:", () => {
  for (const u of [
    "/a", "/a/b?x=1#y", "a/b", "guide", "../a", "./a", "#x", "?q=1", "//cdn.example.com/x",
    "https://x.dev", "HTTP://x.dev", "mailto:a@b.c", "tel:+15550100", "sms:+15550100",
    "vscode:extension/x", "cursor://anysphere.cursor-deeplink/mcp/install?x=1", "webcal://x", "ftp://x", "a:b",
  ]) {
    assert.equal(safeHref(u), u, u);
  }
  assert.equal(safeHref("  /padded "), "/padded");
});

test("javascript:, data:, vbscript: and file: aren't links, however they're written", () => {
  for (const u of [
    "javascript:alert(1)", " JavaScript:alert(1)", "java\tscript:alert(1)", "java\nscript:x", "\x01javascript:x",
    "data:text/html,x", "DATA:x", "vbscript:x", "file:///etc/hosts",
    // Spaces trim() drops before the scheme, which the browser then reads.
    "\u00a0data:text/html,x", "\ufeffjavascript:x", "\u3000data:x", "\u2028javascript:x", "\u00a0\x01 javascript:x",
  ]) {
    assert.equal(safeHref(u), undefined, JSON.stringify(u));
  }
  for (const u of ["", "   ", undefined, 42]) assert.equal(safeHref(u), undefined, String(u));
});

test("a warning quotes the link, cut to 60 characters", () => {
  assert.equal(quoteHref(" data:x "), '"data:x"');
  assert.equal(quoteHref(`javascript:${"a".repeat(80)}`), JSON.stringify(`javascript:${"a".repeat(46)}…`));
});

test("a page's dropped links are found, with their text, in every form", () => {
  const body = [
    "[Fine](/a) and [Bad](javascript:alert(1)) and [Ref][r] and [Mail](mailto:a@b.c) and [Editor](vscode:x).",
    "",
    "[r]: data:text/html,x",
    "",
    '<a href="vbscript:x">Raw *link*</a>',
    '<a href={"javascript:expr()"}>Expression link</a>',
    "<a href={`data:text/html,tpl`}>Template link</a>",
    '<a {...{ href: "file:///spread", target: "_blank" }}>Spread link</a>',
    '<a href="/ok" {...{ href: "data:last" }}>Last wins</a>',
    '<a {...{ href: "/ok" }} href="data:attr-last">Attribute last</a>',
    '<a href="/ok" {...{ ...{ href: "javascript:nested" } }}>Nested spread</a>',
    '<a href="data:first" {...props}>Unknown after</a>',
    '<a href="data:early" href="/fine">Good last</a>',
    "",
    '<Card title="A card" href="javascript:void(0)">body</Card>',
    '<LinkItem href="file:///x" title="An item" />',
    '<Path num={1} href={"data:x"} arrow="→" title="A path">desc</Path>',
    '<BentoCard title="Bento" href="data:x">b</BentoCard>',
    '<Feature title="Feature" href="data:y">f</Feature>',
    '<CTAButton href="javascript:x">Get started</CTAButton>',
    '<Card title="Good card" href="/guides/a">ok</Card>',
    "<Card title={dynamic} href={someExpression}>a computed href isn't known here</Card>",
    '<Note>Not a linking component, href="javascript:x" is just text</Note>',
  ].join("\n");
  assert.deepEqual(bodyLinkIssues(body), [
    { text: "Bad", href: "javascript:alert(1)" },
    { text: "Ref", href: "data:text/html,x" },
    { text: "Raw link", href: "vbscript:x" },
    { text: "Expression link", href: "javascript:expr()" },
    { text: "Template link", href: "data:text/html,tpl" },
    { text: "Spread link", href: "file:///spread" },
    { text: "Last wins", href: "data:last" },
    { text: "Attribute last", href: "data:attr-last" },
    { text: "Nested spread", href: "javascript:nested" },
    { text: "Unknown after", href: "data:first" },
    { text: "A card", href: "javascript:void(0)" },
    { text: "An item", href: "file:///x" },
    { text: "A path", href: "data:x" },
    { text: "Bento", href: "data:x" },
    { text: "Feature", href: "data:y" },
    { text: "Get started", href: "javascript:x" },
  ]);
  assert.deepEqual(bodyLinkIssues('[ok](https://x.dev) [app](cursor://x) <Card title="c" href="#x" />'), []);
  assert.deepEqual(bodyLinkIssues("<Unclosed"), [], "a page that doesn't parse reports nothing here");
});

test("remarkSafeLinks turns a dropped JSX <a> into a <span> and reports it once, by file", () => {
  const warned: string[] = [];
  const pipeline = unified().use(remarkParse).use(remarkGfm).use(remarkMdx).use(remarkSafeLinks, { file: "docs/p.mdx", warn: (m: string) => warned.push(m) });
  const body = '<a href="javascript:x()" title="t">Raw</a> <a href={"data:x"}>Expr</a> <a {...{ href: "file:///s" }}>Spread</a> <a href="/ok">Ok</a> <Card title="C" href="data:c" /> <a href="/ok" target="_blank" {...{ href: "data:last" }}>Last</a>';
  type N = { type: string; name?: string; attributes?: { name?: string; type: string }[]; children?: N[] };
  const run = () => pipeline.runSync(pipeline.parse(body)) as unknown as N;
  const jsx: N[] = [];
  const walk = (n: N) => {
    if (n.type.startsWith("mdxJsx")) jsx.push(n);
    n.children?.forEach(walk);
  };
  walk(run());
  assert.deepEqual(
    jsx.map((n) => [n.name, (n.attributes ?? []).map((a) => a.name ?? a.type)]),
    [["span", ["title"]], ["span", []], ["span", []], ["a", ["href"]], ["Card", ["title", "href"]], ["span", ["target"]]],
    "the <a>s lose the href and become spans; a component keeps its own and checks it as it renders",
  );
  assert.deepEqual(warned, [
    `[markline] docs/p.mdx: the link "Raw" goes to "javascript:x()", and ${RULE}; it's shown as text.`,
    `[markline] docs/p.mdx: the link "Expr" goes to "data:x", and ${RULE}; it's shown as text.`,
    `[markline] docs/p.mdx: the link "Spread" goes to "file:///s", and ${RULE}; it's shown as text.`,
    `[markline] docs/p.mdx: the link "C" goes to "data:c", and ${RULE}; it's shown as text.`,
    `[markline] docs/p.mdx: the link "Last" goes to "data:last", and ${RULE}; it's shown as text.`,
  ]);
  run(); // compiled again, as the dev server does on each request
  assert.equal(warned.length, 5, "each warning is said once per process");
});

test("a warning is said once per process", () => {
  const warned: string[] = [];
  const issue = { text: "Once", href: "data:once" };
  warnBodyLink("docs/once.mdx", issue, (m) => warned.push(m));
  warnBodyLink("docs/once.mdx", issue, (m) => warned.push(m));
  warnBodyLink("docs/other.mdx", issue, (m) => warned.push(m));
  assert.equal(warned.length, 2);
});

test("config links markline won't render are left out, each named by its key path", () => {
  const warned: string[] = [];
  const warn = (m: string) => warned.push(m);
  const footer = dropUnsafeLinks(
    {
      links: [{ label: "A", href: "/a" }, { label: "B", href: "https://b.dev" }, { label: "Bad", href: "javascript:x" }, { label: "App", href: "vscode:x" }],
      columns: [{ title: "Gone", links: [{ label: "X", href: "data:x" }] }, { title: "Kept", links: [{ label: "K", href: "/k" }] }],
      socials: { github: "https://github.com/x", x: "data:x" },
      copyright: "© Acme",
    },
    "footer",
    warn,
  );
  assert.deepEqual(footer, {
    links: [{ label: "A", href: "/a" }, { label: "B", href: "https://b.dev" }, { label: "App", href: "vscode:x" }],
    columns: [{ title: "Kept", links: [{ label: "K", href: "/k" }] }],
    socials: { github: "https://github.com/x" },
    copyright: "© Acme",
  });

  const topbar = dropUnsafeLinks(
    {
      links: [
        { label: "Menu", items: [{ label: "Ok", href: "/ok" }, { label: "No", href: "vbscript:x" }] },
        { label: "Empty menu", items: [{ label: "No", href: "data:x" }] },
      ],
      cta: { label: "Go", href: "data:x" },
      secondaryCta: { label: "Docs", href: "/docs" },
      banner: { text: "Hi", link: { label: "More", href: "file:///x" } },
    },
    "topbar",
    warn,
  );
  assert.deepEqual(topbar, {
    links: [{ label: "Menu", items: [{ label: "Ok", href: "/ok" }] }],
    secondaryCta: { label: "Docs", href: "/docs" },
    banner: { text: "Hi" },
  });

  const navigation = dropUnsafeLinks(
    {
      tabs: [
        { id: "a", label: "A", href: "/", groups: [{ group: "G", pages: [{ label: "P", href: "/p" }, { label: "X", href: "javascript:x" }, { label: "Folder", href: "data:x", pages: [{ label: "Q", href: "/q" }] }] }] },
        { id: "b", label: "B", href: "javascript:tab", groups: [{ group: "H", pages: [{ label: "Bad first", href: "data:y" }, { label: "R", href: "/r" }] }] },
        { id: "c", label: "C", href: "data:c", groups: [] },
        { id: "e", label: "E", href: "data:e", groups: [{ group: "Out", pages: [{ label: "Ext", href: "https://ext.dev" }, { label: "In", href: "/in" }] }] },
        { id: "d", label: "D", href: "/d", groups: [{ group: "Empty", pages: [{ label: "Z", href: "data:z" }] }, { group: "Linked folder", pages: [{ label: "L", href: "/l", pages: [{ label: "Y", href: "data:y2" }] }] }] },
      ],
    },
    "navigation",
    warn,
  );
  assert.deepEqual(navigation, {
    tabs: [
      { id: "a", label: "A", href: "/", groups: [{ group: "G", pages: [{ label: "P", href: "/p" }, { label: "Folder", pages: [{ label: "Q", href: "/q" }] }] }] },
      { id: "b", label: "B", href: "/r", groups: [{ group: "H", pages: [{ label: "R", href: "/r" }] }] },
      { id: "e", label: "E", href: "/in", groups: [{ group: "Out", pages: [{ label: "Ext", href: "https://ext.dev" }, { label: "In", href: "/in" }] }] },
      { id: "d", label: "D", href: "/d", groups: [{ group: "Linked folder", pages: [{ label: "L", href: "/l" }] }] },
    ],
  }, "a tab keeps its sidebar; a group, menu or column with nothing left goes; a folder with a link of its own stays a link");

  const out = (p: string, href: string, what = "leaving it out") => `[markline] ${p}: "${href}": ${RULE}; ${what}.`;
  assert.deepEqual(warned, [
    out("footer.links[2].href", "javascript:x"),
    out("footer.columns[0].links[0].href", "data:x"),
    out("footer.socials.x", "data:x"),
    out("topbar.links[0].items[1].href", "vbscript:x"),
    out("topbar.links[1].items[0].href", "data:x"),
    out("topbar.cta.href", "data:x"),
    out("topbar.banner.link.href", "file:///x"),
    out("navigation.tabs[0].groups[0].pages[1].href", "javascript:x"),
    out("navigation.tabs[0].groups[0].pages[2].href", "data:x", "keeping the item as a folder"),
    out("navigation.tabs[1].groups[0].pages[0].href", "data:y"),
    out("navigation.tabs[1].href", "javascript:tab", "the tab links to its first page, /r, instead"),
    out("navigation.tabs[2].href", "data:c"),
    out("navigation.tabs[3].href", "data:e", "the tab links to its first page, /in, instead"),
    out("navigation.tabs[4].groups[0].pages[0].href", "data:z"),
    out("navigation.tabs[4].groups[1].pages[0].pages[0].href", "data:y2"),
  ]);
  assert.equal(dropUnsafeLinks(undefined, "footer", warn), undefined);
});

test("an editUrl markline won't link to leaves out Edit this page", () => {
  const warned: string[] = [];
  const base = { navigation: { tabs: [] }, topbar: { links: [] } } as unknown as MarklineConfig;
  assert.equal(cleanConfigLinks({ ...base, editUrl: "javascript:edit()" }, (m) => warned.push(m)).editUrl, undefined);
  assert.deepEqual(warned, [`[markline] editUrl: "javascript:edit()": ${RULE}; leaving out "Edit this page".`]);
  assert.equal(cleanConfigLinks({ ...base, editUrl: "https://github.com/o/r/edit/main/" }, (m) => warned.push(m)).editUrl, "https://github.com/o/r/edit/main/");
  assert.equal(warned.length, 1);
});
