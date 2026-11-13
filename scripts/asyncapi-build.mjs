// What a content folder's AsyncAPI document adds to the reference's plan, with the
// same rules for the pages (lib/openapi.ts) and the build (build-search.mjs): the
// page channels with nowhere else to go make ("WebSockets", after api.tags), its
// `x-tagGroups`, the tag names it makes known, and its warnings, which the build
// prints once because the page workers don't.
import fs from "node:fs";
import path from "node:path";
import { attachChannels, readAsyncApiFile, WEBSOCKETS_TAG } from "./asyncapi-core.mjs";
import { DEFAULT_HIDE_EXTENSIONS, NO_EXTRAS, resolveTag, resourcePages, resourcePlan } from "./openapi-order.mjs";

const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

/** `api.asyncapi.file` under `dir` (the content root, or a version's folder), else `api/asyncapi.json`. */
export function asyncApiFile(dir, api) {
  return path.join(dir, api?.asyncapi?.file ?? path.join("api", "asyncapi.json"));
}

/**
 * The OpenAPI spec in `dir` (the content root, or a version's folder), parsed; a
 * spec with no operations when there's only an AsyncAPI document, so its channels
 * still get pages; null when there's neither.
 */
export function readApiSpec(dir, api) {
  const file = path.join(dir, "api", "openapi.json");
  if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, "utf8"));
  return fs.existsSync(asyncApiFile(dir, api)) ? { openapi: "3.0.0", info: { title: "", version: "" }, paths: {} } : null;
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
  if (!read) return { read: null, extras: NO_EXTRAS };
  const plan = spec ? resourcePlan(spec, api) : { tags: [], ops: [] };
  const resources = plan.tags.map((name) => ({ name, paths: plan.ops.filter((o) => o.tag === name).map((o) => o.path) }));
  const { rest } = attachChannels(read.channels, resources, (tag) => resolveTag(tag, api));
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
  return {
    read,
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
