import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { DocsTopBar, DocsSidebar } from "@/components/docs/nav";
import { getDocsTabs } from "@/components/docs/sections";
import { loadConfig, hexToRgbTriple } from "@/lib/config";
import { Analytics } from "@/components/docs/analytics";

const geist = Geist({ subsets: ["latin"], variable: "--font-geist" });
const geistMono = Geist_Mono({ subsets: ["latin"], variable: "--font-geist-mono" });

const config = loadConfig();

export const metadata: Metadata = {
  ...(config.seo.metadataBase ? { metadataBase: new URL(config.seo.metadataBase) } : {}),
  title: config.seo.title
    ? { default: config.seo.title, template: config.seo.titleTemplate ?? `%s · ${config.name}` }
    : config.name,
  description: config.seo.description,
  openGraph: {
    type: "website",
    siteName: config.seo.siteName ?? config.name,
    ...(config.seo.ogImage ? { images: [config.seo.ogImage] } : {}),
  },
  twitter: { card: "summary_large_image" },
};

/** CSS that overrides the brand accent from config (doubled :root specificity to win over globals.css). */
function brandColorCss(): string | null {
  const primary = config.theme.colors?.primary ? hexToRgbTriple(config.theme.colors.primary) : null;
  const primaryDark = config.theme.colors?.primaryDark ? hexToRgbTriple(config.theme.colors.primaryDark) : null;
  if (!primary && !primaryDark) return null;
  const rules: string[] = [];
  if (primary) rules.push(`:root:root{--c-brand:${primary};--c-brand-deep:${primaryDark ?? primary};}`);
  if (primaryDark) rules.push(`:root.dark,:root[data-theme="dark"]{--c-brand:${primaryDark};}`);
  return rules.join("");
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const tabs = getDocsTabs();
  const topTabs = tabs.map(({ id, label, href, matchPrefixes }) => ({ id, label, href, matchPrefixes }));
  const brand = {
    name: config.name,
    logo: config.theme.logo,
    links: config.topbar.links,
    cta: config.topbar.cta,
  };
  const brandCss = brandColorCss();
  return (
    <html lang="en" className={`antialiased ${geist.variable} ${geistMono.variable}`} suppressHydrationWarning>
      <head>
        {brandCss && <style dangerouslySetInnerHTML={{ __html: brandCss }} />}
        <script
          // Inline pre-paint script: applies the saved (or system) theme before the page renders to avoid FOUC.
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('docs-theme');if(!t){t=window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';}document.documentElement.setAttribute('data-theme',t);if(t==='dark')document.documentElement.classList.add('dark');}catch(e){}})();`,
          }}
        />
      </head>
      <body className="min-h-screen flex flex-col m-0 bg-paper text-ink font-sans">
        <Analytics config={config.analytics} />
        <DocsTopBar tabs={topTabs} brand={brand} mobileTabs={tabs} />
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
          <DocsSidebar tabs={tabs} />
          {children}
        </div>
      </body>
    </html>
  );
}
