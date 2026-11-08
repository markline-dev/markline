// The files build-search.mjs generates into public/ whose paths depend on the
// content (<page>.md, <section>/llms.txt). A manifest beside public/ lists them
// so they can be removed: by the next build, and by `next dev`, where a leftover
// file would beat the route handler and serve text from before the last edit.
// It's kept out of public/ because that folder comes from the docs project and
// is served to readers. Each entry has a hash, so a file the site has since put
// at the same path is its own and stays.

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const MANIFEST = ".markline-generated.json";

const hashOf = (text) => crypto.createHash("sha256").update(text).digest("hex");

const inside = (dir, file) => {
  const rel = path.relative(dir, file);
  return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
};

/** The real folder for public/: it must be a folder itself, so a link can't
 *  move the boundary that removal stays inside. */
function realPublic(appDir) {
  const pub = path.join(fs.realpathSync(appDir), "public");
  return fs.lstatSync(pub).isDirectory() ? pub : null;
}

function removeEntry(pub, entry) {
  const { file, hash } = entry ?? {};
  if (typeof file !== "string" || !(file.endsWith(".md") || path.basename(file) === "llms.txt")) return;
  const abs = path.resolve(pub, file);
  if (abs === pub || !inside(pub, abs) || !inside(pub, fs.realpathSync(path.dirname(abs)))) return;
  if (hashOf(fs.readFileSync(abs)) === hash) fs.rmSync(abs, { force: true });
}

/**
 * Delete the files the last build generated in `appDir`/public. Never throws:
 * at worst, as in a read-only folder, the files stay.
 */
export function removeGeneratedFiles(appDir) {
  try {
    const manifest = path.join(appDir, MANIFEST);
    const entries = JSON.parse(fs.readFileSync(manifest, "utf8"));
    const pub = realPublic(appDir);
    for (const entry of pub && Array.isArray(entries) ? entries : []) {
      try {
        removeEntry(pub, entry);
      } catch {
        // already gone, or not a file
      }
    }
    fs.rmSync(manifest, { recursive: true, force: true });
  } catch {
    // no manifest yet, or nothing we can change here
  }
}

/** Record `files`, paths relative to public/ that the build just wrote. Whatever
 *  is at the manifest's path is replaced, not written through. */
export function writeManifest(appDir, files) {
  const pub = path.join(appDir, "public");
  const entries = files.map((file) => ({ file, hash: hashOf(fs.readFileSync(path.join(pub, file))) }));
  const manifest = path.join(appDir, MANIFEST);
  fs.rmSync(manifest, { recursive: true, force: true });
  fs.writeFileSync(manifest, JSON.stringify(entries));
}
