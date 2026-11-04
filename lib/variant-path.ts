/**
 * Versions and locales share one URL rule: the first entry is the default and
 * lives at the root, every other entry under `/<id>/…`. The API reference puts
 * a version's id after its own prefix (`/api-reference/<id>/…`) and has no
 * per-locale copies.
 *
 * Pure (no `@/` imports) so it can be unit-tested and used on the client.
 */

export type Variants = {
  kind: "versions" | "locales";
  entries: { id: string; label: string }[];
  /** The first entry's id: served without a prefix. */
  defaultId: string;
};

const API = "api-reference";

/** The variant a path belongs to. */
export function variantOf(path: string, v: Variants): string {
  const segs = path.split("/").filter(Boolean);
  const seg = segs[0] === API ? (v.kind === "versions" ? segs[1] : undefined) : segs[0];
  return v.entries.some((e) => e.id === seg && e.id !== v.defaultId) ? seg! : v.defaultId;
}

/** The same page in another variant: `/es/billing` → `/fr/billing` or `/billing`. */
export function variantPath(path: string, to: string, v: Variants): string {
  const [pathname, rest = ""] = splitSuffix(path);
  const segs = pathname.split("/").filter(Boolean);
  const from = variantOf(pathname, v);
  const api = segs[0] === API;
  if (api && v.kind === "locales") return path;
  const at = api ? 1 : 0;
  if (from !== v.defaultId) segs.splice(at, 1);
  if (to !== v.defaultId) segs.splice(at, 0, to);
  return "/" + segs.join("/") + rest;
}

/** Split `?query#hash` off a path. */
function splitSuffix(path: string): [string, string?] {
  const i = path.search(/[?#]/);
  return i < 0 ? [path] : [path.slice(0, i), path.slice(i)];
}
