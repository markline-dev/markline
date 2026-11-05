// The staging folder holds a copy of the app that the CLI and Next write into
// and clear out, so nothing in it may lead anywhere else. It's normally made by
// the CLI, but a project can arrive with one already there.

import fs from "node:fs";
import path from "node:path";

// Not walked: a build's own links are in these parts of .next, and the build
// replaces them rather than writing through them. If one of them is itself a
// link, that goes like any other.
const BUILD_OUTPUT = new Set([path.join(".next", "standalone"), path.join(".next", "node_modules")]);

/** Remove every link under `root`. Only ever the link: this never follows one.
 *  node_modules at the top is left to linkDeps, or isn't ours if it's real. */
function removeLinks(root, dir = root) {
  let removed = 0;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    const rel = path.relative(root, full);
    if (rel === "node_modules") continue;
    if (entry.isSymbolicLink()) {
      fs.unlinkSync(full);
      removed++;
    } else if (entry.isDirectory() && !BUILD_OUTPUT.has(rel)) {
      removed += removeLinks(root, full);
    }
  }
  return removed;
}

/** Make `workDir` a real folder, with no links in it. */
export function prepareWorkDir(workDir) {
  if (fs.lstatSync(workDir, { throwIfNoEntry: false })?.isSymbolicLink()) {
    fs.unlinkSync(workDir);
    console.warn(`[markline] ${path.basename(workDir)}/ was a link; replacing it with a folder.`);
  }
  fs.mkdirSync(workDir, { recursive: true });
  const removed = removeLinks(workDir);
  if (removed) console.warn(`[markline] removed ${removed} link${removed === 1 ? "" : "s"} from ${path.basename(workDir)}/.`);
}
