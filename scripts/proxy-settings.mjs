// What the Try it proxy may do, from the site's own files. Plain Node, as
// next.config.mjs runs it at build time: a standalone server has no content
// folder to read, so the build bakes the result in. The app's `loadConfig` won't do
// here, as it quietly falls back to defaults when a config can't be read.

import fs from "node:fs";
import path from "node:path";

/** The http(s) origins of these URLs. A relative server URL has none, and nor does
 *  one with a templated host (https://{region}.api.example.com): it parses, but no
 *  request's origin could ever match it. A templated path doesn't matter. */
export function originsOf(urls) {
  const origins = new Set();
  for (const url of urls) {
    if (typeof url !== "string" || /^[a-z][a-z0-9+.-]*:\/\/[^/?#]*\{/i.test(url)) continue;
    try {
      const { origin, protocol } = new URL(url);
      if (protocol === "http:" || protocol === "https:") origins.add(origin);
    } catch {
      // not absolute
    }
  }
  return [...origins];
}

function contentRoot(env, cwd) {
  const configured = env.MARKLINE_CONTENT;
  if (configured) return path.isAbsolute(configured) ? configured : path.join(cwd, configured);
  return fs.existsSync(path.join(cwd, "site", "markline.json")) ? path.join(cwd, "site") : path.join(cwd, "content");
}

function configPath(env, cwd, root) {
  if (env.MARKLINE_CONFIG) return path.isAbsolute(env.MARKLINE_CONFIG) ? env.MARKLINE_CONFIG : path.join(cwd, env.MARKLINE_CONFIG);
  const branded = path.join(root, "markline.json");
  return fs.existsSync(branded) || !fs.existsSync(path.join(root, "docs.json")) ? branded : path.join(root, "docs.json");
}

const serversIn = (spec) => (Array.isArray(spec?.servers) ? spec.servers.map((s) => s?.url) : []);

/**
 * `origins` it may forward to, its `mode` (api.playground.proxy), whether a config
 * was found, and a `problem` if something exists but can't be read, in which case
 * it mustn't forward at all.
 */
export function readProxySettings(env = process.env, cwd = process.cwd()) {
  const root = contentRoot(env, cwd);
  const file = configPath(env, cwd, root);
  const found = fs.existsSync(file);
  let config = {};
  try {
    if (found) config = JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return { origins: [], found, problem: `${path.basename(file)} couldn't be read` };
  }
  const versions = Array.isArray(config.versions) ? config.versions.slice(1).map((v) => v?.id) : [];
  const urls = [config.api?.baseUrl];
  for (const id of [undefined, ...versions]) {
    const spec = id ? path.join(root, String(id), "api", "openapi.json") : path.join(root, "api", "openapi.json");
    if (!fs.existsSync(spec)) continue;
    try {
      urls.push(...serversIn(JSON.parse(fs.readFileSync(spec, "utf8"))));
    } catch {
      return { origins: [], found, problem: `${id ? `${id}/` : ""}api/openapi.json couldn't be read` };
    }
  }
  return { origins: originsOf(urls), mode: config.api?.playground?.proxy, found };
}
