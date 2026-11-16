# 项目审计报告

审计日期：2026-11-16（Asia/Shanghai）
仓库：`Family Genealogy of Hundreds of Clans`
基线：`main` / `5193070`；工作区初始状态干净。

## 1. 审计范围与方法

本轮先完成源码、配置、数据库模型、路由、测试脚本和文档的静态盘点，再执行本机 PostgreSQL/Next.js 运行验收。检查覆盖：

- Next.js App Router 页面、69 个 API Route Handler、20 个页面和 Prisma 48 个业务模型；
- 身份认证、会话、同源校验、限流、权限/隐私、文件存储、导入导出、版本快照、在线更新；
- Vitest、5 套 HTTP 冒烟、Playwright（桌面/移动模拟）、安全审计、性能基线、生产构建；
- BrowserSkill 实际打开首页、检查导航/搜索/统计/跳过链接等可见 UI；
- PostgreSQL 17 本机迁移与 seed。外部 S3、OCR、生产签名发布、真实 SOURCE/DOCKER 跨版本更新未伪造为已验收。

## 2. 架构盘点

| 层 | 当前实现 | 证据 |
|---|---|---|
| Web | Next.js 16.4.5 App Router、React 19.3.1、Tailwind v4 | `package.json`, `src/app/`, `src/components/` |
| API | Route Handler + `src/lib/api.ts` 统一错误、同源、写限流、UUID 边界 | `src/app/api/`, `src/lib/api.ts` |
| 数据 | PostgreSQL 17 + Prisma 6.19.3，48 个模型，软删除和版本表 | `prisma/schema.prisma` |
| 缓存 | Redis 优先，Redis 不可用时进程内 fallback；本地测试可用标记文件清理计数 | `src/lib/cache.ts`, `scripts/reset-rate-limits.mjs` |
| 文件 | 私有 `.storage/uploads`，鉴权下载、魔数/MIME/扩展名校验、SHA-256 | `src/lib/storage.ts`, archive smoke |
| 领域 | 姓氏/历史寻根/迁徙、族谱/人物/关系/字辈/世代、档案/证据、社区、管理后台 | `src/lib/`, `src/app/` |
| 交换 | GEDCOM 5.5.1/7、CSV、JSON、SVG、PNG、PDF 等导入导出 | `src/lib/genealogy-io.ts`, `scripts/smoke-archive.mjs` |
| 运行 | Docker/Compose/Nginx、源码部署、更新器和备份脚本 | `Dockerfile`, `docker-compose.yml`, `deploy/`, `src/lib/updater/` |

## 3. 本轮新增或修复的高价值问题

| 编号 | 发现 | 处置 | 状态 |
|---|---|---|---|
| F-001 | PATCH 人物时只提交 `visibility=PUBLIC` 可能把仍在世人物公开 | 统一 `normalizePersonVisibility()`，按最终 `isLiving` 再收紧为 FAMILY | 已修复并有单测 |
| F-002 | 全站人物检索的 OR 条件未包含姓氏字段，输入姓氏可能搜不到人物 | `searchAll()` 将 `surnameText` 纳入检索 | 已修复并有单测 |
| F-003 | 通用 Route Handler 对非法 UUID 依赖下游 Prisma，错误不一致且可能暴露内部路径 | `route()` 在 handler 前返回 `INVALID_ID` 400 | 已修复并有单测/安全审计 |
| F-004 | 生产缺少 `SESSION_SECRET` 时会静默使用开发默认值 | 生产环境 fail-fast；开发仍保留明确的本地 fallback | 已修复并有单测 |
| F-005 | 过期会话只读不清理，长期积累撤销前的过期记录 | `getCurrentUser()` 发现过期会话时异步标记 revoked | 已修复 |
| F-006 | 健康检查只覆盖数据库/缓存，文件目录不可写时仍可能报告健康 | `/api/health` 增加 storage 状态并在不可用时返回 503 | 已修复并有安全/冒烟覆盖 |
| F-007 | `UPLOAD_DIR` 动态路径造成 Turbopack file trace 可能把上传档案带进构建产物 | 固定默认路径、显式 trace 排除、保留运行期目录 | 已修复；生产构建无该警告 |
| F-008 | CSP 中存在不必要的 `unsafe-eval`，且缺少 `object-src` 限制 | 生产脚本策略移除 `unsafe-eval`，增加 `object-src 'none'` | 已修复；`unsafe-inline` 仍是已知残留 |
| F-009 | Redis 不可用时，独立 reset CLI 无法清理开发服务器内存限流计数 | reset 脚本写入 marker，应用每秒检查并清空 counters | 已修复；连续冒烟全绿 |
| F-010 | 性能报告固定写成 Redis 环境，掩盖实际 fallback 模式 | 根据 `/api/health` 运行时 cache 字段写入报告 | 已修复 |
| F-011 | Playwright 默认 `127.0.0.1` 与 `.env` 的 `NEXT_PUBLIC_SITE_URL=http://localhost:3000` 不一致，真实登录被 CSRF 拒绝 | E2E 默认基址跟随 `NEXT_PUBLIC_SITE_URL`，不放宽生产同源策略 | 已修复；E2E 11 passed / 1 skipped |

## 4. 质量与验证结果

以下是本机最终轮次，而非历史文档中的旧数字：

| 检查 | 结果 |
|---|---|
| `pnpm test -- --reporter=dot` | 24 个文件通过，2 个跳过；243 passed / 21 skipped，共 264 项 |
| HTTP 冒烟 | `test:smoke` 28/28、`smoke:ui` 55/55、`smoke:archive` 73/73、`smoke:community` 93/93、`smoke:admin` 74/74 |
| Playwright | 11 passed、1 skipped；桌面公开/登录/质量流程与移动端检查通过 |
| 安全审计 | 42/42 通过；仅报告 CSP `unsafe-inline` 仍存在的低级别告警 |
| 性能基线 | 单实例本机通过；60 并发请求 0 失败，图谱节点上限和导出端点均完成基线 |
| `pnpm run typecheck` | 通过 |
| `pnpm run lint` | 通过 |
| `pnpm run build` | 通过；69 API、20 页面及框架元路由构建成功，无上传目录 trace 警告 |
| Prisma | 本机 PostgreSQL 迁移无待执行项；seed 完成 504 姓氏、10 来源、32 地点、4 迁徙记录等演示数据 |
| BrowserSkill | 首页可访问；主导航、搜索入口、统计卡片、跳过链接和页脚可见 |

安全审计的唯一已知残留是 Next.js/ECharts 组合仍需要 `script-src 'unsafe-inline'`。它不等于允许任意远程脚本；后续路线图 EV-031 负责 nonce/hash 迁移。依赖 CVE、容器镜像、WAF/CDN、生产证书和第三方渗透测试不属于本机验收范围。

## 5. 强项

1. **领域边界清晰**：姓氏文化、历史资料和用户族谱分层，关系类型、证据等级、核实状态均有显式模型，不把同姓/同名自动推断为血缘。
2. **隐私默认值较稳健**：私有族谱、在世人物保护、协作者权限、敏感字段加密、私有档案鉴权下载和审计日志形成纵深防护。
3. **交换能力完整**：GEDCOM/CSV/JSON 导入预览与事务写入，GEDCOM 5.5.1/7 与 SVG/PNG/PDF 等展示导出，适合迁移和人工校核。
4. **工程验证密度高**：单测、5 套 HTTP 冒烟、浏览器 E2E、安全审计、性能基线、构建和备份工具彼此独立，能够发现真实回归。
5. **自托管路线完整**：源码、Docker、Nginx、systemd/updater 和备份说明已具备；更新流程对目标版本、压缩包路径、摘要和可选签名做了约束。

## 6. 风险与未完成边界

| 风险 | 当前状态 | 建议 |
|---|---|---|
| CSP `unsafe-inline` | 已知残留 | 迁移 nonce/hash，并验证 ECharts/Next 页面回归（EV-031） |
| 多实例限流 | Redis 不可用时仅进程内 | 生产接入 Redis HA、监控和故障演练（EV-032） |
| 对象存储/OCR | 代码边界已留出，未接真实服务 | 先做适配器和队列，再用预发凭证验收（EV-033/034） |
| 大规模检索 | 依赖 PostgreSQL/pg_trgm，尚无独立搜索集群 | 以真实数据压测后决定 OpenSearch/Meilisearch（EV-037） |
| 离线同步 | 尚未实现 | 需要威胁模型、冲突合并和密钥恢复设计（EV-040） |
| 在线更新 | 本机验证了校验/任务安全，未证明生产 SOURCE/DOCKER 全链路 | 预发做备份、安装、重启、健康和回滚演练（EV-045） |
| E2E 浏览器覆盖 | Chromium 桌面/移动模拟；Firefox/Safari/真机未覆盖 | 增加浏览器矩阵和视觉快照（EV-042/043） |
| 依赖与供应链 | 有锁文件和构建，但未做独立 SBOM/CVE 门禁 | CI 增加 SBOM、签名和依赖审计（EV-044/045） |

## 7. 结论

项目已经超过“功能原型”阶段，具备可运行的自托管产品骨架和较完整的隐私/交换/测试基础。本轮将 11 个真实问题转成代码修复，并用完整回归验证。它仍不应被描述为已完成生产级高可用平台：多实例、外部服务、离线同步、浏览器矩阵、签名发布和灾备演练必须按路线图在部署环境继续完成。
