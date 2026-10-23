import type { NextConfig } from "next";
import { INTRO_CSP } from "./lib/intro-csp";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "X-Robots-Tag", value: "noindex, nofollow" },
        ],
      },
      // 로그인 전 소개 화면은 자기 것만 허용하는 더 엄격한 내용 보안 정책을 쓴다. (같은 이름이라 위의 공통 값을 덮어쓴다)
      { source: "/intro", headers: [{ key: "Content-Security-Policy", value: INTRO_CSP }] },
    ];
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
