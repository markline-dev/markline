import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { DocsTopBar, DocsSidebar } from "@/components/docs/nav";
import { getDocsTabs } from "@/components/docs/sections";

const geist = Geist({ subsets: ["latin"], variable: "--font-geist" });
const geistMono = Geist_Mono({ subsets: ["latin"], variable: "--font-geist-mono" });

export const metadata: Metadata = {
  metadataBase: new URL("https://hyphenmoney.com"),
  title: {
    default: "Propeller — China–Africa payment corridor",
    template: "%s · Propeller",
  },
  description:
    "Propeller is the Merchant of Record for the China–Africa payment corridor. Naira in, USDC out — compliance, FX, and settlement handled end-to-end.",
  openGraph: {
    type: "website",
    siteName: "Propeller",
    images: ["/og.png"],
  },
  twitter: { card: "summary_large_image" },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const tabs = getDocsTabs();
  const topTabs = tabs.map(({ id, label, href, matchPrefixes }) => ({ id, label, href, matchPrefixes }));
  return (
    <html lang="en" className={`antialiased ${geist.variable} ${geistMono.variable}`} suppressHydrationWarning>
      <head>
        <script
          // Inline pre-paint script: applies the saved (or system) theme before the page renders to avoid FOUC.
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('docs-theme');if(!t){t=window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';}document.documentElement.setAttribute('data-theme',t);if(t==='dark')document.documentElement.classList.add('dark');}catch(e){}})();`,
          }}
        />
      </head>
      <body className="min-h-screen flex flex-col m-0 bg-paper text-ink font-sans">
        <DocsTopBar tabs={topTabs} />
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
