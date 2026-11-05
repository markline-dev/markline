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

/** How often one real folder is copied. Two links to an assets folder are fine,
 *  but links in a chain of folders would double the copy at every level. */
const MAX_COPIES_OF_A_FOLDER = 8;

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

  if (!fs.statSync(realSrc).isDirectory()) {
    throw new Error("public is a file, and the CLI expects a folder of assets. Rename or remove it and try again.");
  }

  const copies = new Map();
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
    const copied = copies.get(real) ?? 0;
    if (copied >= MAX_COPIES_OF_A_FOLDER) return skip(from, "links have that folder copied too many times");
    copies.set(real, copied + 1);
    clear(to, true);
    fs.mkdirSync(to, { recursive: true });
    const inner = new Set(parents).add(real);
    for (const name of fs.readdirSync(real)) copy(path.join(from, name), path.join(to, name), inner);
  };

  copy(src, path.join(workDir, "public"), new Set());
}
