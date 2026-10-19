import type { NextConfig } from "next";

const config: NextConfig = {
  eslint: { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: false },
  async redirects() {
    return [
      {
        source: "/",
        destination: "https://keyblind.dev",
        permanent: true,
      },
    ];
  },
};

export default config;
