import createMDX from "@next/mdx";
import remarkGfm from "remark-gfm";
import rehypePrettyCode from "rehype-pretty-code";

// Build mode is chosen by the CLI:
//   MARKLINE_EXPORT=1 -> static HTML export (any CDN / GitHub Pages / S3)
//   otherwise         -> standalone Node server (Docker / Vercel / `markline start`)
const isExport = process.env.MARKLINE_EXPORT === "1";

// Serve under a sub-path (e.g. GitHub Pages project sites at /<repo>).
// Set MARKLINE_BASE_PATH=/repo; it's exposed to the client so the search bundle
// and other absolute asset URLs resolve correctly.
const basePath = (process.env.MARKLINE_BASE_PATH || "").replace(/\/$/, "");

/** @type {import("next").NextConfig} */
const nextConfig = {
  output: isExport ? "export" : "standalone",
  // Keep build artifacts out of the package/node_modules when the CLI points
  // them at the consumer's project (MARKLINE_DIST is an absolute path there).
  ...(process.env.MARKLINE_DIST ? { distDir: process.env.MARKLINE_DIST } : {}),
  ...(basePath ? { basePath, assetPrefix: basePath } : {}),
  env: { NEXT_PUBLIC_MARKLINE_BASE_PATH: basePath },
  reactStrictMode: true,
  // The API playground proxy (app/api/playground/route.ts) is the only `.ts`
  // route in app/. Static export can't include a dynamic route handler, so we
  // drop the `ts` page extension in export mode to exclude it; the playground
  // then runs in direct-fetch mode client-side.
  pageExtensions: isExport ? ["tsx", "md", "mdx"] : ["ts", "tsx", "md", "mdx"],
  experimental: { mdxRs: false },
  images: isExport ? { unoptimized: true } : undefined,
  // Shiki + next-mdx-remote/rsc: keep shiki out of the webpack bundle so its
  // dynamic grammar/theme imports resolve via node_modules at runtime.
  serverExternalPackages: ["shiki"],
  ...(isExport ? {} : { async redirects() { return []; } }),
};

const withMDX = createMDX({
  options: {
    remarkPlugins: [remarkGfm],
    rehypePlugins: [[rehypePrettyCode, { theme: "github-dark-dimmed" }]],
  },
});

export default withMDX(nextConfig);
