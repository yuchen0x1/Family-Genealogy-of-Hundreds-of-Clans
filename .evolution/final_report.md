# 中华寻根 · 百家族谱项目进化报告

生成日期：2026-11-12（Asia/Shanghai）

## 1. 项目原始情况

这是一个 Next.js App Router + Prisma 的族谱与姓氏文化 Web 平台，包含公开姓氏资料、历史人物、迁徙数据、私有族谱、人物关系、亲属称谓、文档、OCR、导入导出、版本恢复、协作邀请、社区与管理员后台。

本次开始时，源码目录缺少 `package.json`、锁文件、TypeScript/Next 工程配置和 Git 元数据。源码与 `node_modules` 缓存存在，但无法直接复现安装、类型检查或构建。

## 2. 竞品研究清单

共筛选 15 个候选项目，深度研究 7 个：Gramps Web、webtrees、GeneWeb、Gramps、HuMo-genealogy、RootFree、Genea。研究重点是 GEDCOM 互操作、隐私粒度、图谱/地图、研究任务、后台任务、数据可迁移和离线取向。

采用的方向：严格隐私边界、标准格式互操作、可追溯证据、关系图谱、后台任务可见进度和键盘可访问性。AI 助手、DNA 工具和离线单文件主模式暂缓。

## 3. 功能差距结论

P0/P1 优先项是工程可运行性和写请求同源校验，已完成。GEDCOM round-trip、研究任务和时间线属于下一批 P2；AI 助手、DNA 与离线主模式属于需要单独隐私和产品设计评审的 P4/D 项。

完整矩阵见 [`feature_gap.json`](./feature_gap.json)。

## 4. 实际移植与修复

- `src/lib/api.ts`：修复原先仅比较 host 的同源校验。现在必须匹配完整 origin，拒绝同主机不同协议/端口以及 malformed Origin。
- `src/tests/api-origin.test.ts`：新增同源回归测试。
- `src/app/layout.tsx`、`src/app/globals.css`、`src/components/site-header.tsx`：增加跳过固定导航的 skip link、主要内容锚点和主导航可访问标签。
- 恢复 `package.json`、`pnpm-lock.yaml`、`tsconfig.json`、`next-env.d.ts`、`postcss.config.mjs`、`vitest.config.ts`，让当前源码可重复安装、检查、测试和构建。
- 补充 `echarts` 运行依赖并选择 Zod 4，与源码现有 API 用法保持一致。

## 5. 架构与 UI 升级

本批次没有改动 Prisma schema 或数据库迁移，避免在缺少数据库配置时引入不可验证的数据变更。UI 改动集中在全局键盘导航和主导航语义，保持现有视觉系统和业务组件不变。

## 6. 测试结果

- `pnpm prisma generate`：通过。
- `pnpm typecheck`：通过。
- `pnpm test -- --reporter=dot`：20 个测试文件通过，1 个跳过；213 个测试通过，17 个跳过。
- `pnpm build`：通过；Next.js 15.5.29 完成生产构建并生成 45/45 静态页面。
- 已有 `reports/security-audit.json`：42/42 通过，1 个已知 CSP 宽松指令告警。
- 已有 `reports/perf-report.json`：记录的 60 个并发请求全部成功；该文件是 2026-11-10 的历史基线，本轮没有在无服务环境中伪称重新执行。

## 7. 未完成事项与风险

- 已恢复 Git 元数据并统一到 `main`：添加远程 `git@github.com:yuchen0x1/Family-Genealogy-of-Hundreds-of-Clans.git`，确认远程仅保留 `main`，将当前源码快照与远程 `main` 合并为提交 `9b6b8c7`，并提交状态记录。当前本地 `main` 已包含远程 `main`，未自动推送或发布；差异可用 `git rev-list --left-right --count origin/main...main` 查看。
- 当前目录没有 `.env`；未启动数据库、Redis 或站点，因此本轮没有重跑 HTTP/UI 冒烟、数据库迁移、生产 HTTPS、外部 OCR、对象存储和部署验收。
- `package.json#prisma` 在 Prisma 7 中将废弃；升级 Prisma 前应迁移到 `prisma.config.ts`。
- CSP 中的 `unsafe-inline` / `unsafe-eval` 仍是已有遗留项，需要先收敛 inline script 和运行时依赖，再改为 nonce/hash。

## 8. 进化评分

| 维度 | 改造前 | 改造后 | 证据 |
|---|---:|---:|---|
| 功能完整度 | 19/25 | 20/25 | 现有族谱、关系、资料、协作与导入导出模块；本批次补工程可运行性 |
| UI 与用户体验 | 15/20 | 16/20 | 全局 skip link、主内容锚点、主导航语义 |
| 稳定性 | 14/20 | 17/20 | 类型检查、213 个单元测试、生产构建通过 |
| 架构与代码质量 | 11/15 | 12/15 | 工程配置恢复、同源校验回归测试、未改动数据库结构 |
| 性能与安全 | 8/10 | 9/10 | 同源校验加固；历史安全报告 42/42 通过，CSP 告警仍在 |
| 文档与工程交付 | 4/10 | 9/10 | package/lock/config、Git `main` 基线和 `.evolution` 独立交付记录；远程推送与部署仍未执行 |
| **合计** | **71/100** | **83/100** | 评分以本地源码、Git 状态、测试和现有报告为证据 |

## 9. 下一阶段建议

1. 提供数据库和部署环境变量，运行迁移、seed、HTTP/UI/security/perf 全套回归。
2. 为 GEDCOM 5.5.1/5.5.5、媒体、来源引用建立 round-trip fixtures 和兼容性报告。
3. 引入研究任务与事件时间线，保持所有 AI 或自动建议只读、可追溯、不可自动写入已核实事实。
4. 依赖按远程 `main` 的锁文件重新安装并重跑检查；如需远程交付，再明确授权后推送 `origin/main`。
