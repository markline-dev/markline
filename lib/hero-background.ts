/**
 * A hub hero's frontmatter `hero.background` as a CSS background: an image
 * path or URL becomes a cover-fitted `url(…)`, anything else (a colour, a
 * gradient) is used as written.
 *
 * Pure (no `@/` imports) so it can be unit-tested.
 */
const IMAGE = /\.(png|jpe?g|webp|avif|gif|svg)([?#].*)?$/i;

export function heroBackground(value: string | undefined): string | undefined {
  const v = value?.trim();
  if (!v) return undefined;
  if (/^(\/|\.\.?\/|https?:\/\/)/i.test(v) || IMAGE.test(v)) {
    return `url("${encodeURI(v).replace(/"/g, "%22")}") center / cover no-repeat`;
  }
  // A declaration value only: nothing that could end it or open another.
  return v.replace(/[;{}<>]/g, "");
}
