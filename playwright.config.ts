import { defineConfig, devices } from "@playwright/test";

/**
 * 端到端测试配置。
 * 默认复用已在运行的本地站点；未启动时会按 webServer 命令自动拉起。
 * 测试账号使用随机邮箱，每次运行自清理（软删除，不污染既有数据）。
 */
export default defineConfig({
  testDir: "./e2e",
  timeout: 45_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: process.env.E2E_BASE_URL || "http://127.0.0.1:3000",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    locale: "zh-CN",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } }, testIgnore: /mobile\.spec\.ts/ },
    // 使用 Chromium 模拟移动设备，避免额外依赖 WebKit 二进制
    { name: "mobile", use: { ...devices["Pixel 5"], browserName: "chromium" }, testMatch: /mobile\.spec\.ts/ },
  ],
  webServer: {
    command: "pnpm dev",
    url: process.env.E2E_BASE_URL || "http://127.0.0.1:3000",
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
