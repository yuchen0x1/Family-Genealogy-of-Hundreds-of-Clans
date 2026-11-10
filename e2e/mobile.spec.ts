import { test, expect } from "@playwright/test";

/** 移动端适配：导航可展开、主要页面可读、无明显横向溢出。 */
test.describe("移动端", () => {
  test("首页可展开菜单并访问主要栏目", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("h1").first()).toBeVisible();
    await page.getByLabel("展开菜单").click();
    const menu = page.locator("header > div.border-t");
    await expect(menu.getByRole("link", { name: "宗亲社区" })).toBeVisible();
    await menu.getByRole("link", { name: "百家姓" }).click();
    await expect(page).toHaveURL(/\/surnames/);
  });

  test("主要公开页面在移动视口下无横向溢出", async ({ page }) => {
    for (const path of ["/", "/surnames", "/roots", "/community", "/guide", "/legal/privacy"]) {
      await page.goto(path);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow, `${path} 横向溢出 ${overflow}px`).toBeLessThanOrEqual(2);
    }
  });

  test("移动端登录表单可操作", async ({ page }) => {
    await page.goto("/login");
    await expect(page.locator("#email")).toBeVisible();
    await page.locator("#email").fill("mobile@xungen.local");
    await page.locator("#password").fill("Mobile2026");
    await expect(page.getByRole("button", { name: "登录" })).toBeEnabled();
  });
});
