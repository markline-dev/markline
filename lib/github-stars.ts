/* GitHub stars and the like, in the browser: which value to show, and keeping
 * it current. The build bakes a value into the page (scripts/github-stats.mjs);
 * with `topbar.githubStars: "live"` the browser fetches a newer one at most
 * once an hour per reader, keeps it in localStorage, and never shows less than
 * the newest value it has. Pure apart from the storage and fetch it's given, so
 * it's unit-tested. */

import { fetchStat, validValue } from "@/scripts/github-stats-core.mjs";

export { HOME_PACKAGE, HOME_REPO, repoOf, statKey } from "@/scripts/github-stats-core.mjs";

export type Stat = { value: number | string; fetchedAt: number };
export type StarsMode = "live" | "build" | false;

/** How long a fetched value is used before asking again. */
export const MAX_AGE = 60 * 60 * 1000;

const CACHE_PREFIX = "markline:stat:";
const FAILED_PREFIX = "markline:stat-failed:";

/** 5, 999, 1k, 1.2k, 12k, 1.5M. Rounded down, so it never overstates. */
export function formatCount(n: number): string {
  if (n < 1000) return String(n);
  const [d, unit] = n < 1e6 ? [1e3, "k"] : [1e6, "M"];
  const v = n / d;
  return `${v < 10 ? Math.floor(v * 10) / 10 : Math.floor(v)}${unit}`;
}

/** The value to show, or undefined: a count of 0 isn't shown. */
export function shown(stat: Stat | undefined): string | undefined {
  if (!stat) return undefined;
  if (typeof stat.value === "number") return stat.value > 0 ? formatCount(stat.value) : undefined;
  return stat.value || undefined;
}

/** The most recently fetched of the values given. */
export function newest(...stats: (Stat | undefined)[]): Stat | undefined {
  return stats.reduce<Stat | undefined>((best, s) => (s && (!best || s.fetchedAt > best.fetchedAt) ? s : best), undefined);
}

/** A well-formed stat for `key`; anything else, from storage or a file, is ignored. */
export const isStat = (key: string, s: unknown): s is Stat =>
  !!s && typeof s === "object" && validValue(key, (s as Stat).value) && Number.isFinite((s as Stat).fetchedAt);

/** A time from the future (a clock that's wrong) counts as long ago, so it
 *  neither wins over a real value nor stops a refresh. */
const sane = (s: Stat | undefined, now: number): Stat | undefined => (s && s.fetchedAt > now ? { ...s, fetchedAt: 0 } : s);

type Store = Pick<Storage, "getItem" | "setItem">;

function readItem(store: Store | undefined, name: string): unknown {
  try {
    return JSON.parse(store?.getItem(name) ?? "null");
  } catch {
    return undefined;
  }
}

function writeItem(store: Store | undefined, name: string, value: unknown) {
  try {
    store?.setItem(name, JSON.stringify(value));
  } catch {}
}

/** One request per stat at a time on a page, however many places show it. */
const inFlight = new Map<string, Promise<Stat | undefined>>();

/**
 * The value to show for `key`, given the one baked into the page: first what
 * the page and this reader's cache already have, then, in "live" mode, after
 * one fetch, unless there's a value, or a failed try, from under MAX_AGE ago.
 * `show` is called with each better value.
 */
export async function refreshStat(
  key: string,
  baked: Stat | undefined,
  mode: StarsMode,
  show: (stat: Stat | undefined) => void,
  { store, fetchImpl = fetch, now = Date.now }: { store?: Store; fetchImpl?: typeof fetch; now?: () => number } = {},
): Promise<void> {
  if (mode !== "live") return show(baked);
  const t = now();
  const cached = readItem(store, CACHE_PREFIX + key);
  const best = newest(sane(isStat(key, baked) ? baked : undefined, t), sane(isStat(key, cached) ? cached : undefined, t));
  show(best);
  if (best && best.fetchedAt > t - MAX_AGE) return;
  // A failed fetch (rate limit, a repo that isn't there, offline) isn't retried
  // for MAX_AGE either.
  const failed = readItem(store, FAILED_PREFIX + key);
  if (typeof failed === "number" && failed <= t && failed > t - MAX_AGE) return;

  let request = inFlight.get(key);
  if (!request) {
    request = fetchStat(key, { fetchImpl, now }) as Promise<Stat | undefined>;
    inFlight.set(key, request);
    request.finally(() => inFlight.delete(key));
  }
  const fresh = await request;
  if (!fresh) return writeItem(store, FAILED_PREFIX + key, now());
  writeItem(store, CACHE_PREFIX + key, fresh);
  show(newest(best, fresh));
}

/** localStorage, or undefined where it can't be reached. */
export function browserStore(): Store | undefined {
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}
