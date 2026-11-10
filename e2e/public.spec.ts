import { test, expect } from "@playwright/test";

test.describe("公开页面与检索", () => {
  test("首页渲染主要导航与搜索入口", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("h1").first()).toBeVisible();
    await expect(page.getByRole("link", { name: "百家姓" }).first()).toBeVisible();
    await expect(page.getByRole("link", { name: "历史寻根" }).first()).toBeVisible();
    await expect(page.getByRole("link", { name: "族谱中心" }).first()).toBeVisible();
    await expect(page.getByRole("link", { name: "宗亲社区" }).first()).toBeVisible();
    await expect(page.getByLabel("全站搜索")).toBeVisible();
    await expect(page.getByLabel("姓氏与族谱搜索")).toBeVisible();
  });

  test("全站搜索跳转到结果页并展示结果", async ({ page }) => {
    await page.goto("/");
    const box = page.getByLabel("姓氏与族谱搜索");
    await box.fill("李");
    await box.press("Enter");
    await expect(page).toHaveURL(/\/search\?q=/);
    await expect(page.getByText(/搜索结果|共找到|李/).first()).toBeVisible();
  });

  test("百家姓列表与姓氏详情可访问", async ({ page }) => {
    await page.goto("/surnames");
    await expect(page.locator("h1").first()).toBeVisible();
    await page.goto("/surnames/%E6%9D%8E");
    await expect(page.locator("h1").first()).toBeVisible();
    await expect(page.getByText(/可信程度|起源|同姓/).first()).toBeVisible();
  });

  test("历史寻根页展示迁徙与古今地名", async ({ page }) => {
    await page.goto("/roots");
    await expect(page.locator("h1").first()).toBeVisible();
    await expect(page.getByText(/迁徙|地名|来源/).first()).toBeVisible();
  });

  test("社区、说明与法务页面可访问", async ({ page }) => {
    for (const [path, text] of [
      ["/community", /宗亲社区|社区动态/],
      ["/guide", /使用说明/],
      ["/legal/privacy", /隐私政策/],
      ["/legal/terms", /用户协议/],
      ["/login", /登录/],
      ["/register", /创建账号/],
    ] as Array<[string, RegExp]>) {
      await page.goto(path);
      await expect(page).toHaveURL(new RegExp(path.replace("/", "\\/")));
      await expect(page.getByText(text).first()).toBeVisible();
    }
  });

  test("登录与注册页面含协议与演示账号说明", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByText(/演示账号/)).toBeVisible();
    await page.goto("/register");
    await expect(page.locator("input[type=checkbox]")).toBeVisible();
    await expect(page.getByRole("main").getByRole("link", { name: "隐私政策" })).toBeVisible();
  });
});
