import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  transpilePackages: ["@dawah/ui", "@dawah/api-contract"],
};

export default nextConfig;
