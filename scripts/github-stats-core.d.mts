// Types for scripts/github-stats-core.mjs, which lib/github-stars.ts imports.

export const HOME_REPO: string;
export const HOME_PACKAGE: string;
export function repoOf(url: string): string | undefined;
export function isRepo(s: unknown): boolean;
export function statKey(kind: "stars" | "contributors" | "version", name: string): string | undefined;
export function validValue(key: string, value: unknown): boolean;
export function lastPage(link: string | null | undefined): number | undefined;
export function fetchStat(
  key: string,
  opts?: { api?: string; token?: string; timeoutMs?: number; fetchImpl?: typeof fetch; now?: () => number },
): Promise<{ value: number | string; fetchedAt: number } | undefined>;
