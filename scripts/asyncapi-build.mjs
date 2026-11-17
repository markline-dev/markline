// What a content folder's AsyncAPI document adds to the reference's plan, with the
// same rules for the pages (lib/openapi.ts) and the build (build-search.mjs): the
// page channels with nowhere else to go make ("WebSockets", after api.tags), its
// `x-tagGroups`, the tag names it makes known, and its warnings, which the build
// prints once because the page workers don't.
import fs from "node:fs";
import path from "node:path";
import { attachChannels, hideChannelFields, readAsyncApiFile, WEBSOCKETS_TAG } from "./asyncapi-core.mjs";
import { DEFAULT_HIDE_EXTENSIONS, NO_EXTRAS, resolveTag, resourcePages, resourcePlan, slugifyOpId } from "./openapi-order.mjs";
import { joinUrl } from "./asyncapi-core.mjs";
import { pageAnchors } from "./apiref-anchors.mjs";
import { eventAnchor, pageEvents } from "./openapi-events.mjs";
import { pruneSpec } from "./openapi-prune.mjs";

const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

/** `api.asyncapi.file` under `dir` (the content root, or a version's folder), else `api/asyncapi.json`. */
export function asyncApiFile(dir, api) {
  return path.join(dir, api?.asyncapi?.file ?? path.join("api", "asyncapi.json"));
}

// The specs readApiSpec() stands in for a folder with only an AsyncAPI document:
// tracked here, not by a key in the spec, which a real openapi.json could carry.
const standIns = new WeakSet();

/** Whether `spec` is readApiSpec()'s stand-in for a folder with only an AsyncAPI document. */
export const isStandIn = (spec) => !!spec && typeof spec === "object" && standIns.has(spec);

/**
 * The OpenAPI spec in `dir` (the content root, or a version's folder), parsed; a
 * spec with no operations when there's only an AsyncAPI document, so its channels
 * still get pages; null when there's neither.
 */
export function readApiSpec(dir, api) {
  const file = path.join(dir, "api", "openapi.json");
  if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, "utf8"));
  if (!fs.existsSync(asyncApiFile(dir, api))) return null;
  const spec = { openapi: "3.0.0", info: { title: "", version: "" }, paths: {} };
  standIns.add(spec);
  return spec;
}

/**
 * `spec`: the OpenAPI spec beside the document, or null. `read` is the document
 * as read (null when there's none); `extras` is what it adds to resourcePlan().
 */
export function channelExtras(dir, spec, api) {
  const read = readAsyncApiFile(asyncApiFile(dir, api), {
    perspective: api?.asyncapi?.perspective,
    showDeprecated: api?.showDeprecated,
    hideExtensions: api?.hideExtensions ?? DEFAULT_HIDE_EXTENSIONS,
  });
  if (!read) return { read: null, placed: new Map(), extras: NO_EXTRAS };
  const plan = spec ? resourcePlan(spec, api) : { tags: [], ops: [] };
  const resources = plan.tags.map((name) => ({ name, paths: plan.ops.filter((o) => o.tag === name).map((o) => o.path) }));
  const plannedAs = (name) => plan.tags.find((t) => slug(t) === slug(name));

  // Declared tags (the document's own tag list) have pages, like OpenAPI tags: each
  // after api.tags (renamed, merged, hidden), or hidden by a flag on the tag object.
  // One that's already a page by its URL (an OpenAPI tag "speech" for "Speech") is that page.
  const declared = (read.tags ?? []).filter((t) => !t.hidden);
  const hiddenTags = new Set((read.tags ?? []).filter((t) => t.hidden).map((t) => t.name));
  // Two declared tags of one URL ("Real time", "real-time") are one page, the first's.
  const declaredPage = new Map();
  for (const t of declared) {
    const r = resolveTag(t.name, api);
    if (r === null) continue;
    const sameUrl = [...declaredPage.values()].find((p) => slug(p) === slug(r));
    declaredPage.set(t.name, plannedAs(r) ?? sameUrl ?? r);
  }
  const pageOfTag = (tag) => (hiddenTags.has(tag) ? null : declaredPage.has(tag) ? declaredPage.get(tag) : resolveTag(tag, api));
  const candidates = [...new Set(declaredPage.values())].filter((p) => !plan.tags.includes(p));

  // A channel joins the first of its tags that names a page (an OpenAPI resource or
  // a declared tag's), else the resource its path shares most with, else the rest.
  const first = attachChannels(read.channels, [...resources, ...candidates.map((name) => ({ name, paths: [] }))], pageOfTag);
  // A declared tag's page exists when a channel is on it.
  const tagPages = candidates.filter((p) => first.byResource.get(p)?.length);

  // The WebSockets page, as api.tags has it: renamed, merged into another page, or
  // hidden. A page the spec already has (its own "WebSockets" tag, a mergeInto
  // target, or a name of the same slug) keeps its place and just takes the channels.
  const page = first.rest.length ? resolveTag(WEBSOCKETS_TAG, api) : null;
  const planned = page === null ? undefined : plan.tags.find((t) => slug(t) === slug(page)) ?? tagPages.find((t) => slug(t) === slug(page));
  // A label on "WebSockets" can't reach a page the spec names differently ("websockets").
  const label = api?.tags && Object.prototype.hasOwnProperty.call(api.tags, WEBSOCKETS_TAG) ? api.tags[WEBSOCKETS_TAG]?.label : undefined;
  const warnings =
    planned !== undefined && planned !== page && page === WEBSOCKETS_TAG && typeof label === "string" && label.trim()
      ? [`[markline] api.tags: "${WEBSOCKETS_TAG}" has a label, but the WebSocket channels are on the spec's "${planned}" page, which it doesn't rename. Put the label on "${planned}".`]
      : [];
  // Where each channel lands. This is the one placement: the pages (placeChannels in
  // lib/openapi.ts) put channels where it says. A new WebSockets page is a resource
  // too, so a channel tagged for it joins it by tag: attach again with every page.
  const home = planned ?? page;
  const pages = [...resources, ...tagPages.map((name) => ({ name, paths: [] }))];
  if (page && planned === undefined) pages.push({ name: page, paths: [] });
  const final = attachChannels(read.channels, pages, pageOfTag);
  const placed = new Map(final.byResource);
  if (home && final.rest.length) placed.set(home, [...(placed.get(home) ?? []), ...final.rest]);
  // The channels as every output shows them: without the fields api.hideExtensions
  // hides. Pages, search and the llms files all take them from here.
  const exts = api?.hideExtensions ?? DEFAULT_HIDE_EXTENSIONS;
  for (const [name, list] of placed) placed.set(name, list.map((c) => hideChannelFields(c, exts)));

  // Labels and descriptions for the pages only channels make, as OpenAPI tags get
  // theirs: the title only from the tag the page is named after (a tag merged into
  // it, or renamed by mergeInto, doesn't title it); the description from that tag,
  // else the first tag merged into it.
  const labels = { [WEBSOCKETS_TAG]: WEBSOCKETS_TAG };
  const descriptions = {};
  for (const p of tagPages) {
    const own = declared.find((t) => t.name === p);
    if (own?.displayName) labels[p] = own.displayName;
    const description = own?.description ?? declared.find((t) => declaredPage.get(t.name) === p && t.description)?.description;
    if (description) descriptions[p] = description;
  }
  return {
    read,
    placed,
    extras: {
      pages: [...tagPages, ...(page && planned === undefined ? [page] : [])],
      warnings,
      groups: read.tagGroups,
      // Names api.tags, tagOrder and sections may use without a warning: the channels'
      // tags, the declared ones (with or without channels), and WebSockets.
      known: [WEBSOCKETS_TAG, ...new Set([...read.channels.flatMap((c) => c.tags), ...(read.tags ?? []).map((t) => t.name)])],
      labels,
      descriptions,
    },
  };
}

/** The document's warnings, and the resource pages only its channels make (as resourcePages() lists them). */
export function asyncApiReport(dir, spec, api) {
  const { read, extras } = channelExtras(dir, spec, api);
  if (!read) return { warnings: [], pages: [] };
  const before = new Set(spec ? resourcePlan(spec, api).tags : []);
  const pages = resourcePages(spec ?? {}, api, extras)
    .filter((p) => !before.has(p.name))
    .map(({ name, slug, title, section }) => ({ name, slug, title, section }));
  return { warnings: read.warnings, pages };
}

// Each spec's page events, computed once per build for its settings: search and
// both llms files ask channelPages for the same spec.
const eventsCache = new WeakMap();

/** The events on each page (their anchors are the page's own ids), by the pages' rule: pageEvents over the pruned spec. */
function eventsOfPages(spec, api, extras) {
  const key = JSON.stringify([api ?? null, extras.pages]);
  const bySettings = eventsCache.get(spec) ?? new Map();
  eventsCache.set(spec, bySettings);
  if (!bySettings.has(key)) {
    const pruned = pruneSpec(spec, api?.hideExtensions ?? DEFAULT_HIDE_EXTENSIONS);
    const prunedPlan = resourcePlan(pruned, api, extras);
    bySettings.set(
      key,
      pageEvents(pruned, {
        tags: Array.isArray(pruned.tags) ? pruned.tags.filter((t) => typeof t?.name === "string") : [],
        ops: prunedPlan.ops.map((o) => ({ page: o.tag, op: o.op })),
        pageOf: (t) => {
          const r = resolveTag(t, api);
          return r && (prunedPlan.alias.get(r) ?? r);
        },
      }),
    );
  }
  return bySettings.get(key);
}

/**
 * Every channel with the page it's on and its id there: `url` is
 * `/api-reference/<page>#<id>`, the anchor the page renders (pageAnchors, after
 * the page's operations in their order, and its events' anchors reserved).
 */
export function channelPages(dir, spec, api) {
  const { read, placed, extras } = channelExtras(dir, spec, api);
  if (!read || !spec) return [];
  const plan = resourcePlan(spec, api, extras);
  const events = eventsOfPages(spec, api, extras);
  const out = [];
  for (const page of resourcePages(spec, api, extras)) {
    const channels = placed.get(page.name) ?? [];
    if (!channels.length) continue;
    // The page's operations in its order: `x-nav-order` first, the rest as in the spec.
    const ops = plan.ops
      .filter((o) => o.tag === page.name)
      .map((o, i) => ({ i, navOrder: typeof o.op["x-nav-order"] === "number" ? o.op["x-nav-order"] : Infinity, o }))
      .sort((a, b) => a.navOrder - b.navOrder || a.i - b.i)
      .map(({ o }) => ({ summary: o.op.summary, operationId: o.op.operationId ?? slugifyOpId(o.method, o.path) }));
    const eventIds = (events.get(page.name) ?? []).map((e) => eventAnchor(e.name));
    const ids = pageAnchors(page.slug, ops, channels, eventIds).channels;
    channels.forEach((c, i) => out.push({ channel: c, page, id: ids[i], url: `/api-reference/${page.slug}#${ids[i]}` }));
  }
  return out;
}

/** Search records for the channels, beside apiSearchRecords()' operations. */
export function channelRecords(dir, spec, api, toPlainText = (s) => s) {
  return channelPages(dir, spec, api).map(({ channel: c, url }) => ({
    url,
    title: c.title ?? c.address,
    content: toPlainText(
      [c.title, c.description, `WSS ${c.address}`, ...c.messages.map((m) => [m.title ?? m.name, m.description ?? m.summary].filter(Boolean).join(" "))]
        .filter(Boolean)
        .join(" "),
    ),
    meta: "API reference",
  }));
}

const DIRECTION = { send: "Send", receive: "Receive", unspecified: "Message" };

/** Example lines llms-full.txt shows before cutting (at a line, with "…"). */
const LLMS_EXAMPLE_LINES = 40;

/** A schema's top-level fields as markdown list lines: name, type, required, deprecated, description. */
function fieldLines(schema) {
  const props = schema && typeof schema === "object" && schema.properties && typeof schema.properties === "object" ? schema.properties : {};
  const required = new Set(Array.isArray(schema?.required) ? schema.required : []);
  return Object.entries(props).map(([name, s]) => {
    const type = Array.isArray(s?.type) ? s.type.join(" | ") : s?.type;
    const notes = [type, required.has(name) ? "required" : null, s?.deprecated === true ? "deprecated" : null].filter(Boolean);
    const desc = typeof s?.description === "string" && s.description.trim() ? `: ${s.description.trim().replace(/\s*\n\s*/g, " ")}` : "";
    return `- \`${name}\`${notes.length ? ` (${notes.join(", ")})` : ""}${desc}`;
  });
}

/** An example as a json fence, its first LLMS_EXAMPLE_LINES lines when longer. */
function exampleFence(value) {
  const lines = (JSON.stringify(value, null, 2) ?? "").split("\n");
  const shown = lines.length > LLMS_EXAMPLE_LINES ? [...lines.slice(0, LLMS_EXAMPLE_LINES), "…"] : lines;
  return `\`\`\`json\n${shown.join("\n")}\n\`\`\``;
}

/**
 * llms.txt's list of channels and llms-full.txt's section on them: each channel's
 * page link, connection URL, description, path and query parameters and headers,
 * and its messages: direction, name, description, fields and first example. The
 * channels come from channelExtras() with api.hideExtensions already applied, so
 * nothing the pages hide is printed here. `abs` makes a path absolute.
 */
export function channelLlms(dir, spec, api, abs = (u) => u) {
  const pages = channelPages(dir, spec, api);
  if (!pages.length) return { index: "", full: "" };
  let index = "\n### WebSocket channels\n\n";
  let full = "\n\n---\n\n# WebSocket channels\n";
  for (const { channel: c, page, url } of pages) {
    const title = c.title ?? c.address;
    const wss = joinUrl(c.servers[0] ?? "", c.address);
    index += `- [${title}](${abs(url)}): \`${wss}\`\n`;
    full += `\n## ${title}\n\n`;
    full += `[${page.title} › ${title}](${abs(url)}) · \`WSS ${wss}\`${c.deprecated ? " · deprecated" : ""}\n\n`;
    if (c.description) full += `${c.description}\n\n`;
    if (c.parameters.length) {
      full += `Path parameters:\n\n${c.parameters.map((p) => `- \`${p.name}\`${p.description ? `: ${p.description}` : ""}`).join("\n")}\n\n`;
    }
    const query = fieldLines(c.query);
    if (query.length) full += `Query parameters:\n\n${query.join("\n")}\n\n`;
    const headers = fieldLines(c.headers);
    if (headers.length) full += `Headers:\n\n${headers.join("\n")}\n\n`;
    for (const m of c.messages) {
      full += `### ${DIRECTION[m.direction]}: ${m.title ?? m.name}${m.deprecated ? " (deprecated)" : ""}\n\n`;
      if (m.description ?? m.summary) full += `${m.description ?? m.summary}\n\n`;
      const fields = fieldLines(m.payload);
      if (fields.length) full += `${fields.join("\n")}\n\n`;
      if (m.examples.length) full += `${exampleFence(m.examples[0])}\n\n`;
    }
  }
  return { index, full };
}
