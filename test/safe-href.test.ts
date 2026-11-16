import { test } from "node:test";
import assert from "node:assert/strict";
import { quoteHref, safeHref } from "../scripts/safe-href.mjs";
import { bodyLinkIssues } from "../lib/body-links";
import { dropUnsafeLinks } from "../lib/config";

test("a path, #anchor, http(s), mailto or tel link is kept as written", () => {
  for (const u of ["/a", "/a/b?x=1#y", "a/b", "guide", "../a", "./a", "#x", "?q=1", "//cdn.example.com/x", "https://x.dev", "HTTP://x.dev", "mailto:a@b.c", "tel:+15550100"]) {
    assert.equal(safeHref(u), u, u);
  }
  assert.equal(safeHref("  /padded "), "/padded");
});

test("any other scheme, however it's written, isn't a link", () => {
  for (const u of ["javascript:alert(1)", " JavaScript:alert(1)", "java\tscript:alert(1)", "java\nscript:x", "\x01javascript:x", "data:text/html,x", "vbscript:x", "file:///etc/hosts", "ftp://x", "a:b", "", "   "]) {
    assert.equal(safeHref(u), undefined, JSON.stringify(u));
  }
  assert.equal(safeHref(undefined), undefined);
  assert.equal(safeHref(42), undefined);
});

test("a warning quotes the link, cut to 60 characters", () => {
  assert.equal(quoteHref(" data:x "), '"data:x"');
  assert.equal(quoteHref(`javascript:${"a".repeat(80)}`), JSON.stringify(`javascript:${"a".repeat(46)}…`));
});

test("a page's links shown as text are found, with their text, in every form", () => {
  const body = [
    "[Fine](/a) and [Bad](javascript:alert(1)) and [Ref][r] and [Mail](mailto:a@b.c).",
    "",
    "[r]: data:text/html,x",
    "",
    '<a href="vbscript:x">Raw *link*</a>',
    "",
    '<Card title="A card" href="javascript:void(0)">body</Card>',
    '<LinkItem href="file:///x" title="An item" />',
    '<Path num={1} href="ftp://x" arrow="→" title="A path">desc</Path>',
    '<BentoCard title="Bento" href="data:x">b</BentoCard>',
    '<Feature title="Feature" href="data:y">f</Feature>',
    '<CTAButton href="javascript:x">Get started</CTAButton>',
    '<Card title="Good card" href="/guides/a">ok</Card>',
    "<Card title={dynamic} href={someExpression}>skipped: not a literal</Card>",
    "<Note>Not a linking component, href=\"javascript:x\" is just text</Note>",
  ].join("\n");
  assert.deepEqual(bodyLinkIssues(body), [
    { text: "Bad", href: "javascript:alert(1)" },
    { text: "Ref", href: "data:text/html,x" },
    { text: "Raw link", href: "vbscript:x" },
    { text: "A card", href: "javascript:void(0)" },
    { text: "An item", href: "file:///x" },
    { text: "A path", href: "ftp://x" },
    { text: "Bento", href: "data:x" },
    { text: "Feature", href: "data:y" },
    { text: "Get started", href: "javascript:x" },
  ]);
  assert.deepEqual(bodyLinkIssues("[ok](https://x.dev) <Card title=\"c\" href=\"#x\" />"), []);
  assert.deepEqual(bodyLinkIssues("<Unclosed"), [], "a page that doesn't parse reports nothing here");
});

test("config links markline won't render are left out, each named by its key path", () => {
  const warned: string[] = [];
  const warn = (m: string) => warned.push(m);
  const footer = dropUnsafeLinks(
    {
      links: [{ label: "A", href: "/a" }, { label: "B", href: "https://b.dev" }, { label: "Bad", href: "javascript:x" }],
      socials: { github: "https://github.com/x", x: "data:x" },
      copyright: "© Acme",
    },
    "footer",
    warn,
  );
  assert.deepEqual(footer, { links: [{ label: "A", href: "/a" }, { label: "B", href: "https://b.dev" }], socials: { github: "https://github.com/x" }, copyright: "© Acme" });

  const topbar = dropUnsafeLinks(
    {
      links: [{ label: "Menu", items: [{ label: "Ok", href: "/ok" }, { label: "No", href: "vbscript:x" }] }],
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
        { id: "b", label: "B", href: "javascript:tab" },
      ],
    },
    "navigation",
    warn,
  );
  assert.deepEqual(navigation, {
    tabs: [{ id: "a", label: "A", href: "/", groups: [{ group: "G", pages: [{ label: "P", href: "/p" }, { label: "Folder", pages: [{ label: "Q", href: "/q" }] }] }] }],
  });

  const allowed = "(use a path, a #anchor, or an http:, https:, mailto: or tel: URL)";
  assert.deepEqual(warned, [
    `[markline] footer.links[2].href: "javascript:x" isn't a link markline renders ${allowed}; leaving it out.`,
    `[markline] footer.socials.x: "data:x" isn't a link markline renders ${allowed}; leaving it out.`,
    `[markline] topbar.links[0].items[1].href: "vbscript:x" isn't a link markline renders ${allowed}; leaving it out.`,
    `[markline] topbar.cta.href: "data:x" isn't a link markline renders ${allowed}; leaving it out.`,
    `[markline] topbar.banner.link.href: "file:///x" isn't a link markline renders ${allowed}; leaving it out.`,
    `[markline] navigation.tabs[0].groups[0].pages[1].href: "javascript:x" isn't a link markline renders ${allowed}; leaving it out.`,
    `[markline] navigation.tabs[0].groups[0].pages[2].href: "data:x" isn't a link markline renders ${allowed}; keeping the item as a folder.`,
    `[markline] navigation.tabs[1].href: "javascript:tab" isn't a link markline renders ${allowed}; leaving it out.`,
  ]);
  assert.equal(dropUnsafeLinks(undefined, "footer", warn), undefined);
});
