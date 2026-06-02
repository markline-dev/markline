import createMDX from "@next/mdx";
import remarkGfm from "remark-gfm";
import rehypePrettyCode from "rehype-pretty-code";

/** @type {import("next").NextConfig} */
const nextConfig = {
  output: "standalone",
  reactStrictMode: true,
  pageExtensions: ["ts", "tsx", "md", "mdx"],
  experimental: { mdxRs: false },
  // Shiki + next-mdx-remote/rsc: keep shiki out of the webpack bundle so its
  // dynamic grammar/theme imports resolve via node_modules at runtime.
  serverExternalPackages: ["shiki"],
  async redirects() {
    return [];
  },
};

const withMDX = createMDX({
  options: {
    remarkPlugins: [remarkGfm],
    rehypePlugins: [[rehypePrettyCode, { theme: "github-dark-dimmed" }]],
  },
});

export default withMDX(nextConfig);
