// Pages are only cached at build time: at runtime Next would otherwise write a
// copy of whatever a request renders, including an unknown URL's 404.
// Next has no setting for this, hence the internal class. If it moves, loading
// this fails, and `next build` loads it, so that's a build error.

const FileSystemCache = require("next/dist/server/lib/incremental-cache/file-system-cache.js").default;

if (typeof FileSystemCache !== "function") throw new Error("Next's FileSystemCache has moved.");

module.exports = class ReadOnlyCache extends FileSystemCache {
  async set(...args) {
    if (process.env.NEXT_PHASE === "phase-production-build") return super.set(...args);
  }
};
