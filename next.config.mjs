/** @type {import('next').NextConfig} */
// basePath vem do ambiente: "/skynetchat" no GitHub Pages, vazio na Vercel (dominio proprio)
const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
const nextConfig = {
  reactStrictMode: true,
  output: "export",
  basePath,
  trailingSlash: true,
  images: { unoptimized: true },
};
export default nextConfig;
