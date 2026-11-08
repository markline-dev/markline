// Which node_modules the staged app runs against, and the link that points it
// there. Dependency-free, so it's unit-tested without staging an app.

import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

/**
 * Next's package.json, by module resolution from the framework: when
 * @markline/markline is installed as a dependency, npm hoists `next` to the
 * consumer's top-level node_modules, not under our package. Resolving from
 * appDir walks up to wherever it actually lives.
 */
export function nextPackageJson(appDir) {
  return createRequire(path.join(appDir, "package.json")).resolve("next/package.json");
}

/**
 * Where the app's dependencies live: the node_modules that holds the Next the
 * CLI runs, so the two are always the same install. That's the project's own
 * when @markline/markline is installed there, and the framework checkout's when
 * the CLI runs from one, whatever the docs folder has installed itself.
 */
export function depsDir(appDir) {
  try {
    return path.dirname(path.dirname(nextPackageJson(appDir)));
  } catch {
    return null;
  }
}

/**
 * Point the link at `deps`, replacing one left by an earlier run: its target
 * may be gone (a removed checkout) or no longer the right one (the package has
 * since been installed). With no `deps` an old link is just removed, so
 * Node resolves upward from the staged app. A real folder is left alone, though
 * prepareWorkDir has already removed one from the staging folder.
 */
export function linkDeps(link, deps) {
  let stat;
  try {
    stat = fs.lstatSync(link);
  } catch {
    stat = null;
  }
  if (stat && !stat.isSymbolicLink()) return;
  if (stat) {
    const target = path.resolve(path.dirname(link), fs.readlinkSync(link));
    if (deps && target === path.resolve(deps)) return;
    fs.unlinkSync(link);
  }
  if (deps) fs.symlinkSync(deps, link, "junction");
}
