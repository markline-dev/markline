// The .env files of a site. Only its own settings are taken from them: anything else
// could change how Markline or Node runs (NODE_OPTIONS, MARKLINE_DIST), and a docs
// project shouldn't need to. The shell's values always win.

import { createRequire } from "node:module";
import path from "node:path";

const SITE_SETTINGS = /^(?:MARKLINE_AI_KEY|MARKLINE_SITE_URL|MARKLINE_BASE_PATH|NEXT_PUBLIC_\w+)$/;

/** Names someone might expect to work here, so an ignored one is worth mentioning. */
const LOOKS_LIKE_OURS = /^(?:MARKLINE_|NEXT_|__NEXT_|NODE_|PATH$|LD_|DYLD_)/;

/** A folder's .env files, read by Next's own loader, leaving process.env as it was. */
function readEnvFiles(loadEnvConfig, dir, dev) {
  const before = { ...process.env };
  const { parsedEnv, loadedEnvFiles } = loadEnvConfig(dir, dev, { info() {}, error: console.error }, true);
  for (const name of Object.keys(process.env)) delete process.env[name];
  Object.assign(process.env, before);
  return { values: parsedEnv ?? {}, used: loadedEnvFiles.length > 0 };
}

/**
 * Apply the site settings from the project's .env files and, for sites from before
 * the CLI read those, the staging folder's. The project's win. Next runs in the
 * staging folder and would load its files unfiltered, so it's told they're done.
 */
export function loadSiteEnv(appDir, contentDir, workDir, dev) {
  let loadEnvConfig;
  try {
    ({ loadEnvConfig } = createRequire(path.join(appDir, "package.json"))("@next/env"));
  } catch {
    process.env.__NEXT_PROCESSED_ENV = "true";
    return; // comes with Next, so an install without it has bigger problems
  }
  const project = readEnvFiles(loadEnvConfig, contentDir, dev);
  const staged = readEnvFiles(loadEnvConfig, workDir, dev);
  const values = { ...staged.values, ...project.values };

  const ignored = [];
  for (const [name, value] of Object.entries(values)) {
    if (SITE_SETTINGS.test(name)) process.env[name] ??= value;
    else if (LOOKS_LIKE_OURS.test(name)) ignored.push(name);
  }
  process.env.__NEXT_PROCESSED_ENV = "true";

  if (ignored.length) console.warn(`[markline] ignored in .env files, as they can only be set in the shell: ${ignored.sort().join(", ")}.`);
  if (staged.used) console.warn(`[markline] read .env files from ${path.basename(workDir)}/. Keep them beside markline.json instead.`);
}
