// What a content folder's AsyncAPI document adds to the reference's plan, with the
// same rules for the pages (lib/openapi.ts) and the build (build-search.mjs): the
// page channels with nowhere else to go make ("WebSockets", after api.tags), its
// `x-tagGroups`, the tag names it makes known, and its warnings, which the build
// prints once because the page workers don't.
import path from "node:path";
import { attachChannels, readAsyncApiFile, WEBSOCKETS_TAG } from "./asyncapi-core.mjs";
import { DEFAULT_HIDE_EXTENSIONS, NO_EXTRAS, resolveTag, resourcePages, resourcePlan } from "./openapi-order.mjs";

/** `api.asyncapi.file` under `dir` (the content root, or a version's folder), else `api/asyncapi.json`. */
export function asyncApiFile(dir, api) {
  return path.join(dir, api?.asyncapi?.file ?? path.join("api", "asyncapi.json"));
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
  // The WebSockets page, as api.tags has it: renamed, merged into another page, or hidden.
  const page = rest.length ? resolveTag(WEBSOCKETS_TAG, api) : null;
  return {
    read,
    extras: {
      pages: page ? [page] : [],
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
