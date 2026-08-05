import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // 課堂上常直接開 127.0.0.1；允許本機開發資源，不放寬外部網域。
  allowedDevOrigins: ["127.0.0.1"],
};

export default nextConfig;
