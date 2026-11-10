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
prisma/                 schema.prisma（48 models）、5 个迁移、seed 史料与演示数据
src/app/api/            66 个 Route Handlers
src/app/                20 个页面（App Router）
src/components/         图谱、档案、社区、后台、族谱工作区等组件
src/lib/                认证、权限、加密、缓存、搜索、亲属称谓、图谱布局、导入导出、存储、更新器
src/lib/updater/        在线更新：版本检测、发布包校验、任务生命周期、驱动（SOURCE/DOCKER/SIMULATE）
src/tests/              Vitest 单元测试
e2e/                    Playwright 桌面 / 移动端用例
scripts/                本地 PG、备份、冒烟、安全审计、性能检查、限流重置、发布与更新安装脚本
docker/                 updater sidecar（唯一持有 docker.sock 的组件）
deploy/systemd/         SOURCE 驱动部署用的 systemd unit
.github/workflows/      GitHub Actions CI（lint/typecheck/单测 + 构建与冒烟 + tag 自动发布）
public/geo/             合规本地行政区划 GeoJSON（含台湾省、香港/澳门特别行政区）
reports/                机器生成的测试 / 安全 / 性能报告
docs/                   API、部署、测试报告、安全审计、用户说明、完成清单
nginx/ docker/          Nginx 配置、自签证书生成脚本、数据库初始化 SQL
```

## 在线更新（自托管运维）

后台「系统设置 → 系统更新」可以从上游仓库检查并安装新版本，全程落库、可审计、可中断恢复。

- **目标版本由服务端决定**：前端只能点「立即更新」，不能指定版本；上游地址只来自环境变量（排除 SSRF）。
- **三种驱动**：`SOURCE`（源码部署，安装构建后由 systemd/pm2 拉起）、`DOCKER`（容器部署，写重启标记由 sidecar 重建镜像）、`SIMULATE`（演示，不修改文件，生产默认禁用）。
- **强制备份**：更新前自动备份数据库与上传文件，备份失败即中止。
- **发布包校验**：流式检查 tar.gz 的路径穿越、链接/设备文件、校验和、体积与条目上限，并比对包内 `package.json` 版本与目标版本。
- **任务互斥与自愈**：数据库唯一索引保证同一时刻只有一个活跃任务；进程被重启打断的任务在下次读取状态时自动收尾。
- **发布流程**：`pnpm release patch|minor|major` 更新版本号与 CHANGELOG 并打 tag；推送 tag 后 CI 自动创建 GitHub Release（正文取 CHANGELOG 对应段落）。

配置项见 `.env.example`，Docker sidecar 与 systemd 两种部署形态的完整步骤见 `docs/DEPLOYMENT.md` 第 10、11 节。

## 文档索引

- `docs/API.md` — 全部 API、权限与错误码
- `docs/DEPLOYMENT.md` — 部署、HTTPS、备份恢复、升级、在线更新驱动与排障
- `docs/TEST_REPORT.md` — 测试结果与实测数字
- `docs/SECURITY_AUDIT.md` — 安全设计、审计结果与遗留依赖
- `docs/USER_GUIDE.md` — 用户操作说明
- `docs/COMPLETION.md` — 已完成 / 未完成清单与外部依赖状态
- `CHANGELOG.md` — 版本变更记录

## 外部依赖状态（不伪造成功）

PostGIS、Meilisearch/OpenSearch、S3 兼容对象存储、外部 OCR、真实历史数据授权、WebSocket 实时协作、生产 HTTPS 证书、WAF 与独立渗透测试、生产 CDN 均**未接入/未提供凭证或授权**，代码中已预留接口并明确返回依赖错误，详见 `docs/COMPLETION.md`。本机 Docker 引擎因环境策略不可用，Docker 镜像构建未在本机执行过验证；已通过 `pnpm build && pnpm start` 验证同一套生产启动路径。
