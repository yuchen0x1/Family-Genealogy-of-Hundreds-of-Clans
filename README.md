# 中华寻根 · 百家族谱

中华姓氏文化查询、历史寻根、家族族谱创建、智能关系图谱、字辈世代、祖籍迁徙、宗亲交流与档案文献一体化平台。全栈真实实现：Next.js App Router + PostgreSQL + Prisma + Redis，所有业务数据落库，无前端假数据。

## 三条不可逾越的数据边界

1. **历史姓氏资料 ≠ 用户真实家族关系**。史料库、历史人物、宏观迁徙独立建模，与用户族谱物理分表。
2. **历史人物 ≠ 用户家族成员**。同姓名不会触发任何自动合并或关系推导。
3. **同姓 ≠ 同宗**。宗亲关联需双方显式确认，确认后也**不**创建 `FamilyRelationship`，不参与亲属称谓计算。

每条史料带资料名称、作者、版本、出版信息、卷次/页码、原文引用、数字资源地址、录入人、审核状态与可信程度；无真实来源宁可不生成。演示数据均明确标注，可信程度分为 `DOCUMENTED / TRADITION / INFERRED / UNVERIFIED`。

## 姓氏资料口径

知识库收录《百家姓》通行本全表 **504 姓**（444 单姓 + 60 复姓，序位 1..504，非现代人口排名）。为落实「无真实来源宁可不生成」，条目分两类：

| 类型 | 数量 | 收录内容 | 可信程度 / 审核状态 |
| --- | ---: | --- | --- |
| 史料条目 | 38 | 得姓源流、异体字、郡望堂号、历史人物、迁徙线索与来源引用 | `DOCUMENTED` 36 / `INFERRED` 2；`APPROVED` |
| 字典型条目 | 466 | 字形、繁体写法、姓氏专用读音、《百家姓》序位、单/复姓类别 | `UNVERIFIED`；`PENDING` |

字典型条目**不编造源流**、不创建史料关联，列表卡片标注「源流待补录」；列表页提供「资料范围」筛选（`detail=documented` / `detail=dictionary`）与资料说明。后续补录须依据可核验文献并按审核流程录入，详见 `docs/API.md`、`docs/USER_GUIDE.md` 与 `docs/COMPLETION.md`。

## 技术栈

| 层 | 选型 |
| --- | --- |
| 前端 | Next.js 15.5 App Router、React 19、TypeScript 5.9、Tailwind CSS v4、SWR、ECharts、SVG 无限画布 |
| 服务端 | Next.js Route Handlers、Zod 校验、scrypt 密码哈希、AES-256-GCM 字段加密 |
| 数据库 | PostgreSQL 17、Prisma 6、`pg_trgm` 模糊/子串检索 + 中文 2-gram 与拼音检索键（独立全文搜索服务未接入）、47 张业务表 |
| 缓存 | Redis（未连接自动降级为进程内缓存）；用于缓存与 API 限流 |
| 存储 | 本地非公开目录 `.storage/uploads`（默认）/ S3 兼容对象存储（需配置） |
| 部署 | Dockerfile、docker-compose.yml、Nginx TLS 终止、备份脚本、健康检查 `/api/health` |
| 测试 | Vitest、5 套 HTTP 冒烟脚本、Playwright E2E、安全审计与性能基线脚本 |

## 本机快速启动（无需 Docker）

```bash
cp .env.example .env
# 生产必须替换 SESSION_SECRET、ENCRYPTION_KEY；本机开发可直接用模板值
pnpm install
pnpm db:pg          # 启动项目内置的 PostgreSQL 17 官方二进制（数据目录 ~/.xungen-pg）
pnpm db:migrate     # prisma migrate deploy，共 4 个迁移
pnpm db:seed        # 幂等写入角色、史料、姓氏、地名、迁徙、演示族谱与账号
pnpm dev            # http://localhost:3000
```

Redis 为可选依赖：本机若已启动 `redis-server` 会自动连接，否则降级为进程内缓存/限流。Windows 沙箱环境无法启动 Docker 时，`pnpm db:pg` 提供等价的本地数据库；正式部署仍使用 `docker-compose.yml`。

演示账号（仅用于开发/测试，生产部署后必须删除或改密）：

- 普通用户：`demo@xungen.local` / `Demo_Xungen_2026`
- 管理员：`admin@xungen.local` / `ChangeMe_Admin_2026`

## 验证命令

```bash
pnpm typecheck                 # TypeScript 严格模式
pnpm lint                      # ESLint
pnpm test                      # Vitest 单元测试
pnpm test:smoke                # 核心后端 HTTP 冒烟
pnpm test:smoke:ui             # 族谱前端依赖接口 + 页面可达性
pnpm test:smoke:archive        # 档案中心 + 导入导出
pnpm test:smoke:community      # 社区 + 用户中心
pnpm test:smoke:admin          # 管理后台 + 管理员隐私边界
pnpm test:e2e                  # Playwright 桌面 + 移动端
pnpm test:reset-limits         # 清理开发期限流计数（连续跑测试之间执行）
pnpm test:security             # 真实 HTTP 安全审计 → reports/security-audit.json
pnpm test:perf                 # 性能基线 → reports/perf-report.json
pnpm db:backup                 # 数据库 + 上传档案文件 sidecar 备份与校验
pnpm test:backup               # 文件灾备 sidecar 单元测试
pnpm build && pnpm start       # 生产构建与启动
```

冒烟/审计类脚本要求站点已在 `http://localhost:3000` 运行；可用 `SMOKE_BASE_URL` 指向其他环境。

push / PR 时 GitHub Actions（`.github/workflows/ci.yml`）自动执行 lint、typecheck、单元测试，并在 PostgreSQL 17 服务容器上完成生产构建与核心冒烟；本地提交前建议至少跑 `pnpm typecheck && pnpm lint && pnpm test`。

## 目录结构

```
prisma/                 schema.prisma（47 models）、4 个迁移、seed 史料与演示数据
src/app/api/            63 个 Route Handlers
src/app/                20 个页面（App Router）
src/components/         图谱、档案、社区、后台、族谱工作区等组件
src/lib/                认证、权限、加密、缓存、搜索、亲属称谓、图谱布局、导入导出、存储
src/tests/              Vitest 单元测试
e2e/                    Playwright 桌面 / 移动端用例
scripts/                本地 PG、备份、冒烟、安全审计、性能检查、限流重置
.github/workflows/      GitHub Actions CI（lint/typecheck/单测 + 构建与冒烟）
public/geo/             合规本地行政区划 GeoJSON（含台湾省、香港/澳门特别行政区）
reports/                机器生成的测试 / 安全 / 性能报告
docs/                   API、部署、测试报告、安全审计、用户说明、完成清单
nginx/ docker/          Nginx 配置、自签证书生成脚本、数据库初始化 SQL
```

## 文档索引

- `docs/API.md` — 全部 API、权限与错误码
- `docs/DEPLOYMENT.md` — 部署、HTTPS、备份恢复、升级与排障
- `docs/TEST_REPORT.md` — 测试结果与实测数字
- `docs/SECURITY_AUDIT.md` — 安全设计、审计结果与遗留依赖
- `docs/USER_GUIDE.md` — 用户操作说明
- `docs/COMPLETION.md` — 已完成 / 未完成清单与外部依赖状态

## 外部依赖状态（不伪造成功）

PostGIS、Meilisearch/OpenSearch、S3 兼容对象存储、外部 OCR、真实历史数据授权、WebSocket 实时协作、生产 HTTPS 证书、WAF 与独立渗透测试、生产 CDN 均**未接入/未提供凭证或授权**，代码中已预留接口并明确返回依赖错误，详见 `docs/COMPLETION.md`。本机 Docker 引擎因环境策略不可用，Docker 镜像构建未在本机执行过验证；已通过 `pnpm build && pnpm start` 验证同一套生产启动路径。
