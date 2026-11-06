/**
 * Next won't let a route render a URL per request at runtime unless one of its pages
 * did at build: it fails with DYNAMIC_SERVER_USAGE. So each catch-all route lists this
 * one internal path, which always takes the not-found path (lib/uncached-not-found.ts).
 * It's always a 404, even if a real page had this name, as a built page there would
 * break every unknown URL. test/page-cache-prod.test.ts fails if Next stops allowing this.
 */
export const NOT_FOUND_SEGMENT = "_markline-not-found";
