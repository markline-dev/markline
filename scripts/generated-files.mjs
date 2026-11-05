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

function removeEntry(pub, entry) {
  const { file, hash } = entry ?? {};
  if (typeof file !== "string" || !(file.endsWith(".md") || path.basename(file) === "llms.txt")) return;
  const abs = path.resolve(pub, file);
  if (abs === pub || !inside(pub, abs)) return;
  if (!inside(fs.realpathSync(pub), fs.realpathSync(path.dirname(abs)))) return;
  if (hashOf(fs.readFileSync(abs)) === hash) fs.rmSync(abs, { force: true });
}

/** Delete the files the last build generated in `appDir`/public. Never throws. */
export function removeGeneratedFiles(appDir) {
  const manifest = path.join(appDir, MANIFEST);
  let entries;
  try {
    entries = JSON.parse(fs.readFileSync(manifest, "utf8"));
  } catch {
    return; // nothing generated yet
  }
  const pub = path.join(appDir, "public");
  for (const entry of Array.isArray(entries) ? entries : []) {
    try {
      removeEntry(pub, entry);
    } catch {
      // already gone, or not a file
    }
  }
  fs.rmSync(manifest, { force: true });
}

/** Record `files`, paths relative to public/ that the build just wrote. */
export function writeManifest(appDir, files) {
  const pub = path.join(appDir, "public");
  const entries = files.map((file) => ({ file, hash: hashOf(fs.readFileSync(path.join(pub, file))) }));
  fs.writeFileSync(path.join(appDir, MANIFEST), JSON.stringify(entries));
}
