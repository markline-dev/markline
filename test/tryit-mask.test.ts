import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
// lib/ imports resolve via test/setup.mjs, which `npm test` loads first.
import { CODE_MASK, maskCookie, maskHeaders, maskQuery, maskUrl, RAIL_MASK, secretsOf, type Secrets } from "../lib/tryit-mask.ts";
import { buildPlaygroundSpec } from "../lib/playground-spec.ts";
import { normalize } from "../lib/openapi.ts";

const KEY = "sk_live_REALSECRET";
const secrets: Secrets = { bearer: true, headers: ["xi-api-key"], query: ["api_key"], cookies: ["session_key"] };

test("a key in a header, however it's spelt, and a bearer token are masked", () => {
  const headers = { Authorization: `Bearer ${KEY}`, "XI-API-KEY": KEY, "X-Request-Id": "abc" };
  for (const mask of [RAIL_MASK, CODE_MASK]) {
    const shown = maskHeaders(headers, secrets, mask);
    assert.deepEqual(shown, [
      ["Authorization", mask.bearer],
      ["XI-API-KEY", mask.key],
      ["X-Request-Id", "abc"],
    ]);
    assert.equal(JSON.stringify(shown).includes(KEY), false);
  }
});

test("a key in a cookie is masked, and the other cookies are left alone", () => {
  const cookie = `theme=dark; session_key=${KEY}; lang=en`;
  assert.equal(maskCookie(cookie, secrets, RAIL_MASK), "theme=dark; session_key=<api-key>; lang=en");
  const [[, shown]] = maskHeaders({ Cookie: cookie }, secrets, CODE_MASK);
  assert.equal(shown.includes(KEY), false);
  assert.match(shown, /theme=dark/);
});

test("a key in a query parameter is masked in the URL and in the query fields", () => {
  const url = `https://api.test/v1/voices?page=2&api_key=${KEY}&q=a%26b#top`;
  assert.equal(maskUrl(url, secrets, RAIL_MASK), "https://api.test/v1/voices?page=2&api_key=<api-key>&q=a%26b#top");
  assert.equal(maskUrl(url, secrets, CODE_MASK).includes(KEY), false);
  // An encoded name is still the parameter.
  assert.equal(maskUrl(`https://api.test/x?api%5Fkey=${KEY}`, secrets, CODE_MASK).includes(KEY), false);
  assert.deepEqual(maskQuery([["page", "2"], ["api_key", KEY]], secrets, CODE_MASK), [["page", "2"], ["api_key", "••••"]]);
  // Nothing to mask: unchanged.
  const none: Secrets = { bearer: false, headers: [], query: [], cookies: [] };
  assert.equal(maskUrl(url, none, RAIL_MASK), url);
  assert.deepEqual(maskHeaders({ Authorization: "Basic abc" }, none, RAIL_MASK), [["Authorization", "Basic abc"]]);
});

test("Try it learns where every key goes from the spec's security schemes", () => {
  const spec = {
    openapi: "3.1.0",
    info: { title: "t", version: "1" },
    components: {
      securitySchemes: {
        header: { type: "apiKey", in: "header", name: "xi-api-key" },
        query: { type: "apiKey", in: "query", name: "api_key" },
        cookie: { type: "apiKey", in: "cookie", name: "session_key" },
        bearer: { type: "http", scheme: "bearer" },
      },
    },
    security: [{ header: [] }, { query: [] }, { cookie: [] }, { bearer: [] }],
    paths: { "/v": { get: { operationId: "v", tags: ["v"], responses: { "200": { description: "OK" } } } } },
  };
  const doc = normalize(spec, {});
  const pg = buildPlaygroundSpec(doc.operationsById.v, doc, spec);
  assert.deepEqual(secretsOf(pg), { bearer: true, headers: ["xi-api-key"], query: ["api_key"], cookies: ["session_key"] });
});

// The code Try it shows is built in a client component this runner can't render,
// so check that every place it shows a header, query or URL goes through the masking.
test("the rail's cURL, the explorer's code and Copy URL all mask", () => {
  const src = readFileSync(new URL("../components/docs/api/playground.tsx", import.meta.url), "utf8");
  const rail = src.slice(src.indexOf("const curl = useMemo("), src.indexOf("async function direct("));
  assert.match(rail, /maskUrl\(targetUrl, secrets, RAIL_MASK\)/);
  assert.match(rail, /maskHeaders\(buildHeaders\(\), secrets, RAIL_MASK\)/);
  const gen = src.slice(src.indexOf("function genCode("));
  assert.match(gen, /const headers = maskHeaders\(sent, secrets, CODE_MASK\)/);
  assert.match(gen, /const queryFields = maskQuery\(/);
  assert.match(gen, /maskUrl\(pg\.targetUrl, secrets, CODE_MASK\)/);
  assert.doesNotMatch(gen, /shellWord\(pg\.targetUrl\)/);
  assert.match(src, /text=\{maskUrl\(pg\.targetUrl, secretsOf\(pg\.spec\), RAIL_MASK\)\}/);
});
