/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverComponentsExternalPackages: ["@anthropic-ai/sdk", "openai", "bcryptjs"],
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "lh3.googleusercontent.com",
      },
    ],
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
