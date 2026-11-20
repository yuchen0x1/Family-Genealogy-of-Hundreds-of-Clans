# Changelog

本文件记录各版本的功能、修复、维护和升级要求；面向使用者的操作说明见 [完整发布记录](docs/releases/release-notes.md)。版本号遵循 [Semantic Versioning](https://semver.org/)，日期沿用项目的北京时间（UTC+8）口径。v0.1.0 为未单独发布的初始功能基线。

`pnpm release patch|minor|major` 会读取 `Unreleased` 正文与自上个 tag 以来的 commit 摘要生成新版本段落，并重置 `Unreleased`。发布前应按实际版本差异整理条目、合并重复摘要，并补充适用的升级说明。推送 `v*` tag 后 CI 自动创建 GitHub Release。

各版本段落遵循统一的发布说明结构（📢 版本概述 / ✨ 新增功能 / 🔧 改进与优化 / 🐛 问题修复 / 🔒 安全与兼容性 / 📦 下载与安装 / 🔄 升级与数据迁移 / 🧪 验证结果 / ⚠️ 已知问题）；不适用的栏目直接省略，不写占位内容。

## [Unreleased]

记录尚未发布的功能、修复与维护性更新。

## [0.4.1] - 2026-11-20

### 📢 版本概述

安全与兼容性补丁，已于 2026-11-20 发布。桌面 / 主屏幕安装、离线重连和刷新选择继承自 v0.4.0；本版新增变化仅为以下修复和发布事实说明。

### 🐛 问题修复

- 服务端和浏览器首帧使用一致的导航语言，挂载后再读取已保存的语言偏好，修复保存英文偏好时的水合不一致。
- `/guide` 浏览器回归测试等待持久化语言生效后再定位英文导航，并检查水合相关错误。

### 🔒 安全与兼容性

- 将 Prisma 配置依赖引入的 Effect 固定到已修复的 `3.22.1`，消除 `GHSA-7589-6fvf-x4pw` 高危 ReDoS 告警，并同步冻结锁文件。

### 📦 下载与安装

[v0.4.1 已发布](https://github.com/yuchen0x1/Family-Genealogy-of-Hundreds-of-Clans/releases/tag/v0.4.1)，四项附件及 GitHub Release 证明已核验。发布来源提交为 `52292f88b107e48b2611023ac44ce77dcae3fd4b`，源码包 SHA-256 为 `de367f0f3225afd4604ad03158e02219f154f5e3d28659b040cd4d9e1d4d9568`。`v0.4.0` 仍为没有附件的不可变历史发布。

### 🔄 升级与数据迁移

- 相对 v0.4.0 无新增数据库迁移；升级前仍需备份数据库与上传档案。

## [0.4.0] - 2026-11-18

### 📢 版本概述

中华寻根可以作为 Web 应用安装到桌面或主屏幕。断网时显示重连指南；检测到站点发布新部署后，可在保存编辑内容后再选择刷新。源码中的发布流水线增加了依赖清单和构建来源证明步骤，但本次 Release 未上传附件。

### ✨ 新增功能

- **桌面 / 主屏幕安装（PWA）**：在支持安装的浏览器中可将站点添加到桌面或主屏幕，并以独立窗口打开；应用清单与图标由 `src/app/manifest.ts` 与 `public/pwa/` 提供。
- **离线重连指南**：网络中断时界面显示重连提示，指引恢复后继续使用；查阅和编辑族谱仍需连接服务器。
- **更新后的刷新选择**：检测到站点发布新部署后，可先完成正在编辑的内容，再确认刷新到新版本。

### 🔧 改进与优化

- 发布流水线增加 CycloneDX 依赖清单（`xungen-<版本>.cdx.json`）与构建来源证明（build provenance attestation）步骤；v0.4.0 的公开 Release 未提供这些附件。
- CI 显式执行 `pnpm exec prisma generate`，并检查生产构建、Linux x64 容器启动及浏览器流程；新增 `e2e/pwa.spec.ts` 覆盖 PWA 流程。

### 🔒 安全与兼容性

- Service Worker 与 PWA 安装仅在 HTTPS 或 localhost 环境下生效；查阅和编辑族谱需要连接服务器。

### 📦 下载与安装

截至 2026-11-20，公开的 `v0.4.0` Release 没有附件且已不可变，未提供 `xungen-0.4.0.tar.gz`、摘要、更新元数据或依赖清单，也没有可供验证的发布包来源证明。该标签保留用于追溯；请勿将 GitHub 自动生成的源码归档当作已验证的在线更新包。

### 🔄 升级与数据迁移

- 从 v0.3.2 更新无需新增数据库迁移。仍需备份数据库与上传档案。
- 开发环境的首次安装需执行 `pnpm exec prisma generate`。

### 🧪 验证结果

- 发布流水线在 lint / typecheck / 单元测试、生产构建与 HTTP 冒烟、Linux x64 容器启动及浏览器流程全部通过后才会发布；实际结果以发布页与 Actions 记录为准。

---

- **项目地址：** https://github.com/yuchen0x1/Family-Genealogy-of-Hundreds-of-Clans
- **问题反馈：** https://github.com/yuchen0x1/Family-Genealogy-of-Hundreds-of-Clans/issues
- **完整差异：** https://github.com/yuchen0x1/Family-Genealogy-of-Hundreds-of-Clans/compare/v0.3.2...v0.4.0

## [0.3.2] - 2026-11-17

### 📢 版本概述

v0.3.2 是站点壳层的多语言维护版本。本次为 Next.js 站点头部加入自动语言检测、中文/English 手动切换与本地持久化；族谱、姓氏等业务数据保持原文。

### ✨ 新增功能

- **界面语言选择**：站点头部新增语言控件，支持「自动 / Auto」「简体中文」「English」三种设置；自动模式按浏览器语言识别 zh/en，未识别时回退中文。
- **本地持久化**：语言选择写入浏览器本地存储键 `family-genealogy:locale`，下次访问继续生效。

### 🔧 改进与优化

- 主导航（首页、百家姓、历史寻根、族谱中心、宗亲社区）、全站搜索占位与无障碍标签、用户菜单（个人中心、我的族谱、管理后台、退出登录）、登录/注册入口和移动端菜单随语言即时更新。
- 语言解析在水合后同步 `<html lang>`，便于辅助技术识别当前界面语言。

### 🔒 安全与兼容性

- 语言值仅在 `auto`、`zh-CN`、`en-US` 白名单内生效；本地存储不可用时回退为自动模式。
- 本次仅调整站点头部与壳层语言目录，未修改族谱读写、导入导出或权限模型；族谱与姓氏数据保持原文。

### 📦 下载与安装

| 文件名 | 平台 / 架构 | 大小 | 说明 |
|---|---|---|---|
| `xungen-0.3.2.tar.gz` | 自托管 / 源码包 | 9,046,986 字节 | 发布源码包 |
| `xungen-0.3.2.tar.gz.sha256` | 自托管 / 源码包 | 86 字节 | SHA-256 摘要，部署前核对 |
| `xungen-0.3.2.update.json` | 自托管 / 源码包 | 339 字节 | 在线更新元数据 |

### 🔄 升级与数据迁移

- 相对 v0.3.1 的差异仅包含站点头部、界面语言模块和版本号文件，未新增数据库迁移。
- 已有语言偏好保存在浏览器本地存储；升级或重新部署后如浏览器存储可用，选择会继续生效。

---

- **项目地址：** https://github.com/yuchen0x1/Family-Genealogy-of-Hundreds-of-Clans
- **问题反馈：** https://github.com/yuchen0x1/Family-Genealogy-of-Hundreds-of-Clans/issues
- **版本下载：** https://github.com/yuchen0x1/Family-Genealogy-of-Hundreds-of-Clans/releases/tag/v0.3.2
- **完整差异：** https://github.com/yuchen0x1/Family-Genealogy-of-Hundreds-of-Clans/compare/v0.3.1...v0.3.2

## [0.3.1] - 2026-11-16

### 📢 版本概述

本版聚焦在世人物隐私、生产安全基线、可观测运行状态和发布前质量校准，并补充项目演进审计与升级路线图。

### 🐛 问题修复

- **在世人物隐私**：人物更新时按最终在世状态重新归一化可见性，不能通过部分 PATCH 把在世人物改成公开；全站人物检索补齐姓氏匹配。
- **端到端测试基址**：Playwright 默认基址跟随 `NEXT_PUBLIC_SITE_URL`，修复 localhost/127.0.0.1 origin 不一致导致的 E2E 登录失败。

### 🔧 改进与优化

- Redis 不可用时支持跨进程清理开发限流计数；性能报告改为记录真实缓存模式。
- 健康检查增加文件存储状态。
- 新增 `PROJECT_AUDIT.md`、`COMPETITOR_ANALYSIS.md`、`UPGRADE_ROADMAP.md`、`UPGRADE_REPORT.md`，记录 18 个开源项目研究和 EV-001～EV-051 路线图。

### 🔒 安全与兼容性

- 统一 API 入口拒绝非法 UUID 路径参数。
- 生产缺少 `SESSION_SECRET` 时快速失败；读取到过期会话后自动标记撤销。
- 生产 CSP 移除 `unsafe-eval`，并加入 `object-src 'none'`。
- 固定上传目录并在构建追踪中排除运行期产物目录，避免用户上传档案进入发布产物。

### 🔄 升级与数据迁移

- 无新增数据库迁移；升级前建议备份数据库与 `.storage/uploads`。
- `SESSION_SECRET` 必须在生产环境显式配置；没有配置时相关认证/脱敏操作会拒绝继续。

### 📦 下载与安装

| 文件名 | 平台 / 架构 | 大小 | 说明 |
|---|---|---|---|
| `xungen-0.3.1.tar.gz` | 自托管 / 源码包 | 9,045,221 字节 | 发布源码包 |
| `xungen-0.3.1.tar.gz.sha256` | 自托管 / 源码包 | 86 字节 | SHA-256 摘要，部署前核对 |
| `xungen-0.3.1.update.json` | 自托管 / 源码包 | 339 字节 | 在线更新元数据 |

### 🧪 验证结果

- Vitest：243 passed / 21 skipped；HTTP 冒烟 323/323；Playwright 11 passed / 1 skipped；安全审计 42/42；lint、typecheck、build 通过。
- 未验证场景：真实 SOURCE/DOCKER 跨版本更新、S3、外部 OCR、Redis HA、离线同步、生产签名更新、第三方渗透测试；这些边界见 `UPGRADE_REPORT.md`。

### ⚠️ 已知问题

- 生产 CSP 仍保留已知的 `unsafe-inline` 遗留项，nonce/hash 迁移列入 EV-031。

---

- **项目地址：** https://github.com/yuchen0x1/Family-Genealogy-of-Hundreds-of-Clans
- **问题反馈：** https://github.com/yuchen0x1/Family-Genealogy-of-Hundreds-of-Clans/issues
- **版本下载：** https://github.com/yuchen0x1/Family-Genealogy-of-Hundreds-of-Clans/releases/tag/v0.3.1
- **完整差异：** https://github.com/yuchen0x1/Family-Genealogy-of-Hundreds-of-Clans/compare/v0.3.0...v0.3.1

## [0.3.0] - 2026-11-13

### 📢 版本概述

本版重点帮助修谱者发现资料问题，并减少导入、导出时对亲属关系的误读。

### ✨ 新增功能

- **资料体检**：家族协作者可在族谱工作区的「资料体检」页签集中检查 11 类问题：生卒年倒置、在世状态与去世资料矛盾、未来年份、关系引用缺失人物、自身关系、重复关系、未核实关系、父母与子女生年顺序异常、已确认世代不相邻、生物学父母超过两位，以及生物学亲子循环。
- **逐项核查**：提示区分错误、警告和信息，支持按严重程度、姓名筛选，分页查看、重新检查，并定位对应人物或关系。检查只提供线索，不自动改写资料、合并人物或认定血缘。

### 🐛 问题修复

- **导入可靠性**：同一导入任务并发提交时在数据库事务内通过条件更新取得执行权，避免重复写入；文件内人物标识重复时阻止导入，避免关系引用错人。
- **JSON 关系类型**：导入保留监护、过继等关系类型，未知关系不再被默认转换为生物学亲子。
- **GEDCOM 导出**：不再根据配偶关系推断子女父母；保留收养关系及已故但卒年未知状态，修正不同子女之间收养标记串用的问题。
- **GEDCOM 姓名与日期**：修正标准姓名顺序、日期中的日被误作年份的问题。
- **图谱范围**：零层查看参数现在可正确生效，便于只查看所选人物。

### 🔒 安全与兼容性

- 公开图谱按查看权限裁剪生卒年，无权查看的年份不再出现在图谱数据中；「重复核对」与导入报告仅家族协作者可读。
- 外部 GEDCOM 的 `PEDI birth` 不作为生物学血缘证明；缺少明确子类型的关系保留为未知，需依据史料核实。

### 📦 下载与安装

| 文件名 | 平台 / 架构 | 大小 | 说明 |
|---|---|---|---|
| `xungen-0.3.0.tar.gz` | 自托管 / 源码包 | 9,292,078 字节 | 发布源码包 |
| `xungen-0.3.0.tar.gz.sha256` | 自托管 / 源码包 | 86 字节 | SHA-256 摘要，部署前核对 |
| `xungen-0.3.0.update.json` | 自托管 / 源码包 | 339 字节 | 在线更新元数据 |

### 🔄 升级与数据迁移

- 从 v0.2.2 升级无需新增数据库迁移。权限收紧后，非协作者需先接受家族协作邀请，才能使用重复核对或查看导入报告。
- 本次修复只影响后续交换与导入，不会自动纠正此前已导入的资料。

### ⚠️ 已知问题

- GEDCOM 无法完整表达本项目的全部关系信息，仅用于资料交换；版本快照用于族谱恢复，完整实例备份需同时包含数据库及上传档案。

---

- **项目地址：** https://github.com/yuchen0x1/Family-Genealogy-of-Hundreds-of-Clans
- **问题反馈：** https://github.com/yuchen0x1/Family-Genealogy-of-Hundreds-of-Clans/issues
- **版本下载：** https://github.com/yuchen0x1/Family-Genealogy-of-Hundreds-of-Clans/releases/tag/v0.3.0
- **完整差异：** https://github.com/yuchen0x1/Family-Genealogy-of-Hundreds-of-Clans/compare/v0.2.2...v0.3.0

## [0.2.2] - 2026-11-13

### 📢 版本概述

本版加强自托管实例的更新包校验，并让管理员在安装前看清发布内容。

### ✨ 新增功能

- **发布包完整性校验**：稳定版更新使用项目专用 Release 发布包，安装前核对文件大小和 SHA-256；缺少受支持的发布包、缺少摘要或校验失败时拒绝安装。
- **可选数字签名验证**：支持配置 `APP_UPDATE_SIGNING_PUBLIC_KEY` 验证 detached 签名；启用 `APP_UPDATE_REQUIRE_SIGNATURE` 后，公钥或签名缺失、验证失败均拒绝安装。
- **更完整的更新详情**：管理后台显示发布资产、大小、SHA-256、更新性质和最低支持版本。
- **标准发布附件**：CI 自动附加 `xungen-<版本>.tar.gz`、`.sha256` 与 `.update.json`；配置发布签名密钥后才生成 `.sig`。

### 🐛 问题修复

- Release 缺少受支持资产时不再回退安装未经摘要校验的源码包；发布资产下载地址限制为配置仓库下的 GitHub HTTPS 地址。
- 同源写请求校验完整 Origin，区分协议、主机与端口，并将无效 Origin 作为拒绝请求处理。

### 🔧 改进与优化

- 新增「跳到主要内容」键盘入口和主导航辅助标签，键盘和辅助技术用户可更快进入页面内容。
- 补充在线更新部署说明，统一主分支维护约定。

### 📦 下载与安装

| 文件名 | 平台 / 架构 | 大小 | 说明 |
|---|---|---|---|
| `xungen-0.2.2.tar.gz` | 自托管 / 源码包 | 9,266,154 字节 | 发布源码包 |
| `xungen-0.2.2.tar.gz.sha256` | 自托管 / 源码包 | 86 字节 | SHA-256 摘要，部署前核对 |
| `xungen-0.2.2.update.json` | 自托管 / 源码包 | 339 字节 | 在线更新元数据 |

### 🔄 升级与数据迁移

- 从 v0.2.1 升级无需新增数据库迁移；已有 SOURCE / DOCKER 部署继续使用相应驱动。

### ⚠️ 已知问题

- 配置公钥也会要求发布包提供签名。v0.2.2 发布附件未包含 `.sig`（整理本段时复核仍如此），强制验签的实例会拒绝该未签名发布包；SHA-256 用于完整性校验，不等同于签名认证。
- 稳定版 Release 具备发布包完整性校验；开发用分支通道不具有同等保证。

---

- **项目地址：** https://github.com/yuchen0x1/Family-Genealogy-of-Hundreds-of-Clans
- **问题反馈：** https://github.com/yuchen0x1/Family-Genealogy-of-Hundreds-of-Clans/issues
- **版本下载：** https://github.com/yuchen0x1/Family-Genealogy-of-Hundreds-of-Clans/releases/tag/v0.2.2
- **完整差异：** https://github.com/yuchen0x1/Family-Genealogy-of-Hundreds-of-Clans/compare/v0.2.1...v0.2.2

## [0.2.1] - 2026-11-10

### 📢 版本概述

本版修复演示口令展示和测试数据残留问题，并提供历史测试数据清理工具，同时补全项目开源使用资料。

### 🐛 问题修复

- 登录页不再渲染演示账号密码，改为指向种子数据说明；README、英文说明、用户手册和 API 文档同步移除口令。
- 5 套冒烟脚本在结束时回收自己创建的族谱、帖子等测试记录；需要公开验证的族谱先恢复私有再软删除，避免公开列表残留测试内容。
- 将 minimatch 依赖约束收口到 11.0.1，处理该工具链依赖的已知问题。

### ✨ 新增功能

- **历史测试数据清理工具**：按约定名称前缀筛选，`node scripts/cleanup-test-data.mjs` 默认只预览，添加 `--apply` 后软删除；`pnpm test:cleanup` 快捷命令已带 `--apply`。

### 🔧 改进与优化

- 重构项目首页，新增 `README_EN.md`、19 张真实界面截图及截图生成脚本，补齐功能、快速启动、隐私与部署入口。
- 新增 MIT `LICENSE` 和包许可证字段、贡献指南与安全问题私密报告说明。
- 校准部署、API、用户说明和历史验收报告中的版本、路由与测试口径；清理不应入库的生成物、旧截图和包含本机路径的内部报告。历史验收数据不代表后续版本的验证结果。

### 📦 下载与安装

| 文件名 | 平台 / 架构 | 大小 | 说明 |
|---|---|---|---|
| `xungen-0.2.1.tar.gz` | 自托管 / 源码包 | 9,247,255 字节 | 发布源码包 |
| `xungen-0.2.1.tar.gz.sha256` | 自托管 / 源码包 | 86 字节 | SHA-256 摘要，部署前核对 |

### 🔄 升级与数据迁移

- 从 v0.2.0 升级无需新增数据库迁移。页面移除口令不会轮换已有演示账号密码，生产实例需自行处理演示账号。
- 历史测试数据不会随升级自动清除；先用清理工具检查候选列表，再决定是否添加 `--apply`。

---

- **项目地址：** https://github.com/yuchen0x1/Family-Genealogy-of-Hundreds-of-Clans
- **问题反馈：** https://github.com/yuchen0x1/Family-Genealogy-of-Hundreds-of-Clans/issues
- **版本下载：** https://github.com/yuchen0x1/Family-Genealogy-of-Hundreds-of-Clans/releases/tag/v0.2.1
- **完整差异：** https://github.com/yuchen0x1/Family-Genealogy-of-Hundreds-of-Clans/compare/v0.2.0...v0.2.1

## [0.2.0] - 2026-11-10

### 📢 版本概述

本版加入面向自托管实例的在线维护入口，并扩展修谱时的统计、查重和检索能力。

### ✨ 新增功能

- **在线更新（自托管实例从上游仓库升级）**：后台「系统设置 → 系统更新」可检查上游版本、查看更新日志、一键升级。前端只能发起，不能指定目标版本；上游仓库只来自环境变量，客户端不能提交任意下载地址。
  - 三种驱动：`SOURCE`（源码部署，独立进程安装构建后由 systemd/pm2 拉起）、`DOCKER`（容器部署，写重启标记由 updater sidecar 重建镜像）、`SIMULATE`（演示，不改文件，生产默认禁用）。
  - 更新前自动备份数据库与上传文件，备份失败即中止（`APP_UPDATE_SKIP_BACKUP=true` 可跳过）。
  - 发布包流式安全校验：路径穿越、绝对路径、链接/设备文件、tar 头校验和、解压体积与条目数上限、多顶层目录、结束标记；并比对包内 `package.json` 版本与目标版本。
  - 任务进度落库（`update_jobs`），数据库唯一索引保证同一时刻只有一个活跃任务；进程被重启打断的任务在读取状态时自愈收尾。
  - 新增 `POST /api/admin/system/update`、`POST /api/admin/system/update/check`、`GET /api/admin/system/update`、`GET /api/admin/system/update/jobs/[jobId]`，均仅管理员可访问并独立限流。
- **发布工具链**：`pnpm release patch|minor|major|x.y.z` 更新版本号、生成 CHANGELOG 段落、提交并打 annotated tag；支持 `--dry-run` / `--allow-dirty` / `--no-commit` / `--no-tag`。
- **CI 自动发布**：推送 `v*` tag 时，在 lint/typecheck/单测与构建冒烟全部通过后，从本文件提取对应版本段落创建 GitHub Release；缺少该版本条目时直接失败。
- **构建版本注入**：`next.config.ts` 把 `APP_VERSION` / `APP_BUILD_SHA` / `APP_BUILD_TIME` 注入构建产物，Docker 与 CI 通过 build arg / 环境变量传入，无 `.git` 的镜像环境也能显示准确版本与提交。
- **Docker 更新 sidecar**：新增 `updater` 服务，仅它挂载 `/var/run/docker.sock`；`app` 与 `nginx` 永不挂载该 socket。sidecar 只执行固定的 `docker compose build app` 与 `docker compose up -d --no-build app nginx`，不使用宿主机旧 checkout 作为构建上下文。
- **systemd 部署单元**：`deploy/systemd/xungen.service` 以 `Restart=always` 让更新器结束旧进程后自动拉起新版本，无需授予服务账号 `systemctl` 权限。
- **更新提醒**：管理员登录后进入个人中心或管理后台，若上游有新版本会直接看到提示条（含当前版本与目标版本）；后台侧边栏「系统设置」同时显示红点角标。提示按目标版本记忆关闭状态，新版本发布后会重新出现。更新提示只做提醒，是否可更新仍由服务端判定。
- **家族统计仪表盘**：家族详情新增统计视图，展示人数与在世比例、性别构成、世代人口分布、生卒年代分布、分支人数、字辈用字频率与资料核实状态；只返回聚合数字，不含姓名/联系方式/加密字段，图表用 CSS 条形实现以免引入图表库体积。
- **疑似重复人物核对**：家族工作区新增「重复核对」页签，按姓名分桶并辅以字号/别名索引列出疑似同一人的配对，分三档置信度并给出可读判定依据；只提示、绝不自动合并。同时修复标签页增多后被横向截断、以及页签无法深链的问题。
- **按姓氏检索人物**：人物搜索框的关键词同时匹配姓氏、名、字号与别名（旧接口只查名，输入「陈」搜不到任何人）；并为姓氏字段补 pg_trgm GIN 索引，避免超大家族按姓氏检索退化为全表扫描。

### 🐛 问题修复

- 修复更新任务在备份/下载阶段仍停留在 `QUEUED` 时被 2 分钟超时误判为「执行器未启动」而强制失败的问题；现在任务创建后立即进入 `RUNNING`。
- 修复 stale 判定阈值（10 分钟）短于安装/构建超时（各 20 分钟）导致正常构建被误杀的问题；改为 45 分钟并以最后写库时间计时。
- 修复 branch 通道目标版本是 12 位 SHA 前缀、而收尾逻辑只认 40 位完整 SHA，导致该通道的更新永远无法判定成功、最终超时失败的问题；改为前缀比对 `APP_BUILD_SHA`。
- 修复 Docker 更新在等待新容器确认时每次轮询（约 1.5 秒）都写库并追加日志的问题，并补上「sidecar 报成功但新容器长期不生效」的超时失败与锁释放。
- 修复更新面板在别的管理员发起新任务后仍停留在旧任务上的问题。
- 修复 `scripts/release.mjs` 中 `Unreleased` 检测正则被双重转义、永远不命中，导致每次发布都重复插入 `## [Unreleased]`、手工整理条目永不进入发布段的问题。
- 修复统计接口的隐私回归：公开族谱中在世人物的出生年曾被聚合成年代/年龄分布，可能暴露不应公开的年代信息；现在非协作者只统计已故与主动公开的在世人物，界面改为说明文案而非空图表。
- 修复服务端构建产物泄漏用户上传档案的问题：`UPLOAD_DIR` 无法静态求值，Turbopack 把整个项目目录记进每个 API 路由的 file trace，导致 `.storage/uploads` 下的真实档案随 `.next` 被复制、备份或打进镜像；通过排除运行期产物目录，防止上传档案被该构建追踪路径带入发布产物。

### 🔧 改进与优化

- 基础依赖升级至 Next.js 16.4.5、TypeScript 6.0.3、Zod 4.6.7、ECharts 6.1.0 和 Vitest 5.1.0，并适配 Zod 4 与 TypeScript 6 的接口/类型变化；调整 PostCSS、deepmerge-ts 依赖约束。
- 疑似重复人物检测增加规模上限并按需跳过字号/别名字段的组合比对，避免大家族在该维度上出现配对组合爆炸导致接口长时间占用。
- `.env.example` 补齐更新相关配置项（驱动、通道、分支、令牌、跳过备份、模拟开关、重启命令）并注明默认推断规则。
- `README.md` 增加在线更新章节与新的目录结构说明；`docs/API.md` 增加系统更新接口表与接口约束。
- `docs/COMPLETION.md`、`docs/TEST_REPORT.md` 更新单元测试口径与在线更新的验证边界；管理后台冒烟新增系统更新段落，覆盖匿名/普通用户拦截、状态字段、确认字面量、强制检查与错误码。

### 📦 下载与安装

- 本版本未附加发布资产，请从 `v0.2.0` 标签检出源码并按部署指南安装；自 v0.2.2 起发布开始附带标准发布包与校验文件。

### 🔄 升级与数据迁移

- 从 v0.1.0 基线升级时，执行 `pnpm db:migrate` 应用新增的更新任务表与人物姓氏搜索索引，再重新构建。升级前备份数据库及上传档案。
- SOURCE 驱动依赖进程守护和重启配置；DOCKER 驱动依赖 updater 服务；SIMULATE 仅作演示。

### 🧪 验证结果

- 本版本在 CI 的 lint/typecheck/单元测试与构建冒烟通过后自动发布。
- 未验证场景：发布时尚无真实 SOURCE / DOCKER 跨版本升级全流程验收记录，需在部署环境确认备份、重启和新版本健康状态。

---

- **项目地址：** https://github.com/yuchen0x1/Family-Genealogy-of-Hundreds-of-Clans
- **问题反馈：** https://github.com/yuchen0x1/Family-Genealogy-of-Hundreds-of-Clans/issues
- **版本下载：** https://github.com/yuchen0x1/Family-Genealogy-of-Hundreds-of-Clans/releases/tag/v0.2.0
- **完整差异：** https://github.com/yuchen0x1/Family-Genealogy-of-Hundreds-of-Clans/compare/355b7b9...v0.2.0

## [0.1.0]

### 📢 版本概述

初始功能基线，对应首次提交的包版本；未单独创建 Git 标签或 GitHub Release，不补记未经确认的发布日期。

### ✨ 初始功能

- 《百家姓》504 姓字典与有来源的姓氏史料、历史人物、迁徙线索；资料附可信程度与审核状态，未补齐源流的条目明确标记。
- 族谱、人物、亲属关系、字辈、世代和分支管理；关系冲突检测、祖先/后代追溯与亲属称谓计算。
- 纵向/横向世代树、分支折叠、时间轴图谱，支持缩放、搜索定位与关系路径查看。
- GEDCOM、CSV、JSON 导入预览与确认写入；JSON、CSV、GEDCOM 5.5.1 / 7.0、SVG、PNG、PDF 导出。图片和 PDF 仅用于展示，不属于可回导的完整备份。
- 版本快照、恢复、删除回收与协作邀请；所有者、编辑者和查看者权限及私有族谱边界。
- 档案中心、宗亲社区、寻亲与纠错、私信和通知、管理后台与审计日志。
- 数据库与上传档案备份恢复、Docker/Nginx 部署配置及自动化验证脚本。

### ⚠️ 使用边界

- 同姓、同名与历史人物匹配不会自动建立真实家族关系；导入的关系需人工核实。
- 版本快照与交换文件不包含全部敏感字段；完整实例备份需同时保存数据库与上传档案。

[初始源码记录](https://github.com/yuchen0x1/Family-Genealogy-of-Hundreds-of-Clans/commit/355b7b9)
