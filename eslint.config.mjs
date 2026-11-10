import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({ baseDirectory: __dirname });

const config = [
  ...compat.extends("next/core-web-vitals", "next/typescript"),
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
