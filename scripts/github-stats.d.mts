// Types for scripts/github-stats.mjs, which the tests import.

type Stat = { value: number | string; fetchedAt: number };

export const STATS_FILE: string;
export const MAX_REPOS: number;
export function wantedStats(config: unknown, docsDir: string): string[];
export function readStats(dir: string): Record<string, Stat>;
export function githubApi(env?: Record<string, string | undefined>): string | undefined;
export function writeGithubStats(opts?: {
  dir?: string;
  config?: unknown;
  docsDir?: string;
  maxAgeMs?: number;
  env?: Record<string, string | undefined>;
  fetchImpl?: typeof fetch;
  now?: () => number;
}): Promise<string[]>;
