import { test, expect } from "@playwright/test";

/** 真实浏览器走通：登录 → 创建族谱 → 添加人物 → 图谱视图 → 社区发帖。 */
test.describe("登录用户核心流程", () => {
  /** 复用 seed 提供的演示账号，避免反复注册触发注册接口的 IP 限流。 */
  async function login(page: import("@playwright/test").Page) {
    await page.goto("/login");
    await page.locator("#email").fill("demo@xungen.local");
    await page.locator("#password").fill("Demo_Xungen_2026");
    await page.getByRole("button", { name: "登录" }).click();
    await expect(page).toHaveURL(/\/me/, { timeout: 20_000 });
  }

  test("登录、创建族谱并录入人物", async ({ page, browser }) => {
    await login(page);

    await page.goto("/families/new");
    await page.getByPlaceholder("例如：颍川陈氏族谱").fill(`E2E 测试族谱 ${Date.now()}`);
    await page.getByPlaceholder("例如：陈").fill("陈");
    await page.getByRole("button", { name: /创建族谱|创建/ }).last().click();
    await expect(page).toHaveURL(/\/families\/[0-9a-f-]{36}/, { timeout: 20_000 });
    const familyUrl = page.url();

    await page.getByRole("button", { name: "人物管理" }).click();
    await page.getByRole("button", { name: "添加人物" }).first().click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    const inputs = dialog.locator("input:not([type=checkbox])");
    await inputs.nth(0).fill("陈");
    await inputs.nth(1).fill("测试始祖");
    await dialog.getByRole("button", { name: /保存|添加/ }).last().click();
    await expect(page.getByText("陈测试始祖").first()).toBeVisible({ timeout: 15_000 });

    await page.getByRole("button", { name: "关系图谱" }).click();
    await expect(page.getByText(/纵向|横向|网络|时间轴/).first()).toBeVisible();

    await page.getByRole("button", { name: "导入导出" }).click();
    await expect(page.getByText(/导出族谱/).first()).toBeVisible();

    // 私有族谱匿名访客不可见（必须使用完全独立的 browser context，不能继承登录态）
    const anonContext = await browser.newContext();
    const anon = await anonContext.newPage();
    await anon.goto(familyUrl);
    await expect(anon.getByText("这份族谱是私有的")).toBeVisible({ timeout: 15_000 });
    await anonContext.close();
  });

  test("社区发帖与评论流程", async ({ page }) => {
    await login(page);

    await page.goto("/community/new");
    const title = `【E2E】测试寻亲信息 ${Date.now()}`;
    await page.getByPlaceholder("例如：寻河南颍川陈氏「守建晓念」字辈宗亲").fill(title);
    await page.locator("textarea").first().fill("【E2E 测试内容】这是一条自动化端到端测试发布的公开内容，不代表真实寻亲线索。");
    await page.getByRole("button", { name: "发布内容" }).click();
    await expect(page).toHaveURL(/\/community\/[0-9a-f-]{36}/, { timeout: 20_000 });
    await expect(page.getByRole("heading", { name: title })).toBeVisible();

    await page.locator("textarea").first().fill("【E2E】自动化评论，用于验证评论提交与展示。");
    await page.getByRole("button", { name: "发表" }).click();
    await expect(page.getByText("【E2E】自动化评论，用于验证评论提交与展示。").first()).toBeVisible({ timeout: 15_000 });

    await page.goto("/me?tab=profile");
    await expect(page.getByText(/资料与隐私/).first()).toBeVisible();
  });
});
