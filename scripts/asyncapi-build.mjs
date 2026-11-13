// What the build needs from a content folder's AsyncAPI document, with the same
// rules as the pages (asyncapi-core.mjs, resourcePlan): its warnings, printed once
// here because the page workers don't, and the "WebSockets" page when a channel
// joins no resource, for the sitemap and the export-name check.
import path from "node:path";
import { attachChannels, readAsyncApiFile, WEBSOCKETS_TAG } from "./asyncapi-core.mjs";
import { resolveTag, resourcePlan } from "./openapi-order.mjs";

/** `api.asyncapi.file` under `dir` (the content root, or a version's folder), else `api/asyncapi.json`. */
export function asyncApiFile(dir, api) {
  return path.join(dir, api?.asyncapi?.file ?? path.join("api", "asyncapi.json"));
}

/**
 * `spec`: the OpenAPI spec beside it, or null. Returns the document's warnings
 * and the resource pages only channels make (none, or the WebSockets page).
 */
export function asyncApiReport(dir, spec, api) {
  const read = readAsyncApiFile(asyncApiFile(dir, api), { perspective: api?.asyncapi?.perspective, showDeprecated: api?.showDeprecated });
  if (!read) return { warnings: [], pages: [] };
  const plan = spec ? resourcePlan(spec, api) : { tags: [], ops: [] };
  const resources = plan.tags.map((name) => ({ name, paths: plan.ops.filter((o) => o.tag === name).map((o) => o.path) }));
  const { rest } = attachChannels(read.channels, resources, (tag) => resolveTag(tag, api));
  const pages = rest.length && !plan.tags.includes(WEBSOCKETS_TAG) ? [{ name: WEBSOCKETS_TAG, slug: "websockets", title: WEBSOCKETS_TAG }] : [];
  return { warnings: read.warnings, pages };
}
