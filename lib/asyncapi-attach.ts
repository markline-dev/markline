/**
 * Which resource page a WebSocket channel goes on. Pure, so the rule is tested.
 *
 * A channel joins the resource of its first tag that is one. Without a tag that
 * matches, it joins the resource whose operations share the longest leading run
 * of path segments with it, comparing paths without the host (`/v1/tts/{id}/stream`
 * shares `tts/{id}` with `/v1/tts/{id}`). A leading version segment (`v1`) doesn't
 * count, on either side, or every `/v1/…` path would match. A tie goes to the
 * resource that comes first in the reference. With no shared segment it goes to
 * `rest`, which the reference lists under "WebSockets".
 */
import type { AsyncChannel } from "./asyncapi";

export type Resource = { name: string; paths: string[] };

const segments = (path: string): string[] => {
  const segs = path.split(/[?#]/)[0].replace(/^[a-z][a-z0-9+.-]*:\/\/[^/]*/i, "").split("/").filter(Boolean);
  return /^v\d+$/i.test(segs[0] ?? "") ? segs.slice(1) : segs;
};

/** Leading segments two paths share; `{param}`s match any `{param}`. */
function shared(a: string[], b: string[]): number {
  let n = 0;
  while (n < a.length && n < b.length) {
    const x = a[n];
    const y = b[n];
    const bothParams = /^\{.*\}$/.test(x) && /^\{.*\}$/.test(y);
    if (x.toLowerCase() !== y.toLowerCase() && !bothParams) break;
    n++;
  }
  return n;
}

export function attachChannels(
  channels: AsyncChannel[],
  resources: Resource[],
  /** A channel tag → the resource it files under (after `api.tags`), or null when hidden. */
  resourceOfTag: (tag: string) => string | null = (t) => t,
): { byResource: Map<string, AsyncChannel[]>; rest: AsyncChannel[]; hidden: AsyncChannel[] } {
  const byResource = new Map<string, AsyncChannel[]>();
  const rest: AsyncChannel[] = [];
  const hidden: AsyncChannel[] = [];
  const names = new Set(resources.map((r) => r.name));
  const add = (name: string, c: AsyncChannel) => byResource.set(name, [...(byResource.get(name) ?? []), c]);
  for (const c of channels) {
    if (c.tags.length) {
      const resolved = c.tags.map((t) => resourceOfTag(t));
      // Every tag hidden: the channel is hidden with them.
      if (resolved.every((r) => r === null)) {
        hidden.push(c);
        continue;
      }
      const home = resolved.find((r): r is string => !!r && names.has(r));
      if (home) {
        add(home, c);
        continue;
      }
    }
    const own = segments(c.address);
    let best: string | undefined;
    let bestScore = 0;
    for (const r of resources) {
      const score = Math.max(0, ...r.paths.map((p) => shared(own, segments(p))));
      if (score > bestScore) {
        best = r.name;
        bestScore = score;
      }
    }
    if (best) add(best, c);
    else rest.push(c);
  }
  return { byResource, rest, hidden };
}
