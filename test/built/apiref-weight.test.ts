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
import zlib from "node:zlib";

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
  // A streamed reply, and a path parameter: the STREAM badge and the highlighted {id}.
  "x-fern-streaming": true,
  parameters: [
    { name: "otherId", in: "path", required: true, schema: { type: "string" } },
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
  // others 2 repeats others 1's summary: two operations, one slug.
  summary: `${tag} operation ${tag === "others" && i === 2 ? 1 : i}`,
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
    ...Array.from({ length: 3 }, (_, i) => [i === 1 ? "/others/{otherId}" : `/others/${i}`, { post: op(i, "others") }]),
  ]),
};
const OPERATIONS = THINGS + 3;

/** Channels for the default version only: one by path, one by tag, one with nowhere to go,
 *  one hidden (x-internal), a hidden field, and a deprecated message. */
const asyncSpec = {
  asyncapi: "2.6.0",
  info: { title: "Weight realtime", version: "1" },
  servers: { live: { url: "live.weight.test", protocol: "wss" } },
  channels: {
    "/v1/others/{otherId}/live": {
      parameters: { otherId: { description: "Which other.", schema: { type: "string" } } },
      bindings: { ws: { query: { type: "object", required: ["token"], properties: { token: { type: "string" }, verbose: { type: "boolean" } } } } },
      publish: {
        summary: "publish",
        message: { name: "watch", description: "Starts **watching** this other.", payload: { type: "object", properties: { since: { type: "integer" } } } },
      },
      subscribe: {
        message: {
          oneOf: [
            {
              name: "changed",
              payload: {
                type: "object",
                properties: {
                  at: { type: "string" },
                  shardsecret: { type: "string", "x-internal": true },
                  // Hidden beside its $ref; the same schema stays visible as refshown.
                  refsecret: { $ref: "#/components/schemas/Shared", "x-internal": true },
                  refshown: { $ref: "#/components/schemas/Shared" },
                },
              },
              examples: [{ payload: { at: "now", shardsecret: "shardvalue", refsecret: { code: "refvalue" }, refshown: { code: "ok" } } }],
            },
            { name: "legacychange", deprecated: true, payload: { type: "string" } },
          ],
        },
      },
    },
    "/stream": { "x-title": "Things feed", subscribe: { tags: [{ name: "things" }], message: { name: "thing", payload: { type: "string" } } } },
    "/firehose": { subscribe: { message: { name: "everything", payload: { type: "string" } } } },
    "/internal-feed": { "x-title": "Internalfeed", "x-internal": true, subscribe: { message: { name: "x", payload: { type: "string" } } } },
    // Titled like two operations on its page: its id is numbered past theirs.
    "/v1/others/{otherId}/dup": { "x-title": "others operation 1", subscribe: { message: { name: "dup", payload: { type: "string" } } } },
  },
  components: { schemas: { Shared: { type: "object", properties: { code: { type: "string" } } } } },
};

/** v1's spec: only the "others" resource, so "things" exists in the default version alone. */
const v1Spec = { ...spec, paths: Object.fromEntries(Object.entries(spec.paths).filter(([p]) => p.startsWith("/others/"))) };

/** `versioned`: v2 (the default) and v1 with specs, v3 with only an AsyncAPI document, and v0
 *  with docs only. `single`: one
 *  version, and the reference in sections, "others" first. */
function site(dir: string, apiMatch: string[], versioned = false, single = false) {
  fs.mkdirSync(path.join(dir, "api"), { recursive: true });
  if (versioned) {
    fs.mkdirSync(path.join(dir, "v1", "api"), { recursive: true });
    fs.writeFileSync(path.join(dir, "v1", "api", "openapi.json"), JSON.stringify(v1Spec));
    fs.mkdirSync(path.join(dir, "v3", "api"), { recursive: true });
    fs.writeFileSync(
      path.join(dir, "v3", "api", "asyncapi.json"),
      JSON.stringify({ asyncapi: "3.0.0", info: { title: "t", version: "3" }, channels: { live: { address: "/live", title: "Onlylive" } } }),
    );
  }
  fs.mkdirSync(path.join(dir, "docs", "sdk"), { recursive: true });
  fs.writeFileSync(path.join(dir, "api", "openapi.json"), JSON.stringify(spec));
  if (versioned) fs.writeFileSync(path.join(dir, "api", "asyncapi.json"), JSON.stringify(asyncSpec));
  // The sectioned site: one channel with nowhere to go, so a WebSockets page its section can hold.
  if (single) {
    fs.writeFileSync(
      path.join(dir, "api", "asyncapi.json"),
      JSON.stringify({ asyncapi: "2.6.0", info: { title: "t", version: "1" }, channels: { "/firehose": { subscribe: { message: { name: "all", payload: { type: "string" } } } } } }),
    );
  }
  fs.writeFileSync(path.join(dir, "docs", "index.mdx"), "---\ntitle: Home\n---\n\nHome.\n");
  fs.writeFileSync(path.join(dir, "docs", "guide.mdx"), "---\ntitle: Guide\nrelated:\n  - /api-reference/thingsOp1\n---\n\nGuide.\n");
  fs.writeFileSync(path.join(dir, "docs", "sdk", "auth.mdx"), "---\ntitle: Auth\n---\n\nAuth.\n");
  fs.writeFileSync(
    path.join(dir, "markline.json"),
    JSON.stringify({
      name: "Weight",
      ...(versioned
        ? { versions: [{ id: "v2", label: "2.0 (latest)" }, { id: "v1", label: "1.0" }, { id: "v3", label: "3.0 realtime only" }, { id: "v0", label: "0.9 docs only" }] }
        : single
          ? { versions: [{ id: "only", label: "The only one" }], api: { sections: [{ title: "Elsewhere", tags: ["others", "WebSockets"] }] } }
          : {}),
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
  site(path.join(tmp, "reference"), ["/api-reference"], true);
  site(path.join(tmp, "holding"), ["/api-reference", "/sdk"], false, true);
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

test("one version has no picker; two show their configured labels", { skip }, () => {
  // Exactly one configured version.
  const single = page(holding, "api-reference/others");
  assert.doesNotMatch(single, /api-vwrap|aria-label="Version:/);
  assert.doesNotMatch(single, /v1 · 1|>v1</, "the spec's info.version isn't shown as a version");
  // The sidebar chip, not the header's own version switcher.
  const chip = (html: string) => html.match(/class="api-ver"[^>]*>/)?.[0] ?? "";
  assert.match(chip(page(reference, "api-reference/others")), /aria-label="Version: 2.0 \(latest\)"/);
  assert.match(chip(page(reference, "api-reference/v1/others")), /aria-label="Version: 1.0"/);
});

test("switching versions has the same page to go to, or the reference to fall back on", { skip }, () => {
  // The picker goes to /api-reference/v1/<same page> when it exists, else /api-reference/v1.
  assert.ok(fs.existsSync(path.join(reference, "api-reference/v1/others.html")));
  assert.ok(fs.existsSync(path.join(reference, "api-reference/v1/othersOp1.html")));
  assert.equal(fs.existsSync(path.join(reference, "api-reference/v1/things.html")), false);
  assert.ok(fs.existsSync(path.join(reference, "api-reference/v1.html")));
});

test("the right rail sticks below the header, whatever its height", { skip }, () => {
  const dir = path.join(reference, "_next", "static", "css");
  const css = fs.readdirSync(dir).map((f) => fs.readFileSync(path.join(dir, f), "utf8")).join("\n");
  const rule = css.match(/\.ml-apiref \.api-r\s*\{[^}]*position:\s*sticky[^}]*\}/)?.[0];
  assert.ok(rule, "the sticky rail rule is in the built CSS");
  assert.match(rule, /top:\s*calc\(var\(--nav-h\)\s*\+\s*20px\)/);
});

test("a version with docs only isn't offered in the reference's picker", { skip }, () => {
  // The picker's entries travel in the page's data as "versions"; the header's
  // switcher, which lists every version for its docs, has its own "entries".
  const html = page(reference, "api-reference/others");
  const picker = html.match(/\\"versions\\":\[[^\]]*\]/)?.[0] ?? "";
  assert.match(picker, /\\"label\\":\\"1\.0\\"/);
  assert.doesNotMatch(picker, /v0|0\.9 docs only/);
});

test("sections caption the sidebar, lead the order, and leave every URL where it was", { skip }, () => {
  // "holding" has one section, "Elsewhere" holding "others"; "reference" has none. Same spec.
  const grouped = page(holding, "api-reference/things");
  assert.match(grouped, /class="api-section-cap">Elsewhere</);
  const side = grouped.slice(grouped.indexOf('class="api-side"'), grouped.indexOf("</aside>"));
  assert.ok(side.indexOf("api-section-cap") >= 0 && side.indexOf("api-section-cap") < side.indexOf(">Things<"), "the section comes first");
  assert.doesNotMatch(page(reference, "api-reference/things"), /api-section-cap/);
  // The landing page is the first section's first resource.
  assert.match(page(holding, "api-reference"), /id="others"/);
  assert.match(page(reference, "api-reference"), /id="things"/);
  // Every page is where it was: the same files, sections or not.
  const pages = (dist: string) =>
    fs
      .readdirSync(path.join(dist, "api-reference"), { withFileTypes: true })
      // Not "reference"'s version landings (v1.html, v0.html): only it has versions.
      // Nor its WebSockets page: only it has an AsyncAPI document.
      .filter((e) => e.isFile() && e.name.endsWith(".html") && !/^(v\d+|websockets)\.html$/.test(e.name))
      .map((e) => e.name)
      .sort();
  assert.ok(pages(reference).length >= OPERATIONS);
  assert.deepEqual(pages(holding), pages(reference));
});

test("no id repeats on any API page, even where two operations share a summary", { skip }, () => {
  for (const dist of [reference, holding]) {
    const dir = path.join(dist, "api-reference");
    for (const f of fs.readdirSync(dir).filter((n) => n.endsWith(".html"))) {
      const html = fs.readFileSync(path.join(dir, f), "utf8");
      const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);
      const repeated = ids.filter((id, i) => ids.indexOf(id) !== i);
      assert.deepEqual(repeated, [], `${path.basename(dist)}/${f}`);
    }
  }
  // The repeat is numbered, and the first keeps its id.
  const others = page(reference, "api-reference/others");
  assert.match(others, /id="others-operation-1"/);
  assert.match(others, /id="others-operation-1-1"/);
});

test("a streamed operation is badged, its {parameters} set apart, and its path text unchanged", { skip }, () => {
  const html = page(reference, "api-reference/others");
  // Badged in the endpoint list, the sidebar and its own section; no other operation is.
  assert.equal(count(html, 'class="stream"'), 3);
  assert.match(html, /<span class="pp">\{otherId\}<\/span>/);
  // The path reads as before for copy and for screen readers: tags only wrap it.
  const segs = [...html.matchAll(/<span class="seg">((?:(?!<\/span><\/span>).)*)<\/span><\/span>/g)].map((m) => m[1].replace(/<[^>]+>/g, ""));
  assert.ok(segs.includes("/others/{otherId}"), segs.join(", "));
  // The breadcrumb names the section on the sectioned site, and isn't in any id.
  const grouped = page(holding, "api-reference/others");
  assert.match(grouped, /class="api-crumbs ep-crumbs">Elsewhere › Others</);
  assert.doesNotMatch(grouped, /id="[^"]*elsewhere/i);
});

test("a WebSocket channel lands on the resource its path or tag names, the rest under WebSockets", { skip }, () => {
  const others = page(reference, "api-reference/others");
  // By path: /v1/others/{otherId}/live shares others/{otherId} with an operation here.
  assert.match(others, /<span class="verb wss">WSS<\/span>/);
  assert.match(others, /wss:\/\/live\.weight\.test\/v1\/others\/<span class="pp">\{otherId\}<\/span>\/live/);
  // Read from the server's side: publish is what the client sends.
  assert.match(others, /aria-label="Send"[^>]*>[^<]*<\/span><span class="ws-name"[^>]*>watch</);
  assert.match(others, /aria-label="Receive"[^>]*>[^<]*<\/span><span class="ws-name"[^>]*>changed</);
  // The keyword summary isn't the title; the address is.
  assert.match(others, />Live<\/h2>/);
  // By tag: the "things" tag beats a path that shares nothing.
  assert.match(page(reference, "api-reference/things"), />Things feed<\/h2>/);
  // Nowhere else: a "WebSockets" resource of its own.
  const ws = page(reference, "api-reference/websockets");
  assert.match(ws, />Firehose<\/h2>/);
  assert.match(ws, /<title>WebSockets · /);
  assert.doesNotMatch(ws, />Live<\/h2>|>Things feed<\/h2>/);
  assert.doesNotMatch(others, />Firehose<\/h2>|>Things feed<\/h2>/);
  // The handshake is a request a reader can copy, like every other card.
  // Its required query parameters are in the URL; optional ones aren't.
  assert.match(others, /<pre class="ws-hs">GET wss:\/\/live\.weight\.test\/v1\/others\/\{otherId\}\/live\?token=&lt;token&gt;\nConnection: Upgrade\nUpgrade: websocket\n/);
  // A message's description is markdown, rendered the way a lead is.
  assert.match(others, /class="sec-lead msg-lead"[^>]*>Starts <strong>watching<\/strong> this other\.</);
  // Hidden (x-internal, the default): the channel nowhere, the field and its example value nowhere.
  for (const html of [others, ws, page(reference, "api-reference/things")]) assert.doesNotMatch(html, /Internalfeed|internal-feed|shardsecret|shardvalue|refsecret|refvalue/);
  assert.match(others, /refshown/);
  assert.match(others, /&quot;at&quot;|"at"/);
  // A deprecated message is marked in its row.
  assert.match(others, /class="ws-name"[^>]*>legacychange<\/span><span class="ws-pill">Receive<\/span><span class="dep-pill">Deprecated</);
  // Only the version with an AsyncAPI file has channels.
  assert.doesNotMatch(page(reference, "api-reference/v1/others"), /class="verb wss"/);
  assert.ok(!fs.existsSync(path.join(reference, "api-reference/v1/websockets.html")));
});

test("api.sections can hold the WebSockets page, in the sidebar and in the page order", { skip }, () => {
  const html = page(holding, "api-reference/things");
  const side = html.slice(html.indexOf('class="api-side"'), html.indexOf("</aside>"));
  const at = (s: string) => side.indexOf(s);
  // Elsewhere's caption, its two pages in the order listed, then the pages in no section.
  assert.ok(at('class="api-section-cap">Elsewhere<') >= 0, "the section is shown");
  assert.ok(at('class="api-section-cap">Elsewhere<') < at(">Others<") && at(">Others<") < at(">WebSockets<") && at(">WebSockets<") < at(">Things<"), side.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").slice(0, 400));
  assert.ok(fs.existsSync(path.join(holding, "api-reference", "websockets.html")));
});

test("a version with only an AsyncAPI document has a reference, and the picker offers it", { skip }, () => {
  // Its channel has no resource to join, so it's on that version's WebSockets page, which its landing opens.
  assert.match(page(reference, "api-reference/v3/websockets"), />Onlylive<\/h2>/);
  assert.match(page(reference, "api-reference/v3"), />Onlylive<\/h2>/);
  const picker = page(reference, "api-reference/others").match(/\\"versions\\":\[[^\]]*\]/)?.[0] ?? "";
  assert.match(picker, /3\.0 realtime only/);
  assert.doesNotMatch(picker, /0\.9 docs only/);
  // The default version's pages don't change for it.
  assert.doesNotMatch(page(reference, "api-reference/websockets"), /Onlylive/);
});

test("every channel link the build writes lands on its id on the page: search records, llms.txt, llms-full.txt", { skip }, async () => {
  const { channelRecords } = (await import("../../scripts/asyncapi-build.mjs" as string)) as {
    channelRecords: (dir: string, spec: unknown, api: unknown) => { url: string }[];
  };
  const content = path.join(tmp, "reference");
  const cfg = JSON.parse(fs.readFileSync(path.join(content, "markline.json"), "utf8"));
  const raw = JSON.parse(fs.readFileSync(path.join(content, "api", "openapi.json"), "utf8"));
  const lands = (url: string) => {
    const [p, id] = url.split("#");
    return page(reference, p.slice(1)).includes(` id="${id}"`);
  };
  // Search records, as build-search makes them.
  const records = channelRecords(content, raw, cfg.api).map((r) => r.url);
  assert.ok(records.includes("/api-reference/others#others-operation-1-2"), records.join(", "));
  assert.ok(records.length >= 4, records.join(", "));
  for (const url of records) assert.ok(lands(url), url);
  // The llms files, from a real build-search run on the same content.
  const cwd = path.join(tmp, "search");
  fs.mkdirSync(path.join(cwd, "public"), { recursive: true });
  const r = spawnSync(process.execPath, [path.join(ROOT, "scripts", "build-search.mjs")], { cwd, encoding: "utf8", env: buildEnv({ MARKLINE_CONTENT: content }) });
  assert.equal(r.status, 0, `${r.stdout}\n${r.stderr}`);
  const linksIn = (text: string) => [...new Set([...text.matchAll(/\]\((\/api-reference\/[^)#\s]+#[^)\s]+)\)/g)].map((m) => m[1]))].sort();
  // Each output on its own: llms.txt's list, llms-full.txt's section, and the search index.
  for (const f of ["llms.txt", "llms-full.txt"]) {
    const text = fs.readFileSync(path.join(cwd, "public", f), "utf8");
    assert.deepEqual(linksIn(text), [...records].sort(), f);
    // What field hiding covers on the pages isn't in the llms files at all.
    assert.doesNotMatch(text, /shardsecret|shardvalue|refsecret|refvalue|Internalfeed/, f);
  }
  // The search index's records, as pagefind stored them (gzipped "pagefind_dcd" + JSON).
  const fragments = path.join(cwd, "public", "pagefind", "fragment");
  const indexed = fs
    .readdirSync(fragments)
    .map((f) => zlib.gunzipSync(fs.readFileSync(path.join(fragments, f))).toString("utf8").replace(/^pagefind_dcd/, ""))
    .map((json) => (JSON.parse(json) as { url: string }).url)
    .filter((url) => url.includes("#"));
  for (const url of records) assert.ok(indexed.includes(url), `${url} in the search index`);
  for (const url of indexed.filter((u) => u.startsWith("/api-reference/"))) assert.ok(lands(url), url);
});
