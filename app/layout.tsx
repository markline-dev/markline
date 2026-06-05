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
import { loadConfig, hexToRgbTriple } from "@/lib/config";
import { Analytics } from "@/components/docs/analytics";

const geist = Geist({ subsets: ["latin"], variable: "--font-geist" });
const geistMono = Geist_Mono({ subsets: ["latin"], variable: "--font-geist-mono" });
const instrumentSerif = Instrument_Serif({ subsets: ["latin"], weight: "400", style: ["normal", "italic"], variable: "--font-instrument-serif" });
const schibsted = Schibsted_Grotesk({ subsets: ["latin"], variable: "--font-schibsted" });
// Cooper — brand wordmark face (used by the home brand lockup).
const cooper = localFont({
  src: [
    { path: "./fonts/Cooper.woff2", weight: "400 900", style: "normal" },
    { path: "./fonts/Cooper.woff", weight: "400 900", style: "normal" },
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
    ...(config.seo.ogImage ? { images: [config.seo.ogImage] } : {}),
  },
  twitter: { card: "summary_large_image" },
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
  if (primary) {
    light.push(`--c-brand:${primary}`, `--c-brand-deep:${primaryDark ?? primary}`);
  }
  if (primaryDark) dark.push(`--c-brand:${primaryDark}`, `--c-brand-deep:${primaryDark}`);

  if (t.font?.sans) independent.push(`--font-geist:${t.font.sans}`);
  if (t.font?.mono) independent.push(`--font-geist-mono:${t.font.mono}`);
  if (t.buttonRadius) independent.push(`--btn-radius:${t.buttonRadius}`);

  for (const [k, v] of Object.entries(t.cssVariables?.light ?? {})) light.push(`${k}:${v}`);
  for (const [k, v] of Object.entries(t.cssVariables?.dark ?? {})) dark.push(`${k}:${v}`);

  const out: string[] = [];
  if (independent.length) out.push(`:root:root{${independent.join(";")}}`);
  if (light.length) out.push(`:root:not(.dark):not([data-theme="dark"]){${light.join(";")}}`);
  if (dark.length) out.push(`:root.dark,:root[data-theme="dark"]{${dark.join(";")}}`);
  return out.length ? out.join("") : null;
}

/** GitHub repo URL from the topbar links (for the shared nav badge), if any. */
function githubUrl(): string | undefined {
  return config.topbar.links?.find((l) => /github\.com/.test(l.href))?.href;
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const brandCss = themeCss();
  const appearance = config.theme.appearance ?? "system";
  return (
    <html lang="en" className={`${geist.variable} ${geistMono.variable} ${instrumentSerif.variable} ${schibsted.variable} ${cooper.variable}`} suppressHydrationWarning>
      <head>
        {brandCss && <style dangerouslySetInnerHTML={{ __html: brandCss }} />}
        <script
          // Inline pre-paint script: applies the saved theme, else the configured
          // default appearance ("light"/"dark"), else the system preference — before
          // paint, to avoid a flash.
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('docs-theme');if(!t){var d='${appearance}';t=(d==='dark'||d==='light')?d:(window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light');}document.documentElement.setAttribute('data-theme',t);if(t==='dark')document.documentElement.classList.add('dark');}catch(e){}})();`,
          }}
        />
      </head>
      <body className="ml-body">
        <Analytics config={config.analytics} />
        <SiteNav
          brand={{ name: config.name, logo: config.theme.logo }}
          tabs={config.navigation.tabs.map((t) => ({ label: t.label, href: t.href }))}
          navLinks={config.topbar.navLinks}
          githubUrl={githubUrl()}
          cta={config.topbar.cta}
          width={config.topbar.width}
          homeWidth={config.topbar.homeWidth}
        />
        {children}
      </body>
    </html>
  );
}
