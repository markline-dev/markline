import type { MarklineConfig } from "./config";

/* The site-level Open Graph and Twitter fields. Next replaces the layout's
 * openGraph and twitter objects whenever a page sets its own, rather than
 * merging them, so each page that does spreads these in first and its own
 * title, description and url go on top. */

type Seo = Pick<MarklineConfig, "name" | "seo">;

const images = (config: Seo) => (config.seo.ogImage ? { images: [config.seo.ogImage] } : {});

export function siteOpenGraph(config: Seo) {
  return { siteName: config.seo.siteName ?? config.name, ...images(config) };
}

export function siteTwitter(config: Seo) {
  return { card: "summary_large_image" as const, ...images(config) };
}
