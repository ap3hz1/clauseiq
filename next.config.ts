import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  serverExternalPackages: ["puppeteer", "@puppeteer/browsers"]
};

export default nextConfig;
