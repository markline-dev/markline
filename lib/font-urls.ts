/**
 * `theme.font.url`: stylesheets that load web fonts (Google Fonts, Bunny,
 * Fontshare, or a CSS file in /public), linked from every page's <head>.
 * Pure (no `@/` imports) so it can be unit-tested.
 */

export type FontLinks = {
  /** Stylesheet hrefs, in order, without duplicates. */
  sheets: string[];
  /** Origins worth a <link rel="preconnect">: the stylesheets' hosts, plus
   *  the host Google Fonts serves its font files from. */
  origins: string[];
};

/** https:// URLs and site paths only; anything else is dropped. */
function usable(url: string): boolean {
  return /^https:\/\/[^/\s]+/i.test(url) || (url.startsWith("/") && !url.startsWith("//"));
}

export function fontLinks(url: string | string[] | undefined, basePath = ""): FontLinks {
  const list = (Array.isArray(url) ? url : url ? [url] : []).map((u) => u.trim()).filter(usable);
  const sheets = [...new Set(list.map((u) => (u.startsWith("/") ? basePath + u : u)))];
  const origins = new Set<string>();
  for (const s of sheets) {
    if (!s.startsWith("https://")) continue;
    const { origin } = new URL(s);
    origins.add(origin);
    if (origin === "https://fonts.googleapis.com") origins.add("https://fonts.gstatic.com");
  }
  return { sheets, origins: [...origins] };
}
