import { isIconPath } from "./icon-path";

/* The `icon` a callout (<Callout>, <Note>, <Tip>, …) may take, kept apart from
 * the components so it's unit-tested. It never loads anything: a Phosphor icon
 * name or a short piece of text, and anything else is ignored. */

export type CalloutIcon = { kind: "phosphor"; name: string } | { kind: "text"; text: string };

/** A Phosphor name, as <Card icon> takes it: "rocket-launch" or "rocket-launch:duotone". */
const PHOSPHOR = /^[A-Za-z][\w-]{0,59}(?::[a-z]+)?$/;

/** One or two characters as a reader sees them: "↗", "★", an emoji. */
function shortText(s: string): boolean {
  if (s.length > 16 || /[<>/\\:]/.test(s) || /\s/.test(s)) return false;
  const count = [...new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(s)].length;
  return count >= 1 && count <= 2;
}

/** What `icon` asks for, or undefined to keep the callout's own icon. */
export function calloutIcon(icon: unknown): CalloutIcon | undefined {
  if (typeof icon !== "string") return undefined;
  const s = icon.trim();
  if (!s || isIconPath(s)) return undefined;
  if (PHOSPHOR.test(s)) return { kind: "phosphor", name: s };
  return shortText(s) ? { kind: "text", text: s } : undefined;
}
