// What a large spec actually sends: built HTML, since the wiring these check
// lives in client components and `@/` modules a unit test can't import. Runs
// `next build` on a generated site, so it's `npm run test:built`, not `npm test`.
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "../..");
const NEEDLE = "needlepastthesnippet";
const THINGS = 60;
const BUDGET = 500_000; // about 430 KB today

const op = (i: number, tag: string) => ({
  operationId: `${tag}Op${i}`,
  summary: `${tag} operation ${i}`,
  // Long enough that clipping it for the palette would cut off the needle.
  description: `${"Describes the operation at some length. ".repeat(10)}${tag === "others" && i === 0 ? NEEDLE : ""}`,
  tags: [tag],
  responses: { "200": { description: "OK" } },
});

const spec = {
  openapi: "3.1.0",
  info: { title: "Weight", version: "1" },
  servers: [{ url: "https://api.example.com" }],
  tags: [{ name: "things" }, { name: "others" }],
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

function build(name: string, content: string): string {
  const dist = `.next-built-test-${name}`;
  const res = spawnSync("npx", ["next", "build"], {
    cwd: ROOT,
    encoding: "utf8",
    env: {
      ...process.env,
      MARKLINE_CONTENT: content,
      MARKLINE_CONFIG: path.join(content, "markline.json"),
      MARKLINE_EXPORT: "1",
      MARKLINE_DIST: dist,
      NEXT_TELEMETRY_DISABLED: "1",
    },
  });
  assert.equal(res.status, 0, `${res.stdout}\n${res.stderr}`);
  return path.join(ROOT, dist);
}

const count = (s: string, needle: string) => s.split(needle).length - 1;

let tmp: string;
let reference: string; // an API tab only the reference opens
let holding: string; // an API tab that also holds /sdk docs pages
let tsconfig: string;
const dists: string[] = [];

before(() => {
  // Next rewrites tsconfig.json for a custom distDir.
  tsconfig = fs.readFileSync(path.join(ROOT, "tsconfig.json"), "utf8");
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "markline-weight-"));
  site(path.join(tmp, "reference"), ["/api-reference"]);
  site(path.join(tmp, "holding"), ["/api-reference", "/sdk"]);
  reference = build("reference", path.join(tmp, "reference"));
  holding = build("holding", path.join(tmp, "holding"));
  dists.push(reference, holding);
}, { timeout: 600_000 });

after(() => {
  fs.writeFileSync(path.join(ROOT, "tsconfig.json"), tsconfig);
  for (const d of dists) fs.rmSync(d, { recursive: true, force: true });
  if (tmp) fs.rmSync(tmp, { recursive: true, force: true });
});

const page = (dist: string, route: string) => fs.readFileSync(path.join(dist, `${route}.html`), "utf8");

test("a resource page sends the endpoint list once, not once per operation", () => {
  const html = page(reference, "api-reference/things");
  assert.equal(count(html, "currentHref"), THINGS, "one playground spec per operation");
  assert.equal(count(html, 'endpoints\\":[{\\"method'), 1);
});

test("every Try it still gets the whole endpoint list", () => {
  const html = page(reference, "api-reference/things");
  assert.equal(count(html, `data-endpoints="${OPERATIONS}"`), THINGS);
});

test("a resource page stays inside its size budget", () => {
  // Sending the endpoint list per operation adds about 265 KB here.
  const size = Buffer.byteLength(page(reference, "api-reference/things"));
  assert.ok(size < BUDGET, `${size} B`);
});

test("the palette searches whole descriptions", () => {
  // On another resource's page, only the palette's index can carry this text.
  assert.ok(page(reference, "api-reference/things").includes(NEEDLE));
});

test("docs pages carry resource links, not operations, when the API tab holds no docs", () => {
  const html = page(reference, "guide");
  assert.ok(html.includes("/api-reference/things"));
  assert.equal(count(html, "/api-reference/thingsOp2"), 0);
});

test("a docs page inside the API tab keeps the operation list", () => {
  const html = page(holding, "sdk/auth");
  assert.ok(html.includes("/api-reference/thingsOp2"));
});

test("a related link to an operation shows the operation's summary", () => {
  const html = page(reference, "guide");
  assert.match(html, /things operation 1/);
});
