import { test } from "node:test";
import assert from "node:assert/strict";
import { COLOR_LIMIT_CHARS, colorizeCurl, colorizeJsonHtml, colorizeJsonText } from "../lib/playground-highlight";

const MB = 1024 * 1024;

/** Bodies that overflowed the colouring regexes: plain, pretty-printed, and full of escapes. */
function bigBodies(size: number): Record<string, string> {
  return {
    plain: JSON.stringify({ text: "a".repeat(size) }),
    pretty: JSON.stringify({ items: Array.from({ length: size / 32 }, (_, i) => ({ id: i, text: "abcdefgh" })) }, null, 2),
    escaped: JSON.stringify({ text: '"\\\n'.repeat(size / 3) }),
  };
}

test("10 MB bodies don't overflow either colourer", () => {
  for (const [name, body] of Object.entries(bigBodies(10 * MB))) {
    assert.ok(body.length > COLOR_LIMIT_CHARS, name);
    for (const json of [colorizeJsonHtml(body), colorizeJsonText(body)]) assert.equal(json.includes("<span"), false, name);
    const curl = colorizeCurl(`curl --request POST \\\n  --data '${body}'`);
    assert.equal(curl.includes("<span"), false, name);
  }
});

test("uncoloured text is still escaped", () => {
  const html = '<img src=x onerror="alert(1)"><script>alert(2)</script>&amp;';
  const body = JSON.stringify({ html, pad: "a".repeat(COLOR_LIMIT_CHARS) });
  for (const out of [colorizeJsonHtml(body), colorizeJsonText(body), colorizeCurl(`curl --data '${body}'`)]) {
    assert.equal(out.includes("<img"), false);
    assert.equal(out.includes("<script"), false);
    assert.ok(out.includes("&lt;img src=x onerror="));
    assert.ok(out.includes("&amp;amp;"));
  }
});

test("both colour up to the same limit, in characters", () => {
  const fill = (n: number, wrap: (s: string) => string) => {
    const empty = wrap("").length;
    return wrap("a".repeat(n - empty));
  };
  const json = (s: string) => `{"t":"${s}"}`;
  const curl = (s: string) => `curl --data '${s}'`;
  assert.ok(colorizeJsonHtml(fill(COLOR_LIMIT_CHARS, json)).includes("<span"));
  assert.equal(colorizeJsonHtml(fill(COLOR_LIMIT_CHARS + 1, json)).includes("<span"), false);
  assert.ok(colorizeCurl(fill(COLOR_LIMIT_CHARS, curl)).includes("<span"));
  assert.equal(colorizeCurl(fill(COLOR_LIMIT_CHARS + 1, curl)).includes("<span"), false);
  // Characters, not bytes: 1 MB of "é" is 2 MB of UTF-8, and is still coloured.
  assert.ok(colorizeJsonHtml(fill(COLOR_LIMIT_CHARS, (s) => json(s.replace(/a/g, "é")))).includes("<span"));
});

test("small bodies are coloured and escaped as before", () => {
  assert.equal(
    colorizeJsonHtml('{"a": 1, "b": true, "c": "<b>"}'),
    '{<span class="key">"a"</span>: <span class="n">1</span>, <span class="key">"b"</span>: <span class="k">true</span>, <span class="key">"c"</span>: <span class="s">"&lt;b&gt;"</span>}',
  );
  assert.equal(colorizeJsonHtml(""), "(empty response)");
  assert.equal(colorizeJsonText(""), "");
  assert.equal(colorizeJsonText('{"a": 1}'), colorizeJsonHtml('{"a": 1}'));
  assert.equal(
    colorizeCurl("curl --url 'https://x.test/<a>'"),
    '<span style="color:#6E86FA">curl</span> <span style="color:#8E959C">--url</span> <span style="color:#3CC88C">\'https://x.test/&lt;a&gt;\'</span>',
  );
});
