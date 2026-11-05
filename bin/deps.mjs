// Which node_modules the staged app runs against, and the link that points it
// there. Dependency-free, so it's unit-tested without staging an app.

import fs from "node:fs";
import path from "node:path";

/**
 * Where the app's dependencies live: the consumer's own node_modules when
 * @markline/markline is installed there, else the framework checkout's, so a
 * bare content folder runs with `node ../markline/bin/markline.mjs dev`.
 */
export function depsDir(contentDir, appDir) {
  for (const dir of [path.join(contentDir, "node_modules"), path.join(appDir, "node_modules")]) {
    if (fs.existsSync(path.join(dir, "next"))) return dir;
  }
  return null;
}

/**
 * Point the link at `deps`, replacing one left by an earlier run: its target
 * may be gone (a removed checkout) or no longer the right one (the project has
 * since installed its own). With no `deps` an old link is just removed, so
 * Node resolves upward from the staged app. A real folder is left alone.
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
