// Types for scripts/site-files.mjs, which the tests import.

export function looksGenerated(rel: string, text: string, name: string): boolean;
export function siteFiles(opts: { appPublic: string; sitePublic?: string; name: string }): (rel: string) => boolean;
