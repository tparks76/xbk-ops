import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Headless Chrome for offer PDFs ships its own browser files; don't bundle them.
  serverExternalPackages: ["@sparticuz/chromium", "puppeteer-core"],
  // ...but make sure its browser files are deployed with the pages that confirm shows.
  outputFileTracingIncludes: {
    "/": ["./node_modules/@sparticuz/chromium/bin/**"],
    "/day/[date]": ["./node_modules/@sparticuz/chromium/bin/**"],
  },
};

export default nextConfig;
