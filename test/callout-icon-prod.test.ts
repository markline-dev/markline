import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createSite, filesUnder } from "./site-server";

// Callout icons and <MigrationCallout> in a built site.

const skip = process.platform === "win32" ? "builds are slow on Windows CI" : false;
const site = createSite();
let out = "";

before(() => {
  const page = (title: string, body: string) => `---\ntitle: ${title}\n---\n\n${body}\n`;
  fs.writeFileSync(
    path.join(site.dir, "docs", "callouts.mdx"),
    page(
      "Callouts",
      [
        '<Callout title="Glyph" icon="↗">a</Callout>',
        '<Note icon="rocket-launch">b</Note>',
        '<Tip icon="/evil.svg">c</Tip>',
        "<MigrationCallout>Point your SDK at us.</MigrationCallout>",
      ].join("\n\n"),
    ),
  );
  fs.writeFileSync(path.join(site.dir, "docs", "explains.mdx"), page("Explains", "```mdx\n<MigrationCallout>old</MigrationCallout>\n```"));
  if (!skip) out = site.build();
});

after(() => site.destroy());

const html = (name: string) => {
  const file = filesUnder(path.join(site.dir, ".markline", ".next", "server", "app")).find((f) => f.endsWith(`${path.sep}${name}.html`));
  assert.ok(file, name);
  return fs.readFileSync(file, "utf8");
};

test("a callout shows the icon it asks for, hidden from screen readers, and never loads one", { skip }, () => {
  const page = html("callouts");
  assert.match(page, /<span class="ic" aria-hidden="true">↗<\/span>/);
  assert.match(page, /<span class="ic" aria-hidden="true"><svg[^>]*>/, "a Phosphor icon");
  assert.doesNotMatch(page, /evil\.svg/);
  assert.doesNotMatch(page, /<img/);
});

test("<MigrationCallout> still shows its text, as a callout", { skip }, () => {
  assert.match(html("callouts"), /<div class="callout tone-info">[\s\S]*?Migrating from OpenAI\?[\s\S]*?Point your SDK at us\./);
});

test("using <MigrationCallout> warns once, naming the page; showing it in code doesn't", { skip }, () => {
  const warnings = out.match(/<MigrationCallout> is deprecated[^\n]*/g) ?? [];
  assert.deepEqual(warnings, ['<MigrationCallout> is deprecated; use <Callout title="…" icon="…"> (on /callouts).']);
});
