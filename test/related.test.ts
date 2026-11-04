import { test } from "node:test";
import assert from "node:assert/strict";
import { collectionLinks } from "../components/docs/nav-tree";

const sections = [
  {
    title: "",
    links: [
      { href: "/", label: "Home" },
      {
        label: "Train",
        children: [
          { href: "/train/a", label: "A" },
          { href: "/train/b", label: "B" },
          { label: "Deeper", children: [{ href: "/train/c", label: "C" }] },
        ],
      },
    ],
  },
  { title: "Guides", links: [{ href: "/g/1", label: "One" }, { href: "/g/2", label: "Two" }] },
];

test("collectionLinks lists the other pages in the same folder", () => {
  assert.deepEqual(collectionLinks(sections as never, "/train/a").map((l) => l.href), ["/train/b", "/train/c"]);
});

test("collectionLinks uses the named group for a page directly in it", () => {
  assert.deepEqual(collectionLinks(sections as never, "/g/1").map((l) => l.href), ["/g/2"]);
});

test("collectionLinks gives nothing for a top-level page in an unnamed group", () => {
  assert.deepEqual(collectionLinks(sections as never, "/"), []);
});

test("collectionLinks caps the list", () => {
  assert.equal(collectionLinks(sections as never, "/train/a", 1).length, 1);
});
