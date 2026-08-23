import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // به Express بک‌اند (پورت ۳۰۰۰) پروکسی می‌شه
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: "http://localhost:3000/api/:path*",
      },
      {
        source: "/picture/:path*",
        destination: "http://localhost:3000/picture/:path*",
      },
      {
        source: "/assets/:path*",
        destination: "http://localhost:3000/assets/:path*",
      },
      // سرویس‌ورکر و فایل‌های PWA از بک‌اند
      {
        source: "/sw.js",
        destination: "http://localhost:3000/sw.js",
      },
      {
        source: "/manifest.json",
        destination: "http://localhost:3000/manifest.json",
      },
      {
        source: "/robots.txt",
        destination: "http://localhost:3000/robots.txt",
      },
      {
        source: "/sitemap.xml",
        destination: "http://localhost:3000/sitemap.xml",
      },
    ];
  },

  // بهینه‌سازی تصاویر Next.js — عکس‌ها از بک‌اند میان
  images: {
    remotePatterns: [
      {
        protocol: "http",
        hostname: "localhost",
        port: "3000",
        pathname: "/picture/**",
      },
    ],
    // فرمت‌های بهینه
    formats: ["image/webp"],
  },

  // کمپرس — Brotli و gzip رو خود Next.js انجام میده
  compress: true,

  // کش طولانی برای فایل‌های استاتیک
  poweredByHeader: false,
};

export default nextConfig;