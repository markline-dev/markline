import type { Metadata } from "next";
import { Geist, Geist_Mono, Instrument_Serif, Schibsted_Grotesk } from "next/font/google";
import localFont from "next/font/local";
import "./globals.css";
import "./home.css";
import "./api-reference.css";
import { DocsTopBar, DocsSidebar } from "@/components/docs/nav";
import { getNav } from "@/components/docs/sections";
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

  for (const [k, v] of Object.entries(t.cssVariables?.light ?? {})) light.push(`${k}:${v}`);
  for (const [k, v] of Object.entries(t.cssVariables?.dark ?? {})) dark.push(`${k}:${v}`);

  const out: string[] = [];
  if (independent.length) out.push(`:root:root{${independent.join(";")}}`);
  if (light.length) out.push(`:root:not(.dark):not([data-theme="dark"]){${light.join(";")}}`);
  if (dark.length) out.push(`:root.dark,:root[data-theme="dark"]{${dark.join(";")}}`);
  return out.length ? out.join("") : null;
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const nav = getNav(config);
  const brand = {
    name: config.name,
    logo: config.theme.logo,
    links: config.topbar.links,
    cta: config.topbar.cta,
    badge: config.topbar.badge,
  };
  const brandCss = themeCss();
  const appearance = config.theme.appearance ?? "system";
  return (
    <html lang="en" className={`antialiased ${geist.variable} ${geistMono.variable} ${instrumentSerif.variable} ${schibsted.variable} ${cooper.variable}`} suppressHydrationWarning>
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
      <body className="min-h-screen flex flex-col m-0 bg-paper text-ink font-sans">
        <Analytics config={config.analytics} />
        <DocsTopBar nav={nav} brand={brand} />
        <div className="docs-shell grid min-h-[calc(100vh-56px)]">
          <style>{`
            .docs-shell { grid-template-columns: 260px minmax(0, 1fr) 300px; }
            /* When the right column is the API request/response panel, give it real estate. */
            .docs-shell:has(> .api-side) { grid-template-columns: 260px minmax(0, 1fr) 460px; }
            @media (max-width: 1280px) {
              .docs-shell:has(> .api-side) { grid-template-columns: 240px minmax(0, 1fr) 400px; }
            }
            @media (max-width: 1080px) {
              .docs-shell { grid-template-columns: 240px minmax(0, 1fr) !important; }
              .docs-shell > .toc, .docs-shell > .api-side { display: none !important; }
            }
            @media (max-width: 720px) {
              .docs-shell { grid-template-columns: 1fr !important; }
              .docs-shell > .docs-side { display: none !important; }
            }
          `}</style>
          <DocsSidebar nav={nav} />
          {children}
        </div>
      </body>
    </html>
  );
}
