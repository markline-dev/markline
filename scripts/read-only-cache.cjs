// Pages are only cached at build time: at runtime Next would otherwise write a
// copy of whatever a request renders, including an unknown URL's 404.
// Next has no setting for this, hence the internal class. If it moves, loading
// this fails, and `next build` loads it, so that's a build error.
//
// Next 15.5 doesn't write request-time renders here anyway (unknown URLs and
// pages added after the build are dynamic), so for now this is a backstop. If a
// newer Next starts writing them, the weekly latest-next CI job shows it: without
// this handler, test/page-cache-prod.test.ts's "a page added after the build…"
// and "unknown URLs write nothing…" would fail there. That this build uses it is
// checked by "the build uses the read-only cache handler…" in the same file.

const FileSystemCache = require("next/dist/server/lib/incremental-cache/file-system-cache.js").default;

if (typeof FileSystemCache !== "function") throw new Error("Next's FileSystemCache has moved.");

module.exports = class ReadOnlyCache extends FileSystemCache {
  async set(...args) {
    if (process.env.NEXT_PHASE === "phase-production-build") return super.set(...args);
  }
};
