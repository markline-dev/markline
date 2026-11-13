import { after, test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { asyncApiReport, readApiSpec } from "../scripts/asyncapi-build.mjs";

// What a build prints and lists for an AsyncAPI document: its warnings (once,
// from build-search; the page workers stay quiet in production) and the
// WebSockets page in the sitemap. Synthetic specs only.

const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "markline-asyncapi-")));
after(() => fs.rmSync(root, { recursive: true, force: true }));

const write = (file: string, data: unknown) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, typeof data === "string" ? data : JSON.stringify(data));
};
const op = (tag: string, id: string) => ({ post: { operationId: id, tags: [tag], responses: { 200: { description: "ok" } } } });
const spec = {
  openapi: "3.0.0",
  info: { title: "t", version: "1" },
  tags: [{ name: "things" }, { name: "secret" }],
  paths: { "/v1/things/{id}": op("things", "getThing") },
};
const channels = (extra: Record<string, unknown> = {}) => ({
  asyncapi: "2.6.0",
  info: { title: "t", version: "1" },
  channels: {
    "/v1/things/{id}/live": { publish: { message: { name: "watch", payload: { type: "string" } } } },
    ...extra,
  },
});

test("a channel that joins a resource makes no page; one that joins none makes WebSockets", () => {
  const dir = path.join(root, "report");
  write(path.join(dir, "api", "asyncapi.json"), channels());
  assert.deepEqual(asyncApiReport(dir, spec, {}), { warnings: [], pages: [] });
  write(path.join(dir, "api", "asyncapi.json"), channels({ "/firehose": { subscribe: { message: { name: "all", payload: { type: "string" } } } } }));
  assert.deepEqual(asyncApiReport(dir, spec, {}).pages, [{ name: "WebSockets", slug: "websockets", title: "WebSockets", section: null }]);
  // Hidden by its tag, or deprecated with showDeprecated off: no page for it.
  const hiddenTag = { tags: { secret: { hidden: true } } };
  write(path.join(dir, "api", "asyncapi.json"), channels({ "/firehose": { subscribe: { tags: [{ name: "secret" }], message: { name: "all" } } } }));
  assert.deepEqual(asyncApiReport(dir, spec, hiddenTag).pages, []);
  write(path.join(dir, "api", "asyncapi.json"), channels({ "/firehose": { deprecated: true, subscribe: { message: { name: "all" } } } }));
  assert.equal(asyncApiReport(dir, spec, {}).pages.length, 1);
  assert.deepEqual(asyncApiReport(dir, spec, { showDeprecated: false }).pages, []);
  // A file elsewhere, by api.asyncapi.file; none at all is no report.
  assert.deepEqual(asyncApiReport(dir, spec, { asyncapi: { file: "api/none.json" } }), { warnings: [], pages: [] });
});

test("a build prints the documents' warnings once, version by version, and lists the WebSockets page", () => {
  const site = path.join(root, "site");
  write(path.join(site, "docs", "index.mdx"), "---\ntitle: Home\n---\n\nHome.\n");
  write(path.join(site, "api", "openapi.json"), spec);
  write(path.join(site, "api", "asyncapi.json"), channels({ "/firehose": { subscribe: { message: { name: "all", payload: { type: "string" } } } } }));
  write(path.join(site, "v1", "api", "openapi.json"), spec);
  write(path.join(site, "v1", "api", "asyncapi.json"), "{ not json");
  write(path.join(site, "markline.json"), {
    name: "Async",
    seo: { metadataBase: "https://docs.async.test" },
    versions: [{ id: "v2" }, { id: "v1" }],
    api: { asyncapi: { perspective: "client" } },
    navigation: { tabs: [{ id: "api", label: "API", href: "/api-reference", match: ["/api-reference"], openapi: true }] },
  });
  const cwd = path.join(root, "build");
  fs.mkdirSync(path.join(cwd, "public"), { recursive: true });
  const script = path.join(import.meta.dirname, "..", "scripts", "build-search.mjs");
  const r = spawnSync(process.execPath, [script], { cwd, encoding: "utf8", env: { ...process.env, MARKLINE_CONTENT: site, NODE_TEST_CONTEXT: "" } });
  assert.equal(r.status, 0, r.stderr);
  const out = r.stderr + r.stdout;
  const notice = `[markline] AsyncAPI 2.x read from the client's side (api.asyncapi.perspective is "client").`;
  assert.equal(out.split(notice).length - 1, 1, out);
  assert.match(out, /\[markline\] \(version v1\) asyncapi\.json isn't valid JSON, so its channels aren't shown\./);
  const sitemap = fs.readFileSync(path.join(cwd, "public", "sitemap.xml"), "utf8");
  assert.match(sitemap, /https:\/\/docs\.async\.test\/api-reference\/websockets</);
  assert.match(sitemap, /\/api-reference\/things</);
});

test("a folder with only an AsyncAPI document reads as a spec with no operations", () => {
  const dir = path.join(root, "only");
  write(path.join(dir, "api", "asyncapi.json"), channels());
  assert.deepEqual(readApiSpec(dir, {}), { openapi: "3.0.0", info: { title: "", version: "" }, paths: {}, "x-markline-asyncapi-only": true });
  assert.equal(readApiSpec(path.join(root, "nothing"), {}), null);
  assert.equal(readApiSpec(dir, { asyncapi: { file: "api/other.json" } }), null);
  write(path.join(dir, "api", "openapi.json"), spec);
  assert.deepEqual(readApiSpec(dir, {}), spec);
  // An openapi.json that's there but broken fails loudly, as before; it isn't read as "no spec".
  write(path.join(dir, "api", "openapi.json"), "{ broken");
  assert.throws(() => readApiSpec(dir, {}), SyntaxError);
  write(path.join(dir, "api", "openapi.json"), spec);
  // Its channels, joining no resource, make the WebSockets page.
  assert.deepEqual(asyncApiReport(path.join(root, "only"), { openapi: "3.0.0", paths: {} }, {}).pages.map((p) => p.slug), ["websockets"]);
});

test("a build covers versions with only an AsyncAPI document: warnings and the default's sitemap", () => {
  const site = path.join(root, "only-site");
  write(path.join(site, "docs", "index.mdx"), "---\ntitle: Home\n---\n\nHome.\n");
  write(path.join(site, "api", "asyncapi.json"), channels());
  write(path.join(site, "v1", "api", "asyncapi.json"), { asyncapi: "9.0.0", info: { title: "t", version: "1" } });
  write(path.join(site, "markline.json"), {
    name: "Only",
    seo: { metadataBase: "https://docs.only.test" },
    versions: [{ id: "v2" }, { id: "v1" }],
    navigation: { tabs: [{ id: "api", label: "API", href: "/api-reference", match: ["/api-reference"], openapi: true }] },
  });
  const cwd = path.join(root, "only-build");
  fs.mkdirSync(path.join(cwd, "public"), { recursive: true });
  const script = path.join(import.meta.dirname, "..", "scripts", "build-search.mjs");
  const r = spawnSync(process.execPath, [script], { cwd, encoding: "utf8", env: { ...process.env, MARKLINE_CONTENT: site, NODE_TEST_CONTEXT: "" } });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stderr + r.stdout, /\[markline\] \(version v1\) AsyncAPI 9\.0\.0 isn't supported/);
  assert.match(fs.readFileSync(path.join(cwd, "public", "sitemap.xml"), "utf8"), /https:\/\/docs\.only\.test\/api-reference\/websockets</);
});
