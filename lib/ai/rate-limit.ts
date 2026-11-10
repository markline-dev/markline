/**
 * Per-IP limits on Ask AI requests, kept in this server's memory: each server
 * instance (or Worker isolate) counts on its own, so these limit one caller's
 * rate, not total spending. Set spending limits with the AI provider.
 *
 * This file is in two places: lib/ai/rate-limit.ts for the built-in route, and
 * templates/ai-worker/src/rate-limit.ts for the Worker, which is deployed on its
 * own. Keep them the same; a test checks they are.
 */

export type RateLimits = {
  /** Requests in any 60 seconds. */
  perMinute: number;
  /** Requests per UTC day; unset for no daily limit. */
  perDay?: number;
};

type Hits = { times: number[]; day: number; dayCount: number };

const MINUTE = 60_000;
const DAY = 86_400_000;

/** The most a limit can be. */
export const MAX_LIMIT = 1_000_000;

/**
 * How many callers the limiter remembers. Past this, the one seen longest ago
 * is forgotten, and starts a fresh day if it comes back.
 */
export const MAX_CALLERS = 50_000;

/**
 * A limiter: call it once per valid request, just before the provider is
 * called. It returns undefined when the request may go ahead, or how many
 * seconds to wait (for a Retry-After header). Every request counts toward the
 * minute; only those let through count toward the day. (A clock that steps back
 * across midnight starts a fresh day; that's allowed.)
 */
export function createRateLimiter(now: () => number = Date.now) {
  // In the order callers were last seen, oldest first.
  const hits = new Map<string, Hits>();
  let swept = 0;

  return (ip: string, limits: RateLimits): number | undefined => {
    const t = now();
    const day = Math.floor(t / DAY);
    const recent = (h: Hits) => h.times.some((x) => x > t - MINUTE);

    // Forget callers with nothing left to count: no request in the last minute
    // and, with a daily limit, none today.
    if (t - swept >= MINUTE) {
      swept = t;
      for (const [key, h] of hits) {
        if (!recent(h) && (limits.perDay === undefined || h.day !== day)) hits.delete(key);
      }
    }

    let h = hits.get(ip);
    if (h) hits.delete(ip);
    else h = { times: [], day, dayCount: 0 };
    hits.set(ip, h);
    for (const key of hits.keys()) {
      if (hits.size <= MAX_CALLERS) break;
      hits.delete(key);
    }

    if (h.day !== day) {
      h.day = day;
      h.dayCount = 0;
    }

    h.times = h.times.filter((x) => x > t - MINUTE);
    h.times.push(t);
    if (h.times.length > limits.perMinute) {
      // Keep only what can still count, so a flood can't grow the list. The next
      // request also counts, so it's let through once all but perMinute - 1 of
      // these have aged out: when the second oldest does.
      h.times = h.times.slice(-(limits.perMinute + 1));
      return Math.max(1, Math.ceil((h.times[1] + MINUTE - t) / 1000));
    }

    if (limits.perDay !== undefined && h.dayCount >= limits.perDay) {
      return Math.max(1, Math.ceil(((day + 1) * DAY - t) / 1000));
    }
    h.dayCount++;
    return undefined;
  };
}

/**
 * A limit from config or an env var: a whole number from 1 to MAX_LIMIT, as a
 * number or a string of digits. Anything else is undefined, for the caller to
 * report.
 */
export function limitOf(value: unknown): number | undefined {
  const n = typeof value === "string" ? (/^\s*\d+\s*$/.test(value) ? Number(value) : NaN) : value;
  return typeof n === "number" && Number.isInteger(n) && n >= 1 && n <= MAX_LIMIT ? n : undefined;
}
