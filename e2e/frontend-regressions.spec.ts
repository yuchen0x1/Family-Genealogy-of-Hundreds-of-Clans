import { expect, test, type Page } from "@playwright/test";

const user = {
  id: "frontend-user", email: "frontend@example.invalid", displayName: "回归用户", isAdmin: false, roles: ["user"],
  stats: { familyCount: 1, collaboratorCount: 0, documentCount: 0 },
};

async function mockAuthentication(page: Page) {
  let authenticated = false;
  await page.route("**/api/auth/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/auth/me") {
      await route.fulfill({ json: { ok: true, data: { authenticated, user: authenticated ? user : null } } });
      return;
    }
    authenticated = path !== "/api/auth/logout";
    await route.fulfill({ json: { ok: true, data: user } });
  });
}

// All API writes are intercepted; these browser regressions never modify a database.
test("登录保留站内返回地址、刷新身份，并在登录注册间保留邀请入口", async ({ page }) => {
  await mockAuthentication(page);
  await page.goto("/login?next=%2Fguide%23privacy");
  await expect(page.getByRole("main").getByRole("link", { name: "免费注册" })).toHaveAttribute("href", "/register?next=%2Fguide%23privacy");
  await page.getByRole("main").getByRole("link", { name: "免费注册" }).click();
  await expect(page.getByRole("main").getByRole("link", { name: "直接登录" })).toHaveAttribute("href", "/login?next=%2Fguide%23privacy");
  await page.getByRole("main").getByRole("link", { name: "直接登录" }).click();
  await page.locator("#email").fill(user.email);
  await page.locator("#password").fill("Regression_2026");
  const navigation = page.waitForRequest((request) => request.isNavigationRequest() && new URL(request.url()).pathname === "/guide");
  await page.getByRole("button", { name: "登录", exact: true }).click();
  await navigation;
  await expect(page).toHaveURL(/\/guide#privacy$/);
  await expect(page.locator("header").getByRole("button", { name: /回归用户/ })).toBeVisible();
});

test("登录页面拒绝站外返回地址", async ({ page }) => {
  await mockAuthentication(page);
  for (const next of ["https://example.invalid", "//example.invalid", "/\\example.invalid", "javascript:alert(1)"]) {
    await page.goto(`/login?next=${encodeURIComponent(next)}`);
    await expect(page.getByRole("main").getByRole("link", { name: "免费注册" })).toHaveAttribute("href", "/register");
  }
});

test("人物核实状态随创建和编辑表单提交", async ({ page }) => {
  const familyId = "frontend-family";
  const root = `/api/families/${familyId}`;
  let member: Record<string, unknown> | null = null;
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    let data: unknown = [];
    if (path === "/api/auth/me") data = { authenticated: true, user };
    if (path === root) data = {
      id: familyId, name: "前端回归族谱", surnameText: "陈", visibility: "PRIVATE", isDemo: true,
      access: { level: "OWNER", isOwner: true }, _count: { members: member ? 1 : 0, relationships: 0, documents: 0 },
    };
    if (path === `${root}/members`) {
      if (request.method() === "POST") member = { id: "frontend-member", name: "陈回归", ...request.postDataJSON() };
      data = request.method() === "GET"
        ? { items: member ? [member] : [], total: member ? 1 : 0, page: 1, pageSize: 20, totalPages: 1 }
        : member;
    }
    if (path === `${root}/members/frontend-member`) {
      if (request.method() === "PATCH") member = { ...member, ...request.postDataJSON() };
      data = { ...member, relations: [], documents: [] };
    }
    if (path === "/api/places") data = { items: [] };
    if (path === `${root}/graph`) data = { nodes: [], edges: [], totalMembers: 0 };
    await route.fulfill({ json: { ok: true, data } });
  });
  await page.goto(`/families/${familyId}#tab=people`);
  await page.getByRole("button", { name: "添加人物" }).first().click();
  const dialog = page.getByRole("dialog");
  await dialog.locator("input").nth(1).fill("回归");
  await dialog.getByRole("combobox", { name: "资料核实状态" }).selectOption("VERIFIED");
  const created = page.waitForRequest((request) => new URL(request.url()).pathname === `${root}/members` && request.method() === "POST");
  await dialog.getByRole("button", { name: "保存并生成快照" }).click();
  expect((await created).postDataJSON().verification).toBe("VERIFIED");
  await expect(page.locator("tbody").getByText("已核实", { exact: true })).toBeVisible();
  await page.locator('button[title="编辑"]').first().click();
  await dialog.getByRole("combobox", { name: "资料核实状态" }).selectOption("DISPUTED");
  const updated = page.waitForRequest((request) => new URL(request.url()).pathname === `${root}/members/frontend-member` && request.method() === "PATCH");
  await dialog.getByRole("button", { name: "保存并生成快照" }).click();
  expect((await updated).postDataJSON().verification).toBe("DISPUTED");
  await expect(page.locator("tbody").getByText("存疑", { exact: true })).toBeVisible();
});
