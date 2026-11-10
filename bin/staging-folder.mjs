// The staging folder holds a copy of the app that the CLI and Next write into
// and clear out, so nothing in it may lead anywhere else. It's normally made by
// the CLI, but a project can arrive with one already there.

import fs from "node:fs";
import path from "node:path";

/** Remove every link under `root`. Only ever the link: this never follows one.
 *  node_modules at the top is left to linkDeps, or isn't ours if it's real. A
 *  build's own links are in `unwalked`, and the build replaces them rather than
 *  writing through them. If one of those is itself a link, that goes like any other. */
function removeLinks(root, unwalked, dir = root) {
  let removed = 0;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    const rel = path.relative(root, full);
    if (rel === "node_modules") continue;
    if (entry.isSymbolicLink()) {
      fs.unlinkSync(full);
      removed++;
    } else if (entry.isDirectory() && !unwalked.has(rel)) {
      removed += removeLinks(root, unwalked, full);
    }
  }
  return removed;
}

/**
 * Clear out what the CLI and Next didn't put there, since Next would read it as
 * part of the app: config, instrumentation. `staged` is replaced by the caller
 * anyway. What stays is the last build's output, the deps link, the generated
 * files' manifest, the GitHub stats cache, and .env files, which may be where a
 * site keeps its secrets. Returns the names removed.
 */
function removeLeftovers(workDir, staged, outputDirs) {
  const removed = [];
  for (const entry of fs.readdirSync(workDir, { withFileTypes: true })) {
    const { name } = entry;
    const stays =
      staged.includes(name) ||
      (name === "node_modules" && entry.isSymbolicLink()) ||
      (outputDirs.includes(name) && entry.isDirectory()) ||
      ((name === ".markline-generated.json" || name === ".markline-github.json" || name === ".env" || name.startsWith(".env.")) && entry.isFile());
    if (stays) continue;
    fs.rmSync(path.join(workDir, name), { recursive: true, force: true });
    removed.push(name);
  }
  return removed;
}

/** Make `workDir` a real folder, holding only what `staged` and a build put there,
 *  with no links in it. Only ever removes a link itself, not what it points at.
 *  `dist` is MARKLINE_DIST, if the build's output has been put somewhere else. */
export function prepareWorkDir(workDir, staged, dist) {
  const stat = fs.lstatSync(workDir, { throwIfNoEntry: false });
  const name = path.basename(workDir);
  if (stat?.isSymbolicLink()) {
    fs.unlinkSync(workDir);
    console.warn(`[markline] ${name}/ was a link; replacing it with a folder.`);
  } else if (stat && !stat.isDirectory()) {
    throw new Error(`${name} is a file, and the CLI needs that name for a folder. Remove it and try again.`);
  }
  fs.mkdirSync(workDir, { recursive: true });

  const output = dist ? path.relative(workDir, path.resolve(workDir, dist)) : ".next";
  const unwalked = new Set([path.join(output, "standalone"), path.join(output, "node_modules")]);
  const removed = removeLeftovers(workDir, staged, [".next", "public", output.split(path.sep)[0]]);
  if (removed.length) console.warn(`[markline] removed from ${name}/: ${removed.join(", ")}.`);
  const links = removeLinks(workDir, unwalked);
  if (links) console.warn(`[markline] removed ${links} link${links === 1 ? "" : "s"} from ${name}/.`);
}
