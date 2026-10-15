import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The desktop app's lockfile in the parent folder would otherwise be picked as the workspace root.
  turbopack: { root: __dirname },
  poweredByHeader: false,
  serverExternalPackages: ["pg", "@prisma/adapter-pg"],
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "DENY" },
        ],
      },
    ];
  },
};

export default nextConfig;
