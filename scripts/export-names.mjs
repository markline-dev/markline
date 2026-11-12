// Pages whose names would replace a file in a static export. Next writes each
// page's payload beside its HTML as <url>.txt, so a page at /llms would replace
// llms.txt, and one at /guides/llms a section's llms.txt. Compared as a file
// system that ignores case would (macOS, Windows) and after URL decoding, so
// /LLMS and /%6C%6Cms clash too.

/** Changelog entries to a page: lib/changelog-core.ts PER_PAGE, which this
 *  plain .mjs can't import. A test checks the two are the same. */
export const CHANGELOG_PER_PAGE = 10;

/** Where an export writes a page's payload: "/" → "index.txt", "/a/b" → "a/b.txt". */
export function payloadFile(url) {
  const p = url.replace(/^\/+|\/+$/g, "");
  return `${p || "index"}.txt`;
}

const key = (file) => {
  let f = file;
  try {
    f = decodeURIComponent(f);
  } catch {
    // not valid percent-encoding: compare it as written
  }
  return f.normalize("NFC").toLowerCase();
};

/**
 * Each page (by URL, with the file it comes from) whose payload would land on
 * one of the `files` the site serves (paths relative to the site root).
 */
export function exportClashes(pages, files) {
  const served = new Map(files.map((f) => [key(f), f]));
  const clashes = [];
  for (const { url, source } of pages) {
    const file = served.get(key(payloadFile(url)));
    if (file) clashes.push({ url, source, file });
  }
  return clashes;
}

/** The message for a build that would lose those files. */
export function clashMessage(clashes) {
  const lines = clashes.map(
    ({ url, source, file }) => `  - a page at ${url}${source ? ` (${source})` : ""} would replace ${file}`,
  );
  return `[markline] Some pages can't be exported, as their names would replace files the site serves:\n${lines.join("\n")}\nRename each page; its URL is its file's name.`;
}
