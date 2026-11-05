import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { codeGroupLabel, codeGroupStorageKey, codeGroupSyncKey, duplicateLabels, nodeText, remarkCodeGroupTitles, syncedTab } from "../lib/code-group";

test("a tab is named by the fence's title, else its language", () => {
  assert.equal(codeGroupLabel("cURL", "bash"), "cURL");
  assert.equal(codeGroupLabel(undefined, "python"), "Python");
  assert.equal(codeGroupLabel("  ", "ts"), "TypeScript");
  assert.equal(codeGroupLabel(undefined, "elm"), "elm");
  assert.equal(codeGroupLabel(undefined, ""), "Code");
});

test("groups with the same labels share a sync key, in any order", () => {
  assert.equal(codeGroupSyncKey(["Python", "TypeScript", "cURL"]), codeGroupSyncKey(["cURL", "Python", "TypeScript"]));
  assert.notEqual(codeGroupSyncKey(["Python", "TypeScript"]), codeGroupSyncKey(["Python", "TypeScript", "cURL"]));
  assert.equal(codeGroupSyncKey(["JSON", "YAML"], "config"), "config");
  assert.equal(codeGroupSyncKey(["JSON", "YAML"], false), null);
  assert.equal(codeGroupStorageKey("lang"), "markline:code-group:lang");
});

test("a bare fence meta inside <CodeGroup> becomes its title", () => {
  const code = (meta: string | null) => ({ type: "code", lang: "bash", meta });
  const tree = {
    type: "root",
    children: [
      code("outside"),
      {
        type: "mdxJsxFlowElement",
        name: "CodeGroup",
        children: [code("cURL"), code('title="Shell"'), code("{1,3}"), code(null), code('My "x" file')],
      },
    ],
  };
  remarkCodeGroupTitles()(tree);
  const metas = [tree.children[0], ...(tree.children[1] as { children: { meta: string | null }[] }).children].map(
    (c) => (c as { meta: string | null }).meta,
  );
  assert.deepEqual(metas, ["outside", 'title="cURL"', 'title="Shell"', "{1,3}", null, `title="My 'x' file"`]);
});

test("a synced pick keeps a tab that already has the label", () => {
  const labels = ["Shell", "Shell", "Python"];
  assert.equal(syncedTab(labels, "Shell", 1), 1, "the second Shell stays reachable");
  assert.equal(syncedTab(labels, "Shell", 2), 0);
  assert.equal(syncedTab(labels, "Python", 1), 2);
  assert.equal(syncedTab(labels, "Go", 1), 1);
  assert.deepEqual(duplicateLabels(labels), ["Shell"]);
  assert.deepEqual(duplicateLabels(["a", "b"]), []);
});

test("pretty-code meta beside a fence isn't a tab name", () => {
  const titled = (meta: string) => {
    const fence = { type: "code", meta };
    remarkCodeGroupTitles()({ type: "mdxJsxFlowElement", name: "CodeGroup", children: [fence] });
    return fence.meta;
  };
  assert.equal(titled("showLineNumbers"), "showLineNumbers");
  assert.equal(titled("/foo/"), "/foo/");
  assert.equal(titled("/foo/#v"), "/foo/#v");
  assert.equal(titled("cURL showLineNumbers"), 'title="cURL" showLineNumbers');
  assert.equal(titled("My tab /foo/"), 'title="My tab" /foo/');
});

test("copied code keeps blank lines blank", () => {
  const line = (text: string) => createElement("span", { "data-line": "" }, text);
  const code = createElement("code", null, line("a"), "\n", line(" "), "\n", line("  b"));
  assert.equal(nodeText(code), "a\n\n  b");
});

