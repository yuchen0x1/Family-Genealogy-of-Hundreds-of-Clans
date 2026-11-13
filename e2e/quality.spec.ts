import { test, expect } from "@playwright/test";
import { mkdir } from "node:fs/promises";

/** 真实 API + 浏览器回归。只能显式启用，运行在一次性测试库对应的站点。 */
test.skip(process.env.EVOLUTION_ISOLATED_TEST !== "1", "需显式启用独立测试库，避免写入业务数据");

test("资料体检、定位、权限与导入并发只提交一次", async ({ page, playwright }) => {
  const api = page.request;
  const login = await api.post("/api/auth/login", { data: { email: "demo@xungen.local", password: "Demo_Xungen_2026" } });
  expect(login.status()).toBe(200);
  const familyRes = await api.post("/api/families", { data: { name: `资料体检自动验收 ${Date.now()}`, surnameText: "陈", visibility: "PUBLIC" } });
  expect(familyRes.status()).toBe(201);
  const family = (await familyRes.json()).data;
  const root = `/api/families/${family.id}`;
  const upload = (members: unknown[], relationships: unknown[] = []) => api.post(`${root}/import`, { multipart: {
    file: { name: "quality-fixture.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify({ members, relationships })) },
  } });
  const people = [
    { id: "p1", surnameText: "陈", givenName: "体检父辈", birthYear: 1980, deathYear: 1970, isLiving: true },
    { id: "p2", surnameText: "陈", givenName: "体检子辈", birthYear: 1950, isLiving: true },
  ];
  const preview = await upload(people, [{ fromPersonId: "p1", toPersonId: "p2", type: "PARENT_CHILD", subtype: "BIOLOGICAL" }]);
  expect(preview.status()).toBe(201);
  const jobId = (await preview.json()).data.jobId;
  const commits = await Promise.all([1, 2].map(() => api.post(`${root}/import/${jobId}/commit`, { data: { confirm: "IMPORT" } })));
  expect(commits.map((r) => r.status()).sort()).toEqual([200, 409]);
  expect((await api.post(`${root}/import/${jobId}/commit`, { data: { confirm: "IMPORT" } })).status()).toBe(409);
  const members = (await (await api.get(`${root}/members`)).json()).data;
  expect(members.total).toBe(2);
  const firstId = members.items.find((p: { givenName: string }) => p.givenName === "体检父辈").id;
  const reportRes = await api.get(`${root}/quality`);
  expect(reportRes.headers()["cache-control"]).toContain("no-store");
  const report = (await reportRes.json()).data;
  expect(report.counts.WARNING).toBe(3);
  expect(report.counts.INFO).toBe(1);

  const duplicate = await upload([people[0], people[0]]);
  const duplicateData = (await duplicate.json()).data;
  expect(duplicateData.report.ready).toBe(false);
  expect((await api.post(`${root}/import/${duplicateData.jobId}/commit`, { data: { confirm: "IMPORT" } })).status()).toBe(409);

  const anonymous = await playwright.request.newContext({ baseURL: process.env.E2E_BASE_URL || "http://127.0.0.1:3000" });
  try {
    for (const path of ["quality", "duplicates", "import", `import/${jobId}`]) expect((await anonymous.get(`${root}/${path}`)).status()).toBe(403);
    const graph = (await (await anonymous.get(`${root}/graph?focus=${firstId}&up=0&down=0`)).json()).data;
    expect(graph.nodes).toHaveLength(1);
    expect(graph.nodes[0].birthYear).toBeNull();
    expect(graph.nodes[0].deathYear).toBeNull();
  } finally { await anonymous.dispose(); }

  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(`/families/${family.id}#tab=quality`);
  await expect(page.getByRole("heading", { name: "资料体检", exact: true })).toBeVisible();
  await expect(page.getByText("登记卒年 1970 早于生年 1980", { exact: false })).toBeVisible();
  await page.getByRole("button", { name: "待考证 1", exact: true }).click();
  await expect(page.getByText("该关系尚未核实，不参与亲属称谓计算", { exact: false })).toBeVisible();
  await page.getByRole("button", { name: "全部 4", exact: true }).click();
  await page.getByRole("textbox", { name: "搜索体检问题" }).fill("不存在的姓名");
  await expect(page.getByText("没有匹配的提示")).toBeVisible();
  await page.getByRole("textbox", { name: "搜索体检问题" }).fill("");
  await mkdir("docs/images/evolution", { recursive: true });
  await page.screenshot({ path: "docs/images/evolution/quality-desktop.png", fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: "docs/images/evolution/quality-mobile.png", fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.getByRole("link", { name: /核对 陈体检父辈/ }).first().click();
  await expect(page.getByText("已定位体检提示中的人物")).toBeVisible();
  await expect(page.locator("tbody tr")).toHaveCount(1);
  await page.getByRole("button", { name: "显示全部人物" }).click();
  await expect(page.locator("tbody tr")).toHaveCount(2);
  await page.getByRole("button", { name: "资料体检", exact: true }).click();
  await page.getByRole("link", { name: "核对该关系", exact: true }).first().click();
  await expect(page.getByText("已定位体检提示中的关系")).toBeVisible();
  await expect(page.locator("tbody tr")).toHaveCount(1);
  await expect(page.getByText("未核实", { exact: true }).first()).toBeVisible();
  expect(errors).toEqual([]);
});
