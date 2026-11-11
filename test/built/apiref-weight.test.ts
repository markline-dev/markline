// What a large spec actually sends: built HTML, since the wiring these check
// lives in client components and `@/` modules a unit test can't import. Runs
// `next build` on a generated site, so it's `npm run test:built`, not `npm test`.
// Everything it writes stays under .test-tmp/ and is removed after.
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "../..");

// The build fetches the site's fonts from Google, so it can't run offline.
const online = await fetch("https://fonts.googleapis.com", { signal: AbortSignal.timeout(5000) }).then(
  () => true,
  () => false,
);
const skip = online ? false : "offline: the build needs to reach Google Fonts";

const NEEDLE = "needlepastthesnippet";
const THINGS = 60;
// Guards against repeating spec-wide data per operation, which on this spec adds
// about 265 KB to a page of about 430 KB. Roomy on purpose: ordinary changes to
// the page shouldn't fail this.
const BUDGET = 600_000;

// Deprecated and hidden parameters and fields, on one operation: the per-operation
// page draws parameters with ParamRow, which a unit test can't render.
const MARKED = {
  parameters: [
    { name: "oldparam", in: "query", deprecated: true, schema: { type: "string" } },
    { name: "currentparam", in: "query", schema: { type: "string" } },
    { name: "secretparam", in: "query", "x-internal": true, schema: { type: "string" } },
  ],
  requestBody: {
    content: {
      "application/json": {
        schema: {
          type: "object",
          properties: {
            shownfield: { type: "string" },
            secretfield: { type: "string", "x-hidden": true },
            secretref: { $ref: "#/components/schemas/Secret" },
          },
        },
      },
    },
  },
};

// More statuses than fit as tabs, one of them without a body.
const MANY_RESPONSES = {
  "200": { description: "Done", content: { "application/json": { schema: { type: "object", properties: { okfield: { type: "string" } } } } } },
  "204": { description: "Nothing to send" },
  "404": { description: "Missing", content: { "application/json": { schema: { type: "object", properties: { missingfield: { type: "string" } } } } } },
  "422": { description: "Invalid", content: { "application/json": { schema: { type: "object", properties: { invalidfield: { type: "string" } } } } } },
};

const op = (i: number, tag: string) => ({
  operationId: `${tag}Op${i}`,
  summary: `${tag} operation ${i}`,
  // Long enough that clipping it for the palette would cut off the needle.
  description: `${"Describes the operation at some length. ".repeat(10)}${tag === "others" && i === 0 ? NEEDLE : ""}`,
  tags: [tag],
  ...(tag === "others" && i === 1 ? MARKED : {}),
  responses: tag === "others" && i === 2 ? MANY_RESPONSES : { "200": { description: "OK" } },
});

const spec = {
  openapi: "3.1.0",
  info: { title: "Weight", version: "1" },
  servers: [{ url: "https://api.example.com" }],
  tags: [{ name: "things" }, { name: "others" }],
  components: { schemas: { Secret: { type: "object", "x-internal": true, properties: { secretinner: { type: "string" } } } } },
  paths: Object.fromEntries([
    ...Array.from({ length: THINGS }, (_, i) => [`/things/${i}`, { post: op(i, "things") }]),
    ...Array.from({ length: 3 }, (_, i) => [`/others/${i}`, { post: op(i, "others") }]),
  ]),
};
const OPERATIONS = THINGS + 3;

function site(dir: string, apiMatch: string[]) {
  fs.mkdirSync(path.join(dir, "api"), { recursive: true });
  fs.mkdirSync(path.join(dir, "docs", "sdk"), { recursive: true });
  fs.writeFileSync(path.join(dir, "api", "openapi.json"), JSON.stringify(spec));
  fs.writeFileSync(path.join(dir, "docs", "index.mdx"), "---\ntitle: Home\n---\n\nHome.\n");
  fs.writeFileSync(path.join(dir, "docs", "guide.mdx"), "---\ntitle: Guide\nrelated:\n  - /api-reference/thingsOp1\n---\n\nGuide.\n");
  fs.writeFileSync(path.join(dir, "docs", "sdk", "auth.mdx"), "---\ntitle: Auth\n---\n\nAuth.\n");
  fs.writeFileSync(
    path.join(dir, "markline.json"),
    JSON.stringify({
      name: "Weight",
      navigation: {
        tabs: [
          {
            id: "docs",
            label: "Docs",
            href: "/",
            match: ["__default__"],
            groups: [{ group: "G", pages: [{ href: "/", label: "Home" }, { href: "/guide", label: "Guide" }] }],
          },
          { id: "api-reference", label: "API", href: "/api-reference", match: apiMatch, openapi: true },
        ],
      },
    }),
  );
}

/** The env without the test runner's own marker, which Next's workers inherit. */
function buildEnv(extra: Record<string, string>) {
  const { NODE_TEST_CONTEXT: _, ...env } = process.env;
  return { ...env, ...extra, NEXT_TELEMETRY_DISABLED: "1" };
}

function build(name: string, content: string): string {
  const dist = path.relative(ROOT, path.join(tmp, `dist-${name}`));
  const res = spawnSync("npx", ["next", "build"], {
    cwd: ROOT,
    encoding: "utf8",
    env: buildEnv({
      MARKLINE_CONTENT: content,
      MARKLINE_CONFIG: path.join(content, "markline.json"),
      MARKLINE_EXPORT: "1",
      MARKLINE_DIST: dist,
    }),
  });
  assert.equal(res.status, 0, `${res.stdout}\n${res.stderr}`);
  return path.join(ROOT, dist);
}

const count = (s: string, needle: string) => s.split(needle).length - 1;

let tmp: string;
let reference: string; // an API tab only the reference opens
let holding: string; // an API tab that also holds /sdk docs pages
let tsconfig: string;

before(() => {
  if (skip) return;
  // Next rewrites tsconfig.json for a custom distDir.
  tsconfig = fs.readFileSync(path.join(ROOT, "tsconfig.json"), "utf8");
  const parent = path.join(ROOT, ".test-tmp");
  fs.mkdirSync(parent, { recursive: true });
  tmp = fs.mkdtempSync(path.join(parent, "weight-"));
  site(path.join(tmp, "reference"), ["/api-reference"]);
  site(path.join(tmp, "holding"), ["/api-reference", "/sdk"]);
  reference = build("reference", path.join(tmp, "reference"));
  holding = build("holding", path.join(tmp, "holding"));
}, { timeout: 600_000 });

after(() => {
  if (skip) return;
  fs.writeFileSync(path.join(ROOT, "tsconfig.json"), tsconfig);
  if (tmp) fs.rmSync(tmp, { recursive: true, force: true });
});

const page = (dist: string, route: string) => fs.readFileSync(path.join(dist, `${route}.html`), "utf8");

test("a resource page sends the endpoint list once, not once per operation", { skip }, () => {
  const html = page(reference, "api-reference/things");
  assert.equal(count(html, "currentHref"), THINGS, "one playground spec per operation");
  assert.equal(count(html, 'endpoints\\":[{\\"method'), 1);
});

test("every Try it still gets the whole endpoint list", { skip }, () => {
  const html = page(reference, "api-reference/things");
  assert.equal(count(html, `data-endpoints="${OPERATIONS}"`), THINGS);
});

test("a resource page stays inside its size budget", { skip }, () => {
  // Sending the endpoint list per operation adds about 265 KB here.
  const size = Buffer.byteLength(page(reference, "api-reference/things"));
  assert.ok(size < BUDGET, `${size} B`);
});

test("the palette searches whole descriptions", { skip }, () => {
  // On another resource's page, only the palette's index can carry this text.
  assert.ok(page(reference, "api-reference/things").includes(NEEDLE));
});

test("docs pages carry resource links, not operations, when the API tab holds no docs", { skip }, () => {
  const html = page(reference, "guide");
  assert.ok(html.includes("/api-reference/things"));
  assert.equal(count(html, "/api-reference/thingsOp2"), 0);
});

test("a docs page inside the API tab keeps the operation list", { skip }, () => {
  const html = page(holding, "sdk/auth");
  assert.ok(html.includes("/api-reference/thingsOp2"));
});

test("a related link to an operation shows the operation's summary", { skip }, () => {
  const html = page(reference, "guide");
  assert.match(html, /things operation 1/);
});

/** A parameter's row on the per-operation page: from its name to the next row. */
function paramRow(html: string, name: string): string {
  const at = html.indexOf(`>${name}<`);
  assert.ok(at >= 0, `${name} has a row`);
  const next = html.indexOf("ml-param-head", at);
  return html.slice(at, next < 0 ? undefined : next);
}

test("the per-operation page marks a deprecated parameter, and only that one", { skip }, () => {
  const html = page(reference, "api-reference/othersOp1");
  assert.match(paramRow(html, "oldparam"), /ml-param-deprecated/);
  assert.doesNotMatch(paramRow(html, "currentparam"), /ml-param-deprecated/);
});

test("hidden parameters and fields stay out of every page that shows the operation", { skip }, () => {
  for (const route of ["api-reference/othersOp1", "api-reference/others"]) {
    const html = page(reference, route);
    assert.ok(html.includes("shownfield"), `${route} shows the visible field`);
    for (const hidden of ["secretparam", "secretfield", "secretref", "secretinner"]) {
      assert.equal(html.includes(hidden), false, `${hidden} on ${route}`);
    }
  }
});

/** The card of one operation's section on a resource page. */
function section(html: string, opId: string): string {
  const at = html.indexOf(`data-label="POST /others/${opId.replace("othersOp", "")}"`);
  assert.ok(at >= 0, `${opId} has a code card`);
  return html.slice(at, html.indexOf("api-sec", at + 1));
}

test("many statuses get a dropdown, a few get tabs, and a body-less one says so", { skip }, () => {
  const html = page(reference, "api-reference/others");
  const many = section(html, "othersOp2");
  assert.match(many, /<select class="cc-select"/);
  const options = [...many.matchAll(/<option value="(\d+)"[^>]*>([^<]*)</g)].map((m) => `${m[1]} ${m[2]}`);
  assert.deepEqual(options, ["200 200 Done", "204 204 Nothing to send", "404 404 Missing", "422 422 Invalid"]);
  assert.match(many, /No response body/);
  const one = section(html, "othersOp0");
  assert.doesNotMatch(one, /cc-select/);
  assert.match(one, /200 OK/);
});

test("code cards copy what they show, without a second copy of the code in the page", { skip }, () => {
  const html = page(reference, "api-reference/things");
  const cards = count(html, 'class="code-card');
  assert.ok(cards >= THINGS, `${cards} code cards`);
  assert.equal(count(html, "data-copy-card"), count(html, "data-expand"));
  assert.ok(count(html, "data-copy-card") >= cards, "every card has Copy and Expand");
  assert.equal(count(html, "data-copy="), 0, "no card carries its code in an attribute");
});
