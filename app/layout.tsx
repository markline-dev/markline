import type { Metadata } from "next";
import { Geist, Geist_Mono, Instrument_Serif, Schibsted_Grotesk } from "next/font/google";
import localFont from "next/font/local";
import "./markline-tokens.css";
import "./globals.css";
import "./home.css";
import "./api-reference.css";
import "./api-explorer.css";
import "./docs.css";
import "./components.css";
import { SiteNav } from "@/components/site-nav";
import { loadConfig, loadTemplateCss, hexToRgbTriple, type MarklineConfig, type TopbarItem, type TopbarLink } from "@/lib/config";
import { bannerExpired, bannerId, bannerScript } from "@/lib/banner";
import { onColor } from "@/lib/contrast";
import { escapeStyleText } from "@/lib/templates";
import { Analytics } from "@/components/docs/analytics";

const geist = Geist({ subsets: ["latin"], variable: "--font-geist" });
const geistMono = Geist_Mono({ subsets: ["latin"], variable: "--font-geist-mono" });
const instrumentSerif = Instrument_Serif({ subsets: ["latin"], weight: "400", style: ["normal", "italic"], variable: "--font-instrument-serif" });
const schibsted = Schibsted_Grotesk({ subsets: ["latin"], variable: "--font-schibsted" });
// Cooper — brand wordmark face (used by the home brand lockup).
const cooper = localFont({
  src: [
    { path: "./fonts/Cooper.woff2", weight: "400 900", style: "normal" },
  ],
  variable: "--font-cooper",
  display: "swap",
  preload: false,
});

const config = loadConfig();

export const metadata: Metadata = {
  ...(config.seo.metadataBase ? { metadataBase: new URL(config.seo.metadataBase) } : {}),
  title: config.seo.title
    ? { default: config.seo.title, template: config.seo.titleTemplate ?? `%s · ${config.name}` }
    : config.name,
  description: config.seo.description,
  ...(config.theme.favicon ? { icons: { icon: config.theme.favicon } } : {}),
  openGraph: {
    type: "website",
    siteName: config.seo.siteName ?? config.name,
    title: config.seo.title ?? config.name,
    description: config.seo.description,
    ...(config.seo.metadataBase ? { url: config.seo.metadataBase } : {}),
    ...(config.seo.ogImage ? { images: [config.seo.ogImage] } : {}),
  },
  twitter: {
    card: "summary_large_image",
    title: config.seo.title ?? config.name,
    description: config.seo.description,
    ...(config.seo.ogImage ? { images: [config.seo.ogImage] } : {}),
  },
};

/**
 * Theme CSS from config: brand accent, font families, and arbitrary CSS-var
 * overrides (full palette).
 *
 * Light overrides are scoped to `:root:not(.dark):not([data-theme=dark])` so
 * they do NOT leak into dark mode (a plain `:root:root` would out-specify the
 * `.dark` selector and bleed light colors into dark). Dark overrides use
 * `:root.dark` to out-specify globals.css. Fonts are mode-independent.
 */
function themeCss(): string | null {
  const t = config.theme;
  const independent: string[] = [];
  const light: string[] = [];
  const dark: string[] = [];

  const primary = t.colors?.primary ? hexToRgbTriple(t.colors.primary) : null;
  const primaryDark = t.colors?.primaryDark ? hexToRgbTriple(t.colors.primaryDark) : null;
  // Text on each brand surface: primaryText / primaryTextDark when set, else
  // white, or dark when the colour is too light for white (a pale green or
  // yellow primary).
  const textOn = (bg: string, set?: string) => (set && hexToRgbTriple(set)) || onColor(bg);
  if (primary) {
    const on = textOn(primary, t.colors?.primaryText);
    light.push(`--c-brand:${primary}`, `--c-brand-deep:${primaryDark ?? primary}`, `--c-on-brand:${on}`);
    independent.push(`--c-brand-solid:${primary}`, `--c-on-brand-solid:${on}`);
  }
  if (primaryDark) {
    dark.push(`--c-brand:${primaryDark}`, `--c-brand-deep:${primaryDark}`, `--c-on-brand:${textOn(primaryDark, t.colors?.primaryTextDark)}`);
  }

  if (t.font?.sans) independent.push(`--font-geist:${t.font.sans}`);
  if (t.font?.mono) independent.push(`--font-geist-mono:${t.font.mono}`);
  if (t.font?.heading) independent.push(`--heading-font:${t.font.heading}`);
  if (t.buttonRadius) independent.push(`--btn-radius:${t.buttonRadius}`);

  for (const [k, v] of Object.entries(t.cssVariables?.light ?? {})) light.push(`${k}:${v}`);
  for (const [k, v] of Object.entries(t.cssVariables?.dark ?? {})) dark.push(`${k}:${v}`);

  const out: string[] = [];
  if (independent.length) out.push(`:root:root{${independent.join(";")}}`);
  if (light.length) out.push(`:root:not(.dark):not([data-theme="dark"]){${light.join(";")}}`);
  if (dark.length) out.push(`:root.dark,:root[data-theme="dark"]{${dark.join(";")}}`);
  return out.length ? out.join("") : null;
}

/** `versions`, or else `i18n.locales`, when there's more than one. */
const variants = (() => {
  const kind = config.versions?.length ? ("versions" as const) : config.i18n?.locales?.length ? ("locales" as const) : null;
  const entries = kind === "versions" ? config.versions! : kind === "locales" ? config.i18n!.locales : [];
  return kind && entries.length > 1 ? { kind, entries, defaultId: entries[0].id } : null;
})();
/** What the header needs of them: ids and labels. */
const switcher = variants && {
  ...variants,
  entries: variants.entries.map((e) => ({ id: e.id, label: e.label })),
};

function headerTabs(navigation: MarklineConfig["navigation"]) {
  return navigation.tabs.map((t) => ({ label: t.label, href: t.href, match: t.match }));
}

const isGithub = (l: TopbarItem): l is TopbarLink => "href" in l && /github\.com/.test(l.href);

/** GitHub repo URL from the topbar links (for the shared nav badge), if any. */
function githubUrl(): string | undefined {
  return config.topbar.links?.find(isGithub)?.href;
}

/** `topbar.banner`, unless its last day had passed when the site was built. */
const banner = (() => {
  const b = config.topbar.banner;
  if (!b?.text || bannerExpired(b.until, new Date())) return undefined;
  return { text: b.text, link: b.link, dismissible: b.dismissible !== false, tone: b.tone ?? "neutral", id: bannerId(b) };
})();

export default function RootLayout({ children }: { children: React.ReactNode }) {
  // Both can carry text from a template, so neither is trusted to stay inside
  // its <style> element.
  const brandCss = escapeStyleText(themeCss() ?? "");
  const tplCss = escapeStyleText(loadTemplateCss());
  const appearance = config.theme.appearance ?? "system";
  return (
    <html
      lang={variants?.kind === "locales" ? variants.defaultId : "en"}
      className={`${geist.variable} ${geistMono.variable} ${instrumentSerif.variable} ${schibsted.variable} ${cooper.variable}`}
      data-header={config.layout.header}
      data-content={config.layout.content}
      data-surface={config.layout.surface === "panel" ? "panel" : undefined}
      data-banner={banner ? "on" : undefined}
      // Heading-font rules only apply when one is configured, so sites that
      // don't set it render exactly as before.
      data-heading-font={config.theme.font?.heading ? "" : undefined}
      suppressHydrationWarning
    >
      <head>
        {/* Template styles first, so the site's own theme settings override them. */}
        {tplCss && <style data-markline-template dangerouslySetInnerHTML={{ __html: tplCss }} />}
        {brandCss && <style dangerouslySetInnerHTML={{ __html: brandCss }} />}
        <script
          // Inline pre-paint script: applies the saved theme, else the configured
          // default appearance ("light"/"dark"), else the system preference — before
          // paint, to avoid a flash.
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('docs-theme');if(!t){var d='${appearance}';t=(d==='dark'||d==='light')?d:(window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light');}document.documentElement.setAttribute('data-theme',t);if(t==='dark')document.documentElement.classList.add('dark');if(localStorage.getItem('markline-ai-open')==='1')document.documentElement.setAttribute('data-ai-open','1');}catch(e){}})();`,
          }}
        />
        {banner && <script dangerouslySetInnerHTML={{ __html: bannerScript(config.topbar.banner!) }} />}
      </head>
      <body className="ml-body">
        <Analytics config={config.analytics} />
        <SiteNav
          brand={{ name: config.name, logo: config.theme.logo }}
          tabs={headerTabs(config.navigation)}
          variants={switcher}
          tabsByVariant={
            variants
              ? Object.fromEntries(variants.entries.map((e) => [e.id, headerTabs(e.navigation ?? config.navigation)]))
              : undefined
          }
          navLinks={config.topbar.navLinks}
          links={config.topbar.links?.filter((l) => !isGithub(l))}
          githubUrl={githubUrl()}
          badge={config.topbar.badge}
          cta={config.topbar.cta}
          secondaryCta={config.topbar.secondaryCta}
          banner={banner}
          width={config.topbar.width}
          homeWidth={config.topbar.homeWidth}
          header={config.layout.header}
          search={config.layout.search}
        />
        {children}
      </body>
    </html>
  );
}
