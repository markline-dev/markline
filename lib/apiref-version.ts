/**
 * Where the API reference's version picker goes. Pure (no `@/` imports), so the
 * client picker and the unit tests share it.
 */
import { variantPath, type Variants } from "./variant-path";

/**
 * The same page in version `to`, when `exists` says it's there; else that
 * version's reference home. `versions` are the picker's entries; the `default`
 * one is served without a prefix. `same` says which, since an anchor only means something on the same page.
 */
export async function versionTarget(
  pathname: string,
  to: string,
  versions: { id: string; label: string; default?: boolean }[],
  exists: (path: string) => Promise<boolean>,
): Promise<{ path: string; same: boolean }> {
  const variants: Variants = { kind: "versions", entries: versions, defaultId: versions.find((v) => v.default)?.id ?? "" };
  const same = variantPath(pathname, to, variants);
  let found = true;
  try {
    found = await exists(same);
  } catch {
    // Offline or blocked: try the page anyway.
  }
  return found ? { path: same, same: true } : { path: variantPath("/api-reference", to, variants), same: false };
}
