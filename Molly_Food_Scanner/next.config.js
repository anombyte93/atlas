/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    appDir: true,
  },
  images: {
    domains: ['localhost'],
  },
  // Add any custom configuration here
  // For example: redirects, rewrites, headers, etc.
}

module.exports = nextConfig