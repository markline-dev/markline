import * as Icons from "@phosphor-icons/react/dist/ssr";

/**
 * Turn a Phosphor icon name from markline.json into a rendered icon.
 *
 * Runs on the server only (sections.ts builds the nav there), so the sidebar
 * receives finished <svg> elements and readers never download the icon
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

export function navIcon(name: string | undefined): React.ReactNode | undefined {
  if (!name) return undefined;
  const key = /[-_\s]/.test(name) || name[0] === name[0].toLowerCase() ? toPascal(name) : name;
  const Icon = (Icons as unknown as Record<string, IconComponent | undefined>)[key];
  if (typeof Icon !== "object" && typeof Icon !== "function") {
    // A typo'd icon shouldn't fail the build the way a missing template does:
    // the page is still usable without it. Warn once per name.
    if (!warned.has(name)) {
      warned.add(name);
      console.warn(`[markline] unknown sidebar icon "${name}" — see phosphoricons.com for names.`);
    }
    return undefined;
  }
  return <Icon size={16} weight="regular" aria-hidden />;
}
