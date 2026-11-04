/**
 * Text colour for a brand-coloured surface: white, or near-black when the
 * brand colour is too light for white. White stays while it reaches 3:1, the
 * WCAG minimum for buttons and large text, so mid-tone brands (a typical
 * blue) keep the white text people expect on them.
 * Colours are "r g b" triples, as the theme tokens store them.
 *
 * Pure (no `@/` imports) so it can be unit-tested.
 */

const WHITE = "255 255 255";
const INK = "17 17 19";

function luminance(triple: string): number {
  const [r, g, b] = triple.split(/\s+/).map((v) => {
    const c = Number(v) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** White, unless it's under 3:1 on `bg` and near-black does better. */
export function onColor(bg: string): string {
  const white = contrastRatio(bg, WHITE);
  return white < 3 && contrastRatio(bg, INK) > white ? INK : WHITE;
}
