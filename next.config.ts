import type { NextConfig } from "next";

const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

const desktopBuild = process.env.NEXT_OUTPUT_STANDALONE === "1";

const nextConfig: NextConfig = {
  // The desktop build (scripts/desktop-prepare.mjs) runs the self-contained server.js from .next-desktop/standalone.
  output: desktopBuild ? "standalone" : undefined,
  distDir: desktopBuild ? ".next-desktop" : ".next",
  poweredByHeader: false,
  serverExternalPackages: ["pg", "@prisma/adapter-pg", "@prisma/client", "exceljs"],
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
