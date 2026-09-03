import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  allowedDevOrigins: ['192.168.18.4'],
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'media.api-sports.io' },
      { protocol: 'https', hostname: 'media-*.api-sports.io' },
      { protocol: 'https', hostname: 'upload.wikimedia.org' },
      { protocol: 'https', hostname: 'crests.football-data.org' },
      { protocol: 'https', hostname: 'i.ytimg.com' },
      { protocol: 'https', hostname: 'content.guardianapis.com' },
      { protocol: 'https', hostname: 'i.guim.co.uk' },
      { protocol: 'https', hostname: 'media.guim.co.uk' },
      { protocol: 'https', hostname: 'static.guardian.co.uk' },
    ],
  },
};

export default nextConfig;
