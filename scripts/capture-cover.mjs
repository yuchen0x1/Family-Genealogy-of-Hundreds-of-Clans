/**
 * README 封面生成器。
 *
 * 与 capture-readme.mjs 分开，因为封面是「版式合成」而非页面截屏：
 * 用项目自身的品牌色（取自 src/app/globals.css 的 CSS 变量）排版，
 * 右侧嵌入一张**真实运行截图**，避免用假界面充当产品图。
 *
 * 输出：docs/images/readme/cover.png（1600×800，2 倍渲染保证清晰）
 */
import { chromium } from "@playwright/test";
import { mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

const ROOT = process.cwd();
const OUT = path.join(ROOT, "docs", "images", "readme", "cover.png");
const SHOT = path.join(ROOT, "docs", "images", "readme", "genealogy.png");

const HTML = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8" />
<style>
  :root {
    --ink: #191b1d;
    --ink-soft: #2b2f33;
    --navy: #1b2a41;
    --navy-light: #2c4060;
    --gold: #b08d57;
    --gold-light: #d8bd8b;
    --cream: #f7f5ef;
    --jade: #3e6b6b;
  }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    width: 1600px; height: 800px;
    font-family: "Noto Serif SC", "Source Han Serif SC", "Songti SC", SimSun, serif;
    background:
      radial-gradient(1100px 620px at 78% 18%, rgba(44,64,96,.85), transparent 62%),
      linear-gradient(135deg, #16233a 0%, #1b2a41 48%, #101a2b 100%);
    color: var(--cream);
    overflow: hidden;
    position: relative;
  }
  /* 细网格纹理，呼应站点 hero */
  .grid {
    position: absolute; inset: 0;
    background-image:
      linear-gradient(rgba(216,189,139,.06) 1px, transparent 1px),
      linear-gradient(90deg, rgba(216,189,139,.06) 1px, transparent 1px);
    background-size: 48px 48px;
    mask-image: radial-gradient(120% 90% at 30% 40%, #000 30%, transparent 78%);
    -webkit-mask-image: radial-gradient(120% 90% at 30% 40%, #000 30%, transparent 78%);
  }
  /* 巨型「寻」水印 */
  .watermark {
    position: absolute; right: -30px; top: -120px;
    font-size: 720px; line-height: 1;
    color: rgba(216,189,139,.055);
    font-weight: 700; letter-spacing: -0.04em;
    user-select: none;
  }
  .wrap {
    position: relative; z-index: 2;
    height: 100%; padding: 68px 76px;
    display: grid; grid-template-columns: 1fr 720px; gap: 52px;
    align-items: center;
  }
  .brand { display: flex; align-items: center; gap: 16px; }
  .mark {
    width: 58px; height: 58px; border-radius: 12px;
    background: linear-gradient(160deg, #24354f, #16233a);
    border: 1px solid rgba(216,189,139,.42);
    display: grid; place-items: center;
    font-size: 30px; color: var(--gold-light);
    box-shadow: 0 8px 26px rgba(0,0,0,.38), inset 0 0 0 1px rgba(255,255,255,.04);
  }
  .brand-text .cn { font-size: 25px; letter-spacing: .1em; font-weight: 600; }
  .brand-text .en {
    font-size: 11px; letter-spacing: .3em; color: var(--gold-light);
    margin-top: 5px; font-family: ui-sans-serif, system-ui, sans-serif;
    text-transform: uppercase; opacity: .92;
  }
  h1 {
    margin-top: 34px;
    font-size: 76px; line-height: 1.14; font-weight: 700;
    letter-spacing: .04em;
  }
  h1 .gold {
    background: linear-gradient(100deg, #e8d2a9, #b08d57 60%, #e8d2a9);
    -webkit-background-clip: text; background-clip: text; color: transparent;
  }
  .rule {
    width: 116px; height: 2px; margin: 26px 0 22px;
    background: linear-gradient(90deg, var(--gold), rgba(176,141,87,0));
  }
  .desc {
    font-size: 19px; line-height: 1.95; color: rgba(247,245,239,.86);
    max-width: 640px;
  }
  .desc em { font-style: normal; color: var(--gold-light); }
  .stats { display: flex; gap: 44px; margin-top: 44px; }
  .stat .n {
    font-size: 34px; color: var(--gold-light); font-weight: 700;
    font-family: ui-sans-serif, system-ui, sans-serif; letter-spacing: .02em;
  }
  .stat .l {
    margin-top: 6px; font-size: 12px; letter-spacing: .16em;
    color: rgba(247,245,239,.62);
  }
  .shot {
    position: relative;
    border-radius: 14px;
    padding: 10px;
    background: linear-gradient(160deg, rgba(216,189,139,.34), rgba(216,189,139,.08));
    box-shadow: 0 34px 80px rgba(0,0,0,.55), 0 0 0 1px rgba(216,189,139,.16);
  }
  .shot img {
    display: block; width: 100%; border-radius: 8px;
  }
  .shot .tag {
    position: absolute; left: 22px; bottom: -14px;
    background: var(--cream); color: var(--ink);
    font-size: 12px; letter-spacing: .08em;
    padding: 6px 14px; border-radius: 999px;
    box-shadow: 0 8px 20px rgba(0,0,0,.32);
    font-family: ui-sans-serif, system-ui, sans-serif;
  }
</style>
</head>
<body>
  <div class="grid"></div>
  <div class="watermark">寻</div>
  <div class="wrap">
    <div>
      <div class="brand">
        <div class="mark">寻</div>
        <div class="brand-text">
          <div class="cn">中华寻根 · 百家族谱</div>
          <div class="en">Chinese Genealogy &amp; Heritage Platform</div>
        </div>
      </div>

      <h1>寻一姓之源，<br /><span class="gold">续一脉之谱</span></h1>
      <div class="rule"></div>
      <p class="desc">
        从姓氏源流、郡望堂号到祖籍迁徙，从真实家族人物、亲属称谓到族谱档案协作。<br />
        <em>以史料为据，以隐私为界</em>——所有业务数据落库，历史资料与用户族谱物理分离。
      </p>

      <div class="stats">
        <div class="stat"><div class="n">504</div><div class="l">百家姓全表</div></div>
        <div class="stat"><div class="n">4</div><div class="l">族谱视图</div></div>
        <div class="stat"><div class="n">7</div><div class="l">导出格式</div></div>
        <div class="stat"><div class="n">48</div><div class="l">数据模型</div></div>
      </div>
    </div>

    <div class="shot">
      <img src="${pathToFileURL(SHOT).href}" alt="族谱关系图谱界面" />
      <div class="tag">真实运行界面 · 演示数据</div>
    </div>
  </div>
</body>
</html>`;

await mkdir(path.dirname(OUT), { recursive: true });

const tmpHtml = path.join(tmpdir(), `xungen-cover-${Date.now()}.html`);
await writeFile(tmpHtml, HTML, "utf8");

const browser = await chromium.launch();
try {
  const page = await browser.newPage({
    viewport: { width: 1600, height: 800 },
    deviceScaleFactor: 2,
  });
  await page.goto(pathToFileURL(tmpHtml).href, { waitUntil: "load" });
  // 等字体与内嵌截图解码完成
  await page.waitForFunction(() => {
    const img = document.querySelector("img");
    return img && img.complete && img.naturalWidth > 0;
  });
  await page.waitForTimeout(400);
  await page.screenshot({ path: OUT });
  console.log(`封面已生成：${OUT}`);
} finally {
  await browser.close();
  await rm(tmpHtml, { force: true });
}
