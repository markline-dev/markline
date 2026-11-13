// What a content folder's AsyncAPI document adds to the reference's plan, with the
// same rules for the pages (lib/openapi.ts) and the build (build-search.mjs): the
// page channels with nowhere else to go make ("WebSockets", after api.tags), its
// `x-tagGroups`, the tag names it makes known, and its warnings, which the build
// prints once because the page workers don't.
import fs from "node:fs";
import path from "node:path";
import { attachChannels, readAsyncApiFile, WEBSOCKETS_TAG } from "./asyncapi-core.mjs";
import { DEFAULT_HIDE_EXTENSIONS, NO_EXTRAS, resolveTag, resourcePages, resourcePlan, slugifyOpId } from "./openapi-order.mjs";
import { joinUrl } from "./asyncapi-core.mjs";
import { pageAnchors } from "./apiref-anchors.mjs";

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
  const { byResource, rest } = attachChannels(read.channels, resources, (tag) => resolveTag(tag, api));
  // The WebSockets page, as api.tags has it: renamed, merged into another page, or
  // hidden. A page the spec already has (its own "WebSockets" tag, a mergeInto
  // target, or a name of the same slug) keeps its place and just takes the channels.
  const page = rest.length ? resolveTag(WEBSOCKETS_TAG, api) : null;
  const planned = page === null ? undefined : plan.tags.find((t) => slug(t) === slug(page));
  // A label on "WebSockets" can't reach a page the spec names differently ("websockets").
  const label = api?.tags && Object.prototype.hasOwnProperty.call(api.tags, WEBSOCKETS_TAG) ? api.tags[WEBSOCKETS_TAG]?.label : undefined;
  const warnings =
    planned !== undefined && planned !== page && page === WEBSOCKETS_TAG && typeof label === "string" && label.trim()
      ? [`[markline] api.tags: "${WEBSOCKETS_TAG}" has a label, but the WebSocket channels are on the spec's "${planned}" page, which it doesn't rename. Put the label on "${planned}".`]
      : [];
  // Where each channel lands, as placeChannels() in lib/openapi.ts puts them: its
  // resource's, then the rest on the WebSockets page (or wherever api.tags sent it).
  // A new WebSockets page is a resource there too, so a channel tagged for it joins
  // it by tag rather than an operation's page by path: attach again with it.
  const home = planned ?? page;
  const final =
    page && planned === undefined
      ? attachChannels(read.channels, [...resources, { name: page, paths: [] }], (tag) => resolveTag(tag, api))
      : { byResource, rest };
  const placed = new Map(final.byResource);
  if (home && final.rest.length) placed.set(home, [...(placed.get(home) ?? []), ...final.rest]);
  return {
    read,
    placed,
    extras: {
      pages: page && planned === undefined ? [page] : [],
      warnings,
      groups: read.tagGroups,
      known: [WEBSOCKETS_TAG, ...new Set(read.channels.flatMap((c) => c.tags))],
      labels: { [WEBSOCKETS_TAG]: WEBSOCKETS_TAG },
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

/**
 * Every channel with the page it's on and its id there: `url` is
 * `/api-reference/<page>#<id>`, the anchor the page renders (pageAnchors, after
 * the page's operations in their order). Event anchors (`event-…`) aren't known
 * here; a channel would only miss its link if it were titled like one.
 */
export function channelPages(dir, spec, api) {
  const { read, placed, extras } = channelExtras(dir, spec, api);
  if (!read || !spec) return [];
  const plan = resourcePlan(spec, api, extras);
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
    const ids = pageAnchors(page.slug, ops, channels).channels;
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

/**
 * llms.txt's list of channels and llms-full.txt's section on them: each channel's
 * page link, connection URL, description, path parameters, and its messages'
 * directions, names and descriptions. Not their fields, query, headers or
 * examples: hiding those (api.hideExtensions) happens on the pages only, so
 * they'd be printed here unhidden. `abs` makes a path absolute.
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
    if (c.messages.length) {
      const line = (m) => `- ${DIRECTION[m.direction]} \`${m.title ?? m.name}\`${m.deprecated ? " (deprecated)" : ""}${(m.description ?? m.summary) ? `: ${m.description ?? m.summary}` : ""}`;
      full += `Messages:\n\n${c.messages.map(line).join("\n")}\n\n`;
    }
  }
  return { index, full };
}
