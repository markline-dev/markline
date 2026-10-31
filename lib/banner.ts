/**
 * Header banner (`topbar.banner`) rules, shared by the server render and the
 * pre-paint script. Pure (no `@/` imports) so it can be unit-tested.
 */

/** Readers who closed a banner are remembered under this key, by banner id. */
export const BANNER_KEY = "markline-banner-closed";

/** A stable id for a banner: its own `id`, else a short hash of its text. */
export function bannerId(b: { id?: string; text: string }): string {
  if (b.id) return b.id;
  let h = 5381;
  for (let i = 0; i < b.text.length; i++) h = ((h << 5) + h + b.text.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

/** True once the `until` day (`YYYY-MM-DD`, inclusive, local time) is over. */
export function bannerExpired(until: string | undefined, now: Date): boolean {
  if (!until) return false;
  const end = new Date(`${until}T23:59:59.999`);
  return !Number.isNaN(end.getTime()) && now.getTime() > end.getTime();
}

/**
 * Inline script for <head>: hides a banner the reader closed, or one whose
 * day has passed since the site was built, before the first paint, so the
 * header doesn't jump.
 */
export function bannerScript(b: { id?: string; text: string; until?: string }): string {
  const data = JSON.stringify({ id: bannerId(b), until: b.until ?? null }).replace(/</g, "\\u003c");
  return `(function(){try{var b=${data},h=document.documentElement;if(localStorage.getItem(${JSON.stringify(BANNER_KEY)})===b.id||(b.until&&Date.now()>new Date(b.until+"T23:59:59.999").getTime()))h.removeAttribute("data-banner");}catch(e){}})();`;
}
