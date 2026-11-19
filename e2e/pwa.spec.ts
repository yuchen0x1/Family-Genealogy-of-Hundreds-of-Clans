import { expect, test } from "@playwright/test";

test.skip(process.env.PWA_E2E !== "1", "需要运行生产构建来注册 Service Worker");

test("安装清单和离线回退只缓存通用提示页", async ({ page, context }) => {
  await page.goto("/");
  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute("href", "/manifest.webmanifest");
  const manifest = await (await context.request.get("/manifest.webmanifest")).json();
  expect(manifest.display).toBe("standalone");
  expect(manifest.start_url).toBe("/");
  for (const icon of manifest.icons) {
    expect((await context.request.get(icon.src)).headers()["content-type"]).toBe("image/png");
  }

  await expect.poll(() => page.evaluate(() => navigator.serviceWorker.controller?.state)).toBe("activated");
  await page.goto("/families");
  await context.setOffline(true);
  const response = await page.reload();
  expect(response?.status()).toBe(503);
  await expect(page.getByRole("heading", { name: "无法连接到站点" })).toBeVisible();
  const cachedPaths = await page.evaluate(async () => {
    const names = (await caches.keys()).filter((name) => name.startsWith("xungen-offline-"));
    const cachesKeys = await Promise.all(names.map(async (name) => (await caches.open(name)).keys()));
    return cachesKeys.flat().map((request) => new URL(request.url).pathname);
  });
  expect(cachedPaths).toEqual(["/pwa/offline"]);

  await context.setOffline(false);
  await expect(page.getByRole("link", { name: "返回首页" })).toBeVisible();
  const online = await page.goto("/");
  expect(online?.ok()).toBe(true);
});
