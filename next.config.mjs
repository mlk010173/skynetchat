/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: "export",
  basePath: "/skynetchat",
  trailingSlash: true,
  images: { unoptimized: true },
};

export default nextConfig;
