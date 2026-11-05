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

/**
 * Clear out what the CLI and Next didn't put there, since Next would read it as
 * part of the app: config, .env files, instrumentation. `staged` is replaced by
 * the caller anyway. What stays is the last build's output, and the deps link.
 */
function removeLeftovers(workDir, staged) {
  let removed = 0;
  for (const entry of fs.readdirSync(workDir, { withFileTypes: true })) {
    const { name } = entry;
    const stays =
      staged.includes(name) ||
      (name === "node_modules" && entry.isSymbolicLink()) ||
      ((name === ".next" || name === "public") && entry.isDirectory()) ||
      (name === ".markline-generated.json" && entry.isFile());
    if (stays) continue;
    fs.rmSync(path.join(workDir, name), { recursive: true, force: true });
    removed++;
  }
  return removed;
}

/** Make `workDir` a real folder, holding only what `staged` and a build put there,
 *  with no links in it. Only ever removes a link itself, not what it points at. */
export function prepareWorkDir(workDir, staged) {
  const stat = fs.lstatSync(workDir, { throwIfNoEntry: false });
  const name = path.basename(workDir);
  if (stat?.isSymbolicLink()) {
    fs.unlinkSync(workDir);
    console.warn(`[markline] ${name}/ was a link; replacing it with a folder.`);
  } else if (stat && !stat.isDirectory()) {
    throw new Error(`${name} is a file, and the CLI needs that name for a folder. Remove it and try again.`);
  }
  fs.mkdirSync(workDir, { recursive: true });
  const removed = removeLeftovers(workDir, staged) + removeLinks(workDir);
  if (removed) console.warn(`[markline] removed ${removed} leftover ${removed === 1 ? "entry" : "entries"} from ${name}/.`);
}
