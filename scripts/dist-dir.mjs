// Next clears its output folder on a build, so MARKLINE_DIST has to stay inside
// the app folder, whichever way it was set. Used by next.config.mjs.

import path from "node:path";

export function safeDistDir(value, cwd) {
  if (!value) return undefined;
  const rel = path.relative(cwd, path.resolve(cwd, value));
  if (rel === "" || rel.startsWith("..") || path.isAbsolute(rel)) {
    throw new Error(`MARKLINE_DIST must be a folder inside ${cwd}, not "${value}".`);
  }
  return value;
}
