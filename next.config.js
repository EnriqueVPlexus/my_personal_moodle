/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Self-contained server bundle for the Docker image (see Dockerfile).
  output: 'standalone',
  // package.json is the single source of truth for the app version. Only the
  // version string is inlined into the client bundle, not the whole file.
  env: {
    NEXT_PUBLIC_APP_VERSION: require('./package.json').version
  }
}

module.exports = nextConfig
