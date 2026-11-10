/**
 * README 截图生成器。
 *
 * 用途：从**真实运行**的站点抓取 README 用图，保证文档里的界面与代码一致。
 * 不是测试用例，不进入 CI；需要站点已在 E2E_BASE_URL（默认 127.0.0.1:3000）运行。
 *
 * 用法：
 *   node scripts/capture-readme.mjs
 *   E2E_BASE_URL=http://127.0.0.1:3000 node scripts/capture-readme.mjs
 *
 * 说明：
 * - 统一 1600x1000 视口，关闭动画与光标闪烁，保证多次运行结果一致。
 * - 登录通过 API 完成（context.request 与浏览器共享 Cookie），不依赖表单交互。
 * - 抓图前会检查页面是否出现框架错误层；出现即报错退出，绝不产出「报错页截图」。
 * - 演示账号仅用于本地开发环境；脚本不会写入任何凭据到图片或仓库。
 */
import { chromium } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const BASE = process.env.E2E_BASE_URL || "http://127.0.0.1:3000";
const OUT_DIR = path.join(process.cwd(), "docs", "images", "readme");

// 演示族谱（prisma/seed.ts 中创建的公开示例，明确标注为演示数据）
const DEMO_FAMILY_ID = process.env.DEMO_FAMILY_ID || "2746a424-b3d0-4a1e-90ca-8b1920b6f514";

const DEMO_USER = {
  email: process.env.DEMO_EMAIL || "demo@xungen.local",
  password: process.env.DEMO_PASSWORD || "Demo_Xungen_2026",
};
const ADMIN_USER = {
  email: process.env.SEED_ADMIN_EMAIL || "admin@xungen.local",
  password: process.env.SEED_ADMIN_PASSWORD || "ChangeMe_Admin_2026",
};

/** 用户态可见的页面 */
const USER_TARGETS = [
  { name: "home", url: "/" },
  { name: "surnames", url: "/surnames" },
  { name: "surname-detail", url: `/surnames/${encodeURIComponent("陈")}` },
  { name: "migration", url: "/roots" },
  // 数据已由 scripts/cleanup-test-data.mjs 清理，这里直接展示公开列表；
  // 若本机又跑过冒烟/E2E，先执行 `pnpm test:cleanup` 再重跑本脚本。
  { name: "families", url: "/families" },
  { name: "genealogy", url: `/families/${DEMO_FAMILY_ID}` },
  { name: "family-stats", url: `/families/${DEMO_FAMILY_ID}#tab=stats` },
  { name: "people", url: `/families/${DEMO_FAMILY_ID}#tab=people` },
  { name: "relationships", url: `/families/${DEMO_FAMILY_ID}#tab=relations` },
  { name: "generations", url: `/families/${DEMO_FAMILY_ID}#tab=generations` },
  { name: "archive", url: `/families/${DEMO_FAMILY_ID}#tab=archive` },
  { name: "import-export", url: `/families/${DEMO_FAMILY_ID}#tab=io` },
  // 同上：社区流在清理后只剩演示帖，直接截取自然列表
  { name: "community", url: "/community" },
  { name: "me", url: "/me" },
  { name: "guide", url: "/guide" },
];

/** 管理后台（需管理员身份；tab 是组件内 state，用点击切换） */
const ADMIN_TARGETS = [
  { name: "admin", url: "/admin", clickText: null },
  { name: "admin-audit", url: "/admin", clickText: "审计日志" },
  // 系统设置内含「系统更新」面板（在线更新入口）
  { name: "admin-update", url: "/admin", clickText: "系统设置" },
];

const FORBIDDEN_TEXT = [
  "Application error",
  "Unhandled Runtime Error",
  "This page could not be found",
  "500",
  "加载失败",
];

async function login(context, { email, password }, label) {
  const res = await context.request.post(`${BASE}/api/auth/login`, {
    data: { email, password },
  });
  if (!res.ok()) {
    throw new Error(`${label} 登录失败：HTTP ${res.status()} ${await res.text()}`);
  }
  const body = await res.json();
  if (body?.ok === false) {
    throw new Error(`${label} 登录失败：${JSON.stringify(body)}`);
  }
}

/** 逐页抓图 */
async function capture(page, targets, results) {
  for (const t of targets) {
    const url = `${BASE}${t.url}`;
    process.stdout.write(`  ${t.name.padEnd(18)} ${url} ... `);

    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60_000 });
    // hash 路由需要在加载后重新应用一次，确保 tab 生效
    if (t.url.includes("#")) {
      await page.evaluate((h) => {
        window.location.hash = h;
      }, t.url.split("#")[1]);
    }
    await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => {});
    await page.waitForTimeout(900);

    if (t.clickText) {
      const btn = page.getByRole("button", { name: t.clickText }).first();
      if (await btn.count()) {
        await btn.click();
        await page.waitForTimeout(900);
      }
    }

    // 可选：在页面内输入关键词过滤，避免开发库里历史测试数据出现在截图中
    if (t.typeInto) {
      const input = page.getByPlaceholder(t.typeInto.placeholder).first();
      await input.fill(t.typeInto.text);
      // 检索框在 <form> 内，需要回车提交（fill 不会触发表单 submit）
      await input.press("Enter");
      await page.waitForLoadState("networkidle", { timeout: 10_000 }).catch(() => {});
      await page.waitForTimeout(900);
    }

    // 回到顶部，并隐藏可能出现的 toast
    await page.evaluate(() => {
      window.scrollTo(0, 0);
      document.querySelectorAll("[role='status'], .toast").forEach((el) => {
        el.style.display = "none";
      });
    });
    await page.waitForTimeout(250);

    const text = await page.locator("body").innerText().catch(() => "");
    const hit = FORBIDDEN_TEXT.find((f) => text.includes(f));
    if (hit) {
      throw new Error(`页面出现异常内容「${hit}」，拒绝截图：${url}`);
    }

    const file = path.join(OUT_DIR, `${t.name}.png`);
    await page.screenshot({ path: file, fullPage: false });
    results.push({ name: t.name, url: t.url, file });
    console.log("ok");
  }
}

function newContext(browser) {
  return browser.newContext({
    viewport: { width: 1600, height: 1000 },
    deviceScaleFactor: 1,
    locale: "zh-CN",
    timezoneId: "Asia/Shanghai",
    reducedMotion: "reduce",
  });
}

/** 关闭动画，避免截图出现中间态 */
async function installStabilityCss(page) {
  await page.addInitScript(() => {
    document.addEventListener("DOMContentLoaded", () => {
      const style = document.createElement("style");
      style.textContent = `
        *, *::before, *::after {
          animation-duration: 0s !important;
          animation-delay: 0s !important;
          transition-duration: 0s !important;
          caret-color: transparent !important;
        }
      `;
      document.head.appendChild(style);
    });
  });
}

(async () => {
  await mkdir(OUT_DIR, { recursive: true });
  const browser = await chromium.launch();
  const results = [];

  try {
    // ---- 公开 + 登录用户 ----
    const userCtx = await newContext(browser);
    const userPage = await userCtx.newPage();
    await installStabilityCss(userPage);
    await login(userCtx, DEMO_USER, "演示用户");
    console.log("\n[用户视角]");
    await capture(userPage, USER_TARGETS, results);
    await userCtx.close();

    // ---- 管理员 ----
    const adminCtx = await newContext(browser);
    const adminPage = await adminCtx.newPage();
    await installStabilityCss(adminPage);
    await login(adminCtx, ADMIN_USER, "管理员");
    console.log("\n[管理后台]");
    await capture(adminPage, ADMIN_TARGETS, results);
    await adminCtx.close();

    await writeFile(
      path.join(OUT_DIR, "manifest.json"),
      JSON.stringify({ generatedAt: new Date().toISOString(), base: BASE, files: results }, null, 2),
      "utf8",
    );

    console.log(`\n完成：${results.length} 张 → ${OUT_DIR}`);
  } finally {
    await browser.close();
  }
})().catch((err) => {
  console.error("\n截图失败：", err.message);
  process.exit(1);
});
