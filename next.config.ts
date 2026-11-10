import type { NextConfig } from "next";

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-XSS-Protection", value: "1; mode=block" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=()",
  },
  {
    key: "Content-Security-Policy",
    value:
      "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; frame-ancestors 'self'; base-uri 'self'; form-action 'self'",
  },
];

const buildVersion =
  process.env.APP_VERSION ||
  (process.env.GITHUB_REF_TYPE === "tag" ? process.env.GITHUB_REF_NAME?.replace(/^v/i, "") : undefined);
const buildSha = process.env.APP_BUILD_SHA || process.env.GITHUB_SHA;
const buildTime = process.env.APP_BUILD_TIME || new Date().toISOString();

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // 版本信息不是密钥，注入构建产物后可在无 .git 的部署环境中展示准确版本。
  env: {
    ...(buildVersion ? { APP_VERSION: buildVersion } : {}),
    ...(buildSha ? { APP_BUILD_SHA: buildSha } : {}),
    APP_BUILD_TIME: buildTime,
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
  experimental: {
    serverActions: { bodySizeLimit: "20mb" },
  },
};

export default nextConfig;
