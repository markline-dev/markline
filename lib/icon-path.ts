/**
 * Whether an `icon` value is a path or URL ("/icons/agents.svg") rather than a
 * Phosphor icon name ("rocket-launch"). Pure, so it can be unit-tested.
 */
/** An icon path ending in `?color` keeps its own colours instead of taking
 *  the text colour: "/icons/slack.svg?color". */
export function keepsColor(src: string): boolean {
  return /[?&]color(?=$|#)/.test(src);
}

export function isIconPath(name: string): boolean {
  return /^(\/|\.\.?\/|https?:\/\/)/i.test(name) || /\.(svg|png|jpe?g|webp|gif|avif)([?#].*)?$/i.test(name);
}
