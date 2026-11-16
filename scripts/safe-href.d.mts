// Types for scripts/safe-href.mjs, which pages, config and tests import.

export const ALLOWED_LINKS: string;
export function safeHref(url: unknown): string | undefined;
export function quoteHref(url: unknown): string;
