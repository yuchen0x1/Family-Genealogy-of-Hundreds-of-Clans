# 项目自主升级交付报告

交付日期：2026-11-16
基线：`main` / `5193070`
范围：源码审计、18 个开源竞品研究、代码硬化、自动化回归、交付文档。

## 1. 交付结论

本轮不是只写建议：已完成 11 个可在当前仓库直接落地的修复，并形成 51 项路线图，其中 EV-001～EV-010 为本轮新增实现，EV-011～EV-028 为已有能力的证据化验收，EV-029～EV-030 为部分完成，EV-031～EV-051 为有文件/模块/验收标准的后续任务。应用可以在本机启动、迁移、seed、构建和运行完整测试；仍不能宣称外部服务和真实生产升级链路已完成。

## 2. 本轮代码变更

- 隐私：新增人物可见性归一化，PATCH 也不会公开在世人物（`src/lib/permissions.ts`、两个 member route）。
- 搜索：全站人物搜索纳入姓氏字段（`src/lib/search.ts`）。
- API 边界：统一校验 UUID 路径参数，错误在 Prisma 之前返回（`src/lib/api.ts`）。
- 安全配置：生产缺少 `SESSION_SECRET` 时 fail-fast；CSP 移除 `unsafe-eval`、加入 `object-src 'none'`（`src/lib/crypto.ts`、`next.config.ts`）。
- 会话与健康：过期会话异步撤销；健康接口增加文件存储状态（`src/lib/auth.ts`、`src/lib/storage.ts`、`src/app/api/health/route.ts`）。
- 构建安全：固定运行期存储路径并排除上传目录 trace，避免用户档案进入构建产物。
- 测试可靠性：Redis 不可用时用 marker 清理进程内限流计数；性能报告读取真实 cache 模式（`src/lib/cache.ts`、`scripts/reset-rate-limits.mjs`、`scripts/perf-check.mjs`）。
- E2E：Playwright 默认基址跟随 `NEXT_PUBLIC_SITE_URL`，解决 127.0.0.1 与 localhost 的 CSRF 配置冲突，不削弱生产校验（`playwright.config.ts`）。
- 新增/更新测试：`search-members.test.ts`、`crypto.test.ts`、`api-origin.test.ts`、`genealogy-privacy.test.ts`。

本轮无 Prisma schema 变更、无数据库迁移、无依赖升级。

## 3. 最终验证证据

| 验证项 | 结果 |
|---|---|
| Vitest | 24 files passed、2 skipped；243 passed / 21 skipped，共 264 |
| HTTP smoke | 28/28、55/55、73/73、93/93、74/74 全通过 |
| Playwright | 11 passed、1 skipped；桌面与移动模拟均通过 |
| Security | 42/42 通过；仅 CSP `unsafe-inline` 警告 |
| Performance | 单实例 PostgreSQL + memory fallback 实测通过；60 并发 0 失败 |
| TypeScript | `pnpm run typecheck` 通过 |
| Lint | `pnpm run lint` 通过 |
| Build | `pnpm run build` 通过；无上传目录 trace 警告 |
| DB | PostgreSQL 17 迁移无 pending；seed 完成 |
| BrowserSkill | 首页、导航、搜索入口、统计卡片和 skip link 实际可见 |

之前 E2E 的 2 个失败是测试基址与 `.env` 同源配置不一致导致的 `CSRF_REJECTED`，不是通过跳过或关闭校验解决；修复配置后完整套件 11/11 非跳过测试通过。

## 4. 路线图状态

- **已实现：EV-001～EV-010**。代码、单测/安全审计/构建证据已在当前工作树。
- **已完成/已验证：EV-011～EV-028**。这些能力在已有代码和本轮 smoke/security/perf/build 中有证据。
- **部分完成：EV-029～EV-030**。更新器的完整性边界和本地质量门禁已验证，但真实 `.sig` 发布、远程 CI 运行链接和生产环境仍待补证。
- **计划：EV-031～EV-051**。没有把 S3、外部 OCR、Redis HA、离线同步、真实签名更新或灾备演练伪装成已完成。

按 51 个升级点统计：**28 个完成/已验证、2 个部分完成、21 个未完成**。本轮新增代码修复为 11 处：EV-001～EV-010 的 10 个路线图条目，另加 F-011 对应的 Playwright origin 配置修复；EV-008 已移除 `unsafe-eval`/加入 `object-src`，`unsafe-inline` 仍由 EV-031 单独跟踪。

## 5. 二次审查

第一次实现后重新检查了 API 路由、隐私边界、构建 trace、限流 reset、README 旧口径和浏览器流程。二次审查发现并修复了一个真实回归：Playwright 默认 `127.0.0.1` 与项目 `NEXT_PUBLIC_SITE_URL=http://localhost:3000` 不一致，导致登录 POST 被同源策略拒绝；将 E2E 默认基址改为跟随环境配置后，完整 Playwright 复测为 11 passed / 1 skipped。另一个 API UUID guard 的初版在无参数路由上访问 undefined context，已修正并重跑 42 项安全审计与全部 smoke。

## 6. 未完成与阻塞

1. CSP `unsafe-inline` 仍需 nonce/hash 改造，改动会触及 Next.js/ECharts 页面渲染。
2. S3、OCR、OpenSearch/Meilisearch、Redis HA 需要部署方凭证、网络和容量基准；本机没有这些外部条件。
3. SOURCE/DOCKER 真实在线更新、`.sig` 签名、公钥轮换、重启和回滚必须在预发环境完成；本轮只验证代码边界和模拟/本地安全检查。
4. Firefox、Safari、真机辅助技术和第三方渗透测试未覆盖。
5. 本轮没有推送分支、创建 Release、上传包或改变生产环境。

## 7. 建议的下一步

先在预发完成 EV-031、EV-032、EV-044、EV-045、EV-050，再接入外部存储/OCR和大数据检索。每项完成后更新本文件对应 EV 状态、保留命令输出或 CI 链接，并重新生成 `docs/TEST_REPORT.md` 的时间戳；不要沿用旧报告中的测试数字。
