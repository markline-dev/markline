// Copies the project's public/ into the staged app as real files. fs.cpSync's
// `dereference` follows nested links on some Node versions and not others, and
// fails on dead or looping ones, so links are resolved here: the build writes
// and removes files in the staged copy, and that must never reach through to
// wherever a link points.

import fs from "node:fs";
import path from "node:path";

const inside = (dir, file) => {
  const rel = path.relative(dir, file);
  return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
};

/** Whether copying `real` would take in, or land in, the staged app. */
const overlaps = (real, workDir) => real === path.parse(real).root || inside(real, workDir) || inside(workDir, real);

/** Clear whatever is at `dest` unless it's already the folder we want. */
function clear(dest, wantFolder) {
  const stat = fs.lstatSync(dest, { throwIfNoEntry: false });
  if (stat && !(wantFolder && stat.isDirectory())) fs.rmSync(dest, { recursive: true, force: true });
}

export function stagePublic(src, workDir) {
  const realWork = fs.realpathSync(workDir);
  const realSrc = fs.realpathSync(src);
  if (overlaps(realSrc, realWork)) {
    throw new Error(`public/ points at ${realSrc}, which holds the staged app. Point it at a folder of assets instead.`);
  }

  const skip = (from, why) => console.warn(`[markline] skipping ${path.relative(src, from)} in public/: ${why}.`);

  /** `parents`: the real folders being copied above this one, to catch a loop. */
  const copy = (from, to, parents) => {
    let real;
    try {
      real = fs.realpathSync(from);
    } catch {
      return skip(from, "it's a link to nothing");
    }
    const stat = fs.statSync(real);
    if (stat.isFile()) {
      clear(to, false);
      fs.copyFileSync(real, to);
      return;
    }
    if (!stat.isDirectory()) return skip(from, "it isn't a file or folder");
    if (parents.has(real)) return skip(from, "it links back to a folder that holds it");
    if (overlaps(real, realWork)) return skip(from, "it links to a folder that holds the staged app");
    clear(to, true);
    fs.mkdirSync(to, { recursive: true });
    const inner = new Set(parents).add(real);
    for (const name of fs.readdirSync(real)) copy(path.join(from, name), path.join(to, name), inner);
  };

  copy(src, path.join(workDir, "public"), new Set());
}
