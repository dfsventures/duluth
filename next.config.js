/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverComponentsExternalPackages: ["@anthropic-ai/sdk", "openai", "bcryptjs", "sharp"],
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "lh3.googleusercontent.com",
      },
    ],
  },
  // Part 40 (WS128.5): share pages and their APIs are never indexed and never leak a referrer. This
  // covers Investor Links too (invisible to recipients). Memo pages are also never cached.
  async headers() {
    const noindex = [
      { key: "X-Robots-Tag", value: "noindex, nofollow" },
      { key: "Referrer-Policy", value: "no-referrer" },
    ];
    return [
      { source: "/share/:path*", headers: noindex },
      { source: "/api/share/:path*", headers: noindex },
      { source: "/share/m/:path*", headers: [{ key: "Cache-Control", value: "no-store" }] },
    ];
  },
  async redirects() {
    return [
      // Domain migration: molly.dfslab.net -> molly.dfs.vc. Keeps every
      // already-sent LP/investor/founder link (share tokens, set-password
      // links, etc.) working — path and query string are preserved.
      {
        source: "/:path*",
        has: [{ type: "host", value: "molly.dfslab.net" }],
        destination: "https://molly.dfs.vc/:path*",
        permanent: true,
      },
    ];
  },
};

module.exports = nextConfig;
