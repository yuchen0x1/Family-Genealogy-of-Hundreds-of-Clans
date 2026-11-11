// Next.js 16 起，eslint-config-next 直接导出 flat config 数组，
// 不再提供 legacy 的 `next/core-web-vitals` 这类可被 FlatCompat 解析的 extends 名。
// 继续用 FlatCompat 会因配置对象存在循环引用而抛 "Converting circular structure to JSON"。
import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

const config = [
  ...nextCoreWebVitals,
  ...nextTypescript,
  {
    ignores: [
      // Next.js 构建产物。`.next.old-*` 是启动前重命名保存的历史构建缓存，
      // 内容是生成的 JS/chunk/类型声明，不是源码；若不排除会被当成业务代码 lint。
      ".next/**",
      ".next.old-*/**",
      "node_modules/**",
      ".pgbin/**",
      ".pgdata/**",
      ".storage/**",
      "backups/**",
      "reports/**",
      "test-results/**",
      "playwright-report/**",
      "next-env.d.ts",
      "**/*.tsbuildinfo",
    ],
  },
];

export default config;
