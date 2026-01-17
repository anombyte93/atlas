/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'http',
        hostname: 'localhost',
        port: '3002',
        pathname: '/uploads/**',
      },
    ],
  },
  async rewrites() {
    return [
      {
        source: '/:path((?!api|_next|_next|_static).*)*',  // Exclude API routes and Next.js internals
        destination: '/uploads/molly.html',
      },
    ];
  },
}

module.exports = nextConfig