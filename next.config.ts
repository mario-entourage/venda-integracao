import type { NextConfig } from 'next';
import { execSync } from 'child_process';

function git(cmd: string): string {
  try { return execSync(`git ${cmd}`, { encoding: 'utf8' }).trim(); } catch { return ''; }
}

const nextConfig: NextConfig = {
  env: {
    NEXT_PUBLIC_BUILD_SHA: git('rev-parse --short HEAD'),
    NEXT_PUBLIC_BUILD_DATE: new Date().toISOString(),
    NEXT_PUBLIC_BUILD_MSG: git('log -1 --format=%s'),
  },
  serverExternalPackages: ['genkit', '@genkit-ai/google-genai', '@genkit-ai/core'],
  typescript: {
    ignoreBuildErrors: false,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'firebasestorage.googleapis.com',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'lh3.googleusercontent.com',
        port: '',
        pathname: '/**',
      },
    ],
  },
};

export default nextConfig;
