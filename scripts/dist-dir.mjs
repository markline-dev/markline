// Next clears its output folder on a build, so MARKLINE_DIST has to stay inside the
// app folder, whichever way it was set, and whatever links are on the way there.
// Used by next.config.mjs.

import fs from "node:fs";
import path from "node:path";

/** Where a path really leads, for one that may not exist yet. Null for a dead link,
 *  which a build would write through to somewhere that can't be told in advance. */
function realPath(file) {
  const rest = [];
  for (let at = file; ; at = path.dirname(at)) {
    if (fs.lstatSync(at, { throwIfNoEntry: false })) {
      try {
        return path.join(fs.realpathSync(at), ...rest);
      } catch {
        return null;
      }
    }
    if (at === path.dirname(at)) return file;
    rest.unshift(path.basename(at));
  }
}

const within = (root, file) => {
  if (file === null) return false;
  const rel = path.relative(root, file);
  return rel !== "" && !rel.startsWith("..") && !path.isAbsolute(rel) && !rel.split(path.sep).includes("node_modules");
};

export function safeDistDir(value, cwd) {
  if (!value) return undefined;
  const dist = path.resolve(cwd, value);
  if (!within(cwd, dist) || !within(realPath(cwd), realPath(dist))) {
    throw new Error(`MARKLINE_DIST must be a folder inside ${cwd}, and not in node_modules: "${value}" isn't.`);
  }
  return value;
}
