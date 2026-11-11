# 完成与未完成清单

生成时间：2026-11-08（2026-11-10 v0.2.0 发布轮更新）。本文如实区分「已实现并验证」「已实现但未在本机验证」「明确未完成/依赖外部条件」，未测试的功能一律不标记为完成。

## 1. 最终验收标准逐项对照

| # | 验收项 | 状态 | 依据 |
| --- | --- | --- | --- |
| 1 | 网站可启动 | ✅ 已验证 | `pnpm dev`（3000）与 `pnpm build && pnpm start` 均返回 200；`/api/health` = `{"status":"ok","database":true,"cache":"redis|memory"}`（Redis 未连接自动降级为进程内缓存） |
| 2 | 数据库可连接 | ✅ 已验证 | PostgreSQL 17，6 个迁移，48 个 model；备份导出 48 表 / 4369 行（2026-11-10 演练） |
| 3 | 注册登录 | ✅ 已验证 | 冒烟、E2E、安全审计均覆盖；会话/锁定/限流有效 |
| 4 | 创建家族 | ✅ 已验证 | `/families` 与前端创建表单，默认 PRIVATE |
| 5 | 人物管理 | ✅ 已验证 | CRUD、回收站恢复、敏感字段加密、在世人员隐私降级 |
| 6 | 关系管理 | ✅ 已验证 | 类型/方向/核实状态、8 类冲突检测 |
| 7 | 图谱 | ✅ 已验证 | 四种视图 + 力导向网络图，局部加载上限 200 |
| 8 | 祖先 / 后代 | ✅ 已验证 | 图谱侧栏与 BFS 追溯，冒烟断言 2 代祖先 |
| 9 | 亲属关系 | ✅ 已验证 | 称谓引擎 18 项单测；信息不足返回「无法确定」 |
| 10 | 分支 | ✅ 已验证 | 分支创建、折叠、成员挂接 |
| 11 | 姓氏资料 | ✅ 已验证 | 《百家姓》通行本全表 504 姓（444 单姓 + 60 复姓，序位 1..504）；其中 38 姓含详细起源、异体字、郡望堂号与来源引用，其余 466 姓为字典型条目（字形/读音/繁体/序位，源流待补录）；拼音 A–Z 首字母检索、繁体检索、资料范围筛选（`detail`）、资料说明与「源流待补录」徽章、审核状态 |
| 12 | 迁徙记录 | ✅ 已验证 | 宏观迁徙 + 古今地名 + 本地合规 GeoJSON 地图 |
| 13 | 档案 | ✅ 已验证 | 上传校验、非公开存储、鉴权下载、版本、人物关联、OCR 依赖标注 |
| 14 | 导入导出 | ✅ 已验证 | 7 种导出真实字节；导入预览不落库、确认后事务写入 |
| 15 | 协作 | ✅ 已验证 | 邀请链接、角色权限、邮箱裁剪 |
| 16 | 隐私权限 | ✅ 已验证 | 家族级 + 人物级、私有默认、加密字段、匿名与管理员边界 |
| 17 | 后台 | ✅ 已验证 | 8 组接口 + 界面，73 项冒烟含权限边界与系统更新段落 |
| 18 | 移动端 / 桌面端 | ✅ 已验证 | Playwright 桌面 8 项 + 移动端 3 项，主要页面横向溢出 0 |
| 19 | 正式部署能力 | ⚠️ 部分验证 | 生产构建与 `next start` 已验证；Dockerfile / Compose / Nginx 配置已交付但**本机未执行镜像构建**（环境策略阻断 Docker 引擎） |

## 2. 交付物清单

| 交付物 | 路径 |
| --- | --- |
| 完整源码 | `src/`（`src/app/` 20 个页面、68 个 API 路由、`src/components/`、`src/lib/`） |
| 数据库结构与 ER 模型 | `prisma/schema.prisma`（48 个 model，含枚举、外键、索引、唯一约束、软删除、时间戳） |
| 迁移文件 | `prisma/migrations/` 6 个 SQL 迁移（init / search_indexes / place_review / perf_indexes / add_update_jobs / member_surname_index）+ `migration_lock.toml` |
| seed 与史料定义 | `prisma/seed.ts`、`prisma/seed-data.ts`（史料来源、姓氏、地名、迁徙、演示数据，明确标注演示与可信程度） |
| API 文档 | `docs/API.md` |
| Docker 配置 | `Dockerfile`、`docker-compose.yml`、`.dockerignore`、`docker/postgres/init-extensions.sql` |
| Nginx / HTTPS 示例 | `nginx/nginx.conf`、`nginx/generate-dev-cert.sh` |
| 环境变量示例 | `.env.example`（含 `TRUST_PROXY=false`、备份、S3/OCR 占位、Compose 变量） |
| 备份与恢复 | `scripts/backup.mjs`（`pnpm db:backup`，双通道，已做影子库恢复演练） |
| 测试代码与报告 | `src/tests/`、`e2e/`、`scripts/smoke*.mjs`、`scripts/security-audit.mjs`、`scripts/perf-check.mjs`、`reports/*.json`、`docs/TEST_REPORT.md` |
| 安全审计报告 | `docs/SECURITY_AUDIT.md`、`reports/security-audit.json` |
| 部署说明 | `docs/DEPLOYMENT.md` |
| 用户说明 | `docs/USER_GUIDE.md`、`/guide`、`/legal/privacy`、`/legal/terms` |
| 完成与未完成清单 | 本文 |
| 项目总览 | `README.md` |

## 3. 已完成的功能模块（12 个阶段）

1. 环境与工程骨架（Next.js 16 + React 19 + TS 6.0 + Tailwind v4 + Prisma 6）
2. PostgreSQL 17 + 48 张业务表、索引、软删除、版本快照、来源引用
3. 认证与 RBAC（scrypt、HttpOnly Cookie、token 摘要、角色权限）
4. 姓氏知识库 + 历史寻根（含合规地图）
4b. 族谱前端页面（列表、创建、详情工作区与全部管理面板）
5. 族谱核心 + 亲属称谓引擎 + 关系冲突检测
6. 族谱可视化四种视图 + 力导向网络图
7. 统一搜索（中文/拼音/异体/繁体、权限过滤）+ 祖籍迁徙地图
8. 档案中心 + 导入导出
9. 宗亲社区 + 用户中心（含账号注销与个人信息删除）
10. 管理后台
11. 安全审计 / 性能基线 / 全量测试
12. 部署配置与交付文档

## 4. 明确未完成 / 依赖外部条件（不伪造成功）

| 项目 | 当前状态 | 需要什么 |
| --- | --- | --- |
| Docker / Compose 镜像构建 | 配置已交付，**本机未验证**（`wsl.exe` 被环境策略阻断） | 目标服务器执行 `docker compose up -d --build` 并按 `DEPLOYMENT.md` 验收 |
| 生产 HTTPS 证书 / 域名 / HSTS 预加载 | 仅 Nginx 配置 + 自签证书生成脚本 | 受信任 CA 证书与自动续期 |
| S3 兼容对象存储 | 存储抽象层与上传校验已实现；未配置凭据时返回明确依赖错误 | Endpoint、Bucket、AccessKey、SecretKey |
| 外部 OCR | 人工录入待校对文本可用；自动识别返回 `OCR_NOT_CONFIGURED` | `OCR_API_URL` / `OCR_API_KEY` |
| PostGIS | 未启用；迁徙地图使用本地合规行政区划 GeoJSON，不依赖空间扩展 | 若需空间查询，改用 PostGIS 镜像并新增迁移 |
| Meilisearch / OpenSearch / zhparser 中文分词 | 未接入；当前为 `pg_trgm` + `unaccent` + 中文 2-gram + `pinyin-pro`，接口已预留 `searchProvider` 升级位 | 搜索服务部署与索引同步链路 |
| WebSocket 实时协作 / 后台任务队列 | **未实现**；当前为请求—响应 + SWR 轮询/按需加载，导入导出同步执行 | 独立实时服务与队列（大族谱导入/批量导出异步化） |
| 真实历史数据授权与批量史料录入 | 无授权来源；平台坚持「无来源不生成」，仅少量可核验基础资料 + 明确标注的演示数据 | 授权数据集、录入与双人审核流程 |
| WAF / DDoS / 生产 CDN / 独立第三方渗透测试 | 未接入 | 基础设施与专业安全服务 |
| CSP nonce/hash 加固 | 开发配置仍含 `script-src 'unsafe-inline' 'unsafe-eval'` 以兼容 Next.js/ECharts | 生产改用 nonce/hash 并复测图谱与导出 |
| 依赖组件 CVE 扫描、容器镜像基线扫描 | 未执行 | `npm audit` / SCA 与镜像扫描流水线 |
| Safari / Firefox / 真机移动端、系统性 a11y、国际化 | 未覆盖；E2E 仅 Chromium（含移动模拟） | 多浏览器与真机测试、无障碍审计、i18n |
| 在线更新的真实端到端演练 | 状态机、任务互斥、SIMULATE 全流程、UI 均已实测；**SOURCE 的「安装+构建+重启」与 DOCKER 的 sidecar 重建镜像未在本机跑过**（本机为 Windows 开发机，无 systemd，Docker 引擎被环境策略阻断） | 在目标服务器上执行一次真实升级（建议先预发环境）：`APP_UPDATE_DRIVER=SOURCE` 走 systemd 拉起，或 `APP_UPDATE_DRIVER=DOCKER` 走 sidecar，按 `DEPLOYMENT.md` 第 10、11 节验收 |

## 5. 已知限制（设计取舍，非缺陷）

- `TRUST_PROXY=false` 时所有请求归入同一限流桶，单实例开发/内网更严格，但公网多用户共享出口 IP 时可能互相影响；上线时须由可信代理覆盖 `X-Forwarded-For` 后再开启 `TRUST_PROXY=true`。
- `ENCRYPTION_KEY` 一旦投入生产不可更换，更换将导致已加密的人物敏感字段无法解密；密钥需离线备份，轮换方案需另行设计。
- 图谱单次节点上限 200 为服务端硬限制，超大家族需通过焦点人物逐层展开。
- 逻辑快照备份只含数据行，表结构由 `prisma migrate deploy` 提供；生产推荐官方 `pg_dump`/`pg_restore`。
- 管理员只能处理元数据与状态，无法查看私有族谱内容；这是刻意的隐私边界，不是权限缺失。
- 演示账号与演示数据仅用于开发/测试；正式部署前必须按 `DEPLOYMENT.md` 第 9 节清理。

## 6. 本轮续接修改的文件

`scripts/security-audit.mjs`（重写 Cookie 捕获、用例顺序、空值保护）、`scripts/perf-check.mjs`（预热与并发端点轮换）、`src/lib/search.ts` 与 `src/app/api/search/route.ts`（查询词规范化）、`src/tests/search-term.test.ts`（新增）、`src/app/api/health/route.ts`（新增）、`scripts/backup.mjs`（新增，真实备份/恢复）、`Dockerfile` / `.dockerignore` / `docker-compose.yml` / `nginx/` / `docker/postgres/`（新增部署配置）、`.env.example` / `.gitignore`（补充变量与忽略规则）、`README.md` 与 `docs/` 全部交付文档。

## 7. 2026-11-09 升级轮（核心升级包）

全量代码审计（后端安全 / 前端体验 / 测试与工程质量）后执行的升级，全部经 `pnpm lint`、`pnpm typecheck`、`pnpm test`（85 项）、5 套冒烟（305 项）、安全审计（42/42）、性能基线（0 异常）、Playwright E2E（11 项）与 `pnpm build` 复验。

**高危安全修复（5 项）**

1. 审计日志脱敏：`sanitizeAuditValue` 在写入与后台读取两侧过滤密码/令牌/生平/私密帖正文/OCR 正文并截断超长字符串，修复「后台审计日志旁路返回私有族谱明细」。
2. 限流补全：`/api/search/suggest` 并入搜索限流键；发帖、私信、评论、举报、上传、协作者邀请、宗亲申请共 7 个写接口新增 `assertRateLimit`（按 `user:${id}` 计数，避免共享出口 IP 互扰）。
3. 密码验证防爆破：改密与账号注销接口复用 `pw.verify:${userId}` 限流（10 次 / 15 分钟）。
4. 人物隐私统一：`publicPersonView` 改走 `canViewPersonDetails`（原为死代码），公开族谱中「已故 + PRIVATE」人物不再向非协作者展示生平与日期。
5. Prisma 约束错误不再把 `error.meta`（字段/约束名）返回客户端，仅写服务端日志。

**性能**

- 新增迁移 `perf_indexes`：`posts(status,created_at)`、`posts(author_id)`、`comments(author_id)`、`reports(reporter_id,target_type,target_id)`、`friendships(addressee_id,status)`。
- 导入预检由 O(导入人数×现有人物) 改为姓名 Map 索引；评论列表加 `take:1000`；个人导出各集合加上限；`cacheInvalidate` 由阻塞式 `KEYS` 改为 `SCAN`；进程内限流计数器过期清理。

**测试与工程**

- 新增 4 个单测文件（permissions / crypto / validation / audit-sanitize，共 35 项），单测覆盖模块 4/20 → 8/20。
- 新增 `.github/workflows/ci.yml`：push/PR 自动跑 lint + typecheck + 单测，并在 PostgreSQL 17 服务容器上构建与跑核心冒烟。
- `package.json` 补 `packageManager`（pnpm 11.20.0）与 `engines.node >= 22`。

**前端**

- 新增根级 `loading.tsx` / `error.tsx` / `not-found.tsx` / `sitemap.ts` / `robots.ts`，layout 补 `metadataBase`。
- 新增公共 `ErrorState` 组件，修复 5 处请求失败后永久转圈或被误显示为「暂无数据」（admin 总览/用户/审计、社区、姓氏、搜索、图谱）。

**已知遗留**（沿用第 4 节口径，本轮未处理）：Docker 镜像本机构建、CSP nonce、E2E 跑在 dev server、a11y/SEO 深化、`scryptSync` 异步化、血缘环检测增量算法、WebSocket/队列等外部依赖项。

## 8. 2026-11-10 发布轮（v0.2.0）

全部经 `pnpm lint`、`pnpm typecheck`、`pnpm test`（20 文件 / 225 通过 + 2 跳过）、5 套冒烟（323 项）、安全审计（42/42）、Playwright E2E（11 项）、`pnpm build`（92 条路由）与备份恢复演练（48 表 / 4369 行）复验；以 `v0.2.0` tag 发布，CI 自动创建 GitHub Release。

- **在线更新**：自托管实例后台检查上游版本、查看更新日志、一键升级（SOURCE/DOCKER/SIMULATE 三驱动、强制备份、发布包流式安全校验、任务落库互斥与自愈）；更新提醒（后台角标 + 登录后提示条）。
- **发布工具链**：`pnpm release` + CI tag 自动发布 + 构建版本注入（`APP_VERSION` / `APP_BUILD_SHA`）。
- **家族统计仪表盘**：人数与在世比例、性别、世代分布、生卒年代分布、分支人数、字辈用字频率、资料核实状态等多维度聚合，遵循在世人物隐私边界（修复了统计接口可反推在世者生辰的隐私回归）。
- **疑似重复人物核对**：三档置信度、规模上限防组合爆炸；只提示、绝不自动合并。
- **人物搜索覆盖姓氏/字号/别名**（原只搜名），姓氏字段补 pg_trgm 索引。
- **构建产物修复**：排除 `UPLOAD_DIR` 相关 file trace，`.next` 329MB → 139MB，用户上传承档不再进入构建产物。
- **依赖安全**：GHSA-g3hv-75wg-m249（minimatch）按漏洞区间收口至 11.0.1，`pnpm-workspace.yaml` 记录了为何不能全局 override。
- **开源规范化**：新增 MIT `LICENSE`、README 全面重构为项目主页、新增 README_EN 与截图（`docs/images/readme/`）。
