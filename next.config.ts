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
  /**
   * 防止用户上传的档案文件被打进服务端构建产物。
   *
   * `src/lib/storage.ts` 的存储根目录来自 UPLOAD_DIR 环境变量，Turbopack 无法
   * 静态求值，于是把「整个项目目录」都记进了每个 API 路由的 file trace，其中
   * 包括 .storage/uploads 下的真实用户文件。这不只是产物膨胀，更是隐私问题：
   * 私有族谱的档案正文会随 .next 一起被复制、备份或推送镜像。
   *
   * 这里显式排除运行期才产生的目录（上传、备份、本地数据库、测试产物），
   * 让 trace 只包含源码与依赖。若 UPLOAD_DIR 指到项目外，此排除自然不生效。
   */
  outputFileTracingExcludes: {
    "*": [
      ".storage/**",
      "backups/**",
      ".pgdata/**",
      "test-results/**",
      "playwright-report/**",
      "coverage/**",
      "reports/**",
      ".next.old-*/**",
      ".autonomous-upgrade/**",
      ".evolution/**",
      ".workbuddy/**",
      ".pgbin/**",
      ".env*",
    ],
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
  experimental: {
    serverActions: { bodySizeLimit: "20mb" },
  },
};

export default nextConfig;
