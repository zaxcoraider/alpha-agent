import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  experimental: {
    // Allow server actions from any vercel.app subdomain + localhost
    serverActions: {
      allowedOrigins: [
        'localhost:3000',
        'crypto-plantir.vercel.app',
      ],
    },
  },
};

export default nextConfig;
