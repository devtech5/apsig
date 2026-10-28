// Deux modes de fonctionnement :
// - local / Docker : server.js sert l'API et délègue les pages à Next.js (un seul port, compatible tunnel) ;
// - Vercel (ou `next start`) : BACKEND_URL désigne l'API déployée ailleurs, relayée ici sur la même origine
//   (cookies de session et temps réel sans CORS).
const backend = process.env.BACKEND_URL?.replace(/\/$/, '');

/** @type {import('next').NextConfig} */
const nextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  devIndicators: false,
  async rewrites() {
    if (!backend) return [];
    return [
      { source: '/api/:path*', destination: `${backend}/api/:path*` },
      { source: '/qr/:path*', destination: `${backend}/qr/:path*` },
      { source: '/media/:path*', destination: `${backend}/media/:path*` },
      { source: '/demo', destination: `${backend}/demo` },
      { source: '/client/demo', destination: `${backend}/client/demo` },
    ];
  },
};

export default nextConfig;
