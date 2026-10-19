import type { NextConfig } from "next";

const config: NextConfig = {
  output: "export",
  trailingSlash: true,
  eslint: { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: false },
};

export default config;
