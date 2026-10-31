import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  deepMerge,
  loadTemplateChain,
  pickTemplateOptions,
  satisfiesVersion,
  templateCss,
  templateOptions,
  escapeStyleText,
} from "../lib/templates.ts";

/** Lay out a throwaway tree: { "builtin/classic/template.json": {...} }. */
function tree(files: Record<string, unknown>): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ml-tpl-"));
  for (const [rel, body] of Object.entries(files)) {
    const p = path.join(root, rel);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, typeof body === "string" ? body : JSON.stringify(body));
  }
  return root;
}

test("a built-in name resolves under the built-in dir and follows extends, base first", () => {
  const root = tree({
    "builtin/classic/template.json": { name: "classic", theme: { appearance: "dark", buttonRadius: "999px" } },
    "builtin/paper/template.json": { name: "paper", extends: "classic", theme: { appearance: "light" } },
  });
  const chain = loadTemplateChain("paper", path.join(root, "site"), path.join(root, "builtin"));
  assert.deepEqual(chain.map((t) => t.manifest.name), ["classic", "paper"]);
  assert.deepEqual(templateOptions(chain).theme, { appearance: "light", buttonRadius: "999px" });
});

test("a ./path resolves relative to markline.json, and its extends relative to itself", () => {
  const root = tree({
    "site/tpl/acme/template.json": { name: "acme", extends: "./base" },
    "site/tpl/acme/base/template.json": { name: "base", theme: { buttonRadius: "4px" } },
  });
  const chain = loadTemplateChain("./tpl/acme", path.join(root, "site"), path.join(root, "builtin"));
  assert.deepEqual(chain.map((t) => t.manifest.name), ["base", "acme"]);
});

test("a missing template throws instead of quietly rendering the default look", () => {
  const root = tree({});
  assert.throws(() => loadTemplateChain("nope", root, path.join(root, "builtin")), /template "nope" not found/);
});

test("an extends cycle is reported, not looped", () => {
  const root = tree({
    "builtin/a/template.json": { name: "a", extends: "b" },
    "builtin/b/template.json": { name: "b", extends: "a" },
  });
  assert.throws(() => loadTemplateChain("a", root, path.join(root, "builtin")), /extends cycle/);
});

test("templates can set layout, and it merges over the base template's", () => {
  const root = tree({
    "builtin/classic/template.json": { name: "classic", layout: { header: "single", search: "sidebar" } },
    "builtin/product-docs/template.json": { name: "product-docs", extends: "classic", layout: { header: "stacked" } },
  });
  const chain = loadTemplateChain("product-docs", root, path.join(root, "builtin"));
  assert.deepEqual(templateOptions(chain).layout, { header: "stacked", search: "sidebar" });
});

test("templates can only set theme, layout and the topbar widths", () => {
  const warnings: string[] = [];
  const picked = pickTemplateOptions(
    {
      name: "sneaky",
      theme: { appearance: "dark" },
      topbar: { width: "contained", cta: { label: "x", href: "/x" } },
      ai: { endpoint: "https://elsewhere.example" },
      navigation: { tabs: [] },
    } as never,
    (m) => warnings.push(m),
  );
  assert.deepEqual(picked, { theme: { appearance: "dark" }, topbar: { width: "contained" } });
  assert.equal(warnings.length, 3); // ai, navigation, topbar.cta
});

test("deepMerge keeps a template's palette when the user overrides one entry", () => {
  const template = { cssVariables: { light: { "--c-paper": "1 1 1", "--c-ink": "2 2 2" } } };
  const user = { cssVariables: { light: { "--c-ink": "9 9 9" } } };
  assert.deepEqual(deepMerge(template, user), {
    cssVariables: { light: { "--c-paper": "1 1 1", "--c-ink": "9 9 9" } },
  });
  // Arrays and scalars replace rather than merge.
  assert.deepEqual(deepMerge({ a: [1, 2], b: "x" }, { a: [3], b: "y" }), { a: [3], b: "y" });
  // undefined in the override leaves the base value alone.
  assert.deepEqual(deepMerge({ a: 1 }, { a: undefined }), { a: 1 });
});

test("template stylesheets concatenate base first", () => {
  const root = tree({
    "builtin/classic/template.json": { name: "classic" },
    "builtin/classic/template.css": ".a{}",
    "builtin/paper/template.json": { name: "paper", extends: "classic" },
    "builtin/paper/template.css": ".b{}",
  });
  const css = templateCss(loadTemplateChain("paper", root, path.join(root, "builtin")));
  assert.ok(css.indexOf(".a{}") < css.indexOf(".b{}"));
});

test("satisfiesVersion handles >=, ^ and exact, and says when it can't tell", () => {
  assert.equal(satisfiesVersion("0.2.0", ">=0.1.5"), true);
  assert.equal(satisfiesVersion("0.1.4", ">=0.1.5"), false);
  assert.equal(satisfiesVersion("0.2.3", "^0.2.0"), true);
  assert.equal(satisfiesVersion("0.3.0", "^0.2.0"), false); // ^0.y pins the minor
  assert.equal(satisfiesVersion("1.9.0", "^1.2.0"), true);
  assert.equal(satisfiesVersion("2.0.0", "^1.2.0"), false);
  assert.equal(satisfiesVersion("0.2.0", "0.2.0"), true);
  assert.equal(satisfiesVersion("0.2.0", "~0.2.0"), null);
});

test("an npm-style spec resolves by walking up node_modules from the project", () => {
  const root = tree({
    "node_modules/@acme/markline-template/template.json": { name: "acme", theme: { buttonRadius: "3px" } },
    "node_modules/markline-template-zen/template.json": { name: "zen" },
  });
  const site = path.join(root, "packages", "docs");
  fs.mkdirSync(site, { recursive: true });
  const scoped = loadTemplateChain("@acme/markline-template", site, path.join(root, "builtin"));
  assert.equal(scoped[0].manifest.name, "acme");
  assert.equal(loadTemplateChain("markline-template-zen", site, path.join(root, "builtin"))[0].manifest.name, "zen");
  assert.throws(() => loadTemplateChain("@acme/missing", site, path.join(root, "builtin")), /not installed/);
});

test("escapeStyleText stops CSS from closing its <style> element", () => {
  const evil = '.x{}</style><script>alert(1)</script><style>';
  const safe = escapeStyleText(evil);
  assert.doesNotMatch(safe, /</);
  assert.doesNotMatch(safe, /<\/style/i);
  // Ordinary CSS passes through untouched.
  assert.equal(escapeStyleText(":root{--c-paper:1 1 1}"), ":root{--c-paper:1 1 1}");
  // A "<" inside a CSS string becomes an escape that still means "<".
  assert.equal(escapeStyleText('a::before{content:"<"}'), 'a::before{content:"\\3c "}');
});

test("every built-in template loads cleanly and sets only allowed keys", () => {
  const builtin = path.join(import.meta.dirname, "..", "lib", "templates");
  const names = fs.readdirSync(builtin).filter((n) => fs.existsSync(path.join(builtin, n, "template.json")));
  assert.ok(names.includes("classic") && names.includes("help-center"));
  for (const name of names) {
    const warnings: string[] = [];
    const chain = loadTemplateChain(name, builtin, builtin);
    templateOptions(chain, (m) => warnings.push(m));
    assert.deepEqual(warnings, [], `${name} sets keys templates can't change`);
    assert.equal(chain[chain.length - 1].manifest.name, name, `${name}/template.json "name" should match its folder`);
  }
});
