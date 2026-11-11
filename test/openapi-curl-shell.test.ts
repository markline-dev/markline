// Generated cURL commands get pasted into shells, so these run them through a
// real one, with `curl` stubbed to print its arguments. `bash -n` can't see a
// word that splits or a command substitution that fires.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
// lib/ imports resolve via test/setup.mjs, which `npm test` loads first.
import { codeSamples } from "../lib/openapi-codegen.ts";
import { curlSample } from "../lib/openapi-samples.ts";
import { normalize, type OpenAPIDoc } from "../lib/openapi.ts";

const OK = { "200": { description: "OK" } };
const body = (ct: string, schema: unknown) => ({ content: { [ct]: { schema } } });
const HOSTILE = `a$(touch PWN)b \`touch PWN\` "; touch PWN; " & $HOME 'q'`;

const raw = {
  info: { title: "123 things", version: "1" },
  paths: {
    "/q": { get: { operationId: "q", tags: ["t"], responses: OK, parameters: [
      { name: "q", in: "query", required: true, schema: { type: "string", example: HOSTILE } },
      { name: "r", in: "query", required: true, schema: { type: "string", example: "hello world" } },
    ] } },
    "/h": { get: { operationId: "h", tags: ["t"], responses: OK, parameters: [
      { name: "If-Match", in: "header", required: true, schema: { type: "string", example: '"abc"' } },
      { name: "X-Evil", in: "header", required: true, schema: { type: "string", example: HOSTILE } },
    ] } },
    "/p/{id}": { get: { operationId: "p", tags: ["t"], responses: OK, parameters: [
      { name: "id", in: "path", required: true, schema: { type: "string", example: "a b/c" } },
    ] } },
    "/key": { get: { operationId: "key", tags: ["t"], responses: OK, security: [{ evil: [] }, { plain: [] }] } },
    "/ct": { post: { operationId: "ct", tags: ["t"], responses: OK, requestBody: body(`text/x$(touch PWN)"; touch PWN; "`, { type: "string", example: "x" }) } },
    "/allof": { post: { operationId: "allof", tags: ["t"], responses: OK, requestBody: body("multipart/form-data", {
      allOf: [{ type: "object", required: ["a"], properties: { a: { type: "string", example: "one" } } }],
    }) } },
    "/empty": { post: { operationId: "empty", tags: ["t"], responses: OK, requestBody: body("application/x-www-form-urlencoded", { type: "object" }) } },
    "/txt": { post: { operationId: "txt", tags: ["t"], responses: OK, requestBody: body("text/plain", { type: "string", example: "@/etc/hosts" }) } },
    "/xml": { post: { operationId: "xml", tags: ["t"], responses: OK, requestBody: body("application/xml", { type: "object", properties: { a: { type: "string" } } }) } },
    "/form": { post: { operationId: "form", tags: ["t"], responses: OK, requestBody: body("multipart/form-data", {
      type: "object",
      required: ["x", "at", "evil"],
      properties: {
        x: { type: "string", example: "x;type=text/html" },
        at: { type: "string", example: "@/etc/hosts" },
        evil: { type: "string", example: HOSTILE },
      },
    }) } },
    "/url": { post: { operationId: "url", tags: ["t"], responses: OK, requestBody: body("application/x-www-form-urlencoded", {
      type: "object",
      required: ["n@me"],
      properties: { "n@me": { type: "string", example: "/etc/hosts" } },
    }) } },
    "/many": { post: { operationId: "many", tags: ["t"], responses: OK, requestBody: body("multipart/form-data", {
      type: "object",
      required: Array.from({ length: 9 }, (_, i) => `f${i}`),
      properties: {
        ...Object.fromEntries(Array.from({ length: 9 }, (_, i) => [`f${i}`, { type: "string" }])),
        upload: { type: "string", format: "binary" },
      },
    }) } },
  },
  components: {
    securitySchemes: {
      evil: { type: "apiKey", in: "header", name: `x$(touch PWN)"` },
      plain: { type: "apiKey", in: "header", name: "xi-api-key" },
    },
  },
};

const doc: OpenAPIDoc = normalize(raw);
const decode = (html: string) =>
  html.replace(/<[^>]+>/g, "").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
const rail = (id: string) => decode(codeSamples(doc.operationsById[id], doc, raw, "https://x.test", ["curl"]).tabs[0].html);
const page = (id: string) => curlSample(doc.operationsById[id], doc, raw);

/** Run a command with `curl` stubbed, and return the arguments curl received. */
function argv(command: string): string[] {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "markline-curl-"));
  try {
    const script = `curl() { printf '%s\\0' "$@"; }\n${command}`;
    const res = spawnSync("bash", ["-c", script], { cwd: dir, encoding: "utf8", env: { ...process.env, API_KEY: "KEY", HOME: "/home/x" } });
    assert.equal(res.stderr, "", `stderr for:\n${command}`);
    assert.deepEqual(fs.readdirSync(dir), [], `something ran:\n${command}`);
    return res.stdout.split("\0").slice(0, -1);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

const after = (args: string[], flag: string) => args.flatMap((a, i) => (a === flag ? [args[i + 1]] : []));

test("query values stay one argument and run nothing", () => {
  for (const cmd of [rail("q"), page("q")]) {
    const url = argv(cmd).find((a) => a.startsWith("https://x.test") || a.includes("/q?"))!;
    const parsed = new URL(url);
    assert.equal(parsed.searchParams.get("q"), HOSTILE);
    assert.equal(parsed.searchParams.get("r"), "hello world");
  }
});

test("path values are encoded into one argument", () => {
  assert.deepEqual(argv(rail("p")), ["https://x.test/p/a%20b%2Fc"]);
  assert.ok(argv(page("p")).some((a) => a.endsWith("/p/a%20b%2Fc")));
});

test("header values arrive exactly as written", () => {
  const headers = after(argv(rail("h")), "-H");
  assert.deepEqual(headers, ['If-Match: "abc"', `X-Evil: ${HOSTILE}`]);
});

test("only $API_KEY expands in an API-key header", () => {
  const headers = after(argv(rail("key")), "-H");
  assert.deepEqual(headers, [`x$(touch PWN)": KEY`, "xi-api-key: KEY"]);
  argv(page("key"));
});

test("a content type can't break out of its quotes", () => {
  assert.deepEqual(after(argv(rail("ct")), "-H"), [`Content-Type: text/x$(touch PWN)"; touch PWN; "`]);
  argv(page("ct"));
});

test("form values use the flags that never read a file", () => {
  for (const [cmd, flag] of [[rail("form"), "--form-string"], [page("form"), "--form-string"]] as const) {
    const args = argv(cmd);
    assert.deepEqual(after(args, flag), ["x=x;type=text/html", "at=@/etc/hosts", `evil=${HOSTILE}`]);
    assert.deepEqual(after(args, "-F"), []);
  }
  // `--data-urlencode 'n@me=…'` would read a file called `me=…`.
  const url = argv(rail("url"));
  assert.deepEqual(after(url, "--data-urlencode"), []);
  assert.deepEqual(after(url, "--data-raw"), ["n%40me=%2Fetc%2Fhosts"]);
});

test("a raw body that starts with @ is sent literally", () => {
  for (const cmd of [rail("txt"), page("txt")]) {
    const args = argv(cmd);
    assert.deepEqual(after(args, "--data-raw"), ["@/etc/hosts"]);
    assert.deepEqual(after(args, "-d"), []);
  }
});

test("an XML body isn't sent as JSON", () => {
  assert.deepEqual(after(argv(rail("xml")), "--data-raw"), ["<example/>"]);
  assert.deepEqual(after(argv(page("xml")), "--data-raw"), ["<example/>"]);
});

test("form bodies always send: allOf fields are found, and an unknown shape gets a placeholder", () => {
  assert.deepEqual(after(argv(rail("allof")), "--form-string"), ["a=one"]);
  assert.deepEqual(after(argv(page("allof")), "--form-string"), ["a=one"]);
  assert.deepEqual(after(argv(rail("empty")), "--data-urlencode"), ["field=value"]);
  assert.deepEqual(after(argv(page("empty")), "--data-urlencode"), ["field=value"]);
});

test("a file field survives however many required fields come first", () => {
  assert.deepEqual(after(argv(rail("many")), "-F"), ["upload=@path/to/upload"]);
  assert.equal(after(argv(rail("many")), "--form-string").length, 9);
  assert.deepEqual(after(argv(page("many")), "--form"), ["upload=@path/to/upload"]);
});

test("a file path with curl's option characters is quoted for curl", async () => {
  const { formFileArg } = await import("../lib/openapi-curl.ts");
  const { word } = formFileArg("file", 'my;audio "1".wav');
  assert.deepEqual(argv(`curl ${word}`), [`file=@"my;audio \\"1\\".wav"`]);
});
