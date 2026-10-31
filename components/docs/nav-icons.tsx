import * as Icons from "@phosphor-icons/react/dist/ssr";
import { isIconPath } from "@/lib/icon-path";

/**
 * Turn a Phosphor icon name (from markline.json, or a component's `icon`
 * prop in MDX) into a rendered icon.
 *
 * Runs on the server only (sections.ts builds the nav there, and MDX renders
 * there), so pages receive finished <svg> elements and readers never download the icon
 * library. Accepts "book-open", "book_open" or "BookOpen".
 */

type IconComponent = (props: { size?: number; weight?: string; "aria-hidden"?: boolean }) => React.ReactNode;

const warned = new Set<string>();

function toPascal(name: string): string {
  return name
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join("");
}

export { isIconPath };

/**
 * Your own icon, from /public or a URL. An SVG is drawn as a mask in the
 * current text colour, so it follows the theme like the built-in icons; any
 * other image keeps its own colours.
 */
function customIcon(src: string, size: number): React.ReactNode {
  const box = { width: size, height: size };
  if (/\.svg([?#].*)?$/i.test(src)) {
    const url = `url("${encodeURI(src).replace(/"/g, "%22")}")`;
    return <span className="ml-icon ml-icon--mask" style={{ ...box, WebkitMaskImage: url, maskImage: url }} aria-hidden />;
  }
  return <img className="ml-icon ml-icon--img" src={src} alt="" width={size} height={size} style={box} aria-hidden />;
}

export function navIcon(name: string | undefined, size = 16): React.ReactNode | undefined {
  if (!name) return undefined;
  if (isIconPath(name)) return customIcon(name, size);
  const key = /[-_\s]/.test(name) || name[0] === name[0].toLowerCase() ? toPascal(name) : name;
  const Icon = (Icons as unknown as Record<string, IconComponent | undefined>)[key];
  if (typeof Icon !== "object" && typeof Icon !== "function") {
    // A typo'd icon shouldn't fail the build the way a missing template does:
    // the page is still usable without it. Warn once per name.
    if (!warned.has(name)) {
      warned.add(name);
      console.warn(`[markline] unknown icon "${name}" — see phosphoricons.com for names.`);
    }
    return undefined;
  }
  return <Icon size={size} weight="regular" aria-hidden />;
}
