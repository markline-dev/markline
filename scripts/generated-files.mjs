// The files build-search.mjs generates into public/ whose paths depend on the
// content (<page>.md, <section>/llms.txt). A manifest lists them so they can be
// removed: by the next build, and by `next dev`, where a leftover file would
// beat the route handler and serve text from before the last edit.

import fs from "node:fs";
import path from "node:path";

const MANIFEST = ".markline-generated.json";

/** Delete the files the last build generated. A site's own files aren't listed. */
export function removeGeneratedFiles(pub) {
  const manifest = path.join(pub, MANIFEST);
  let files;
  try {
    files = JSON.parse(fs.readFileSync(manifest, "utf8"));
  } catch {
    return; // nothing generated yet
  }
  for (const rel of files) fs.rmSync(path.join(pub, rel), { force: true });
  fs.rmSync(manifest, { force: true });
}

export function writeManifest(pub, files) {
  fs.writeFileSync(path.join(pub, MANIFEST), JSON.stringify(files));
}
