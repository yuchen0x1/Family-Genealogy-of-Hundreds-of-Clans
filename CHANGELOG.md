# Changelog

本文件记录每次发布的用户可见变更。版本号遵循 [Semantic Versioning](https://semver.org/)；发布前请先将 `Unreleased` 内容整理完整。

`pnpm release patch|minor|major` 会读取 `Unreleased` 正文与自上个 tag 以来的 commit 摘要生成新版本段落，并重置 `Unreleased`。推送 `v*` tag 后 CI 自动创建 GitHub Release。

## [Unreleased]

记录尚未发布的功能、修复与维护性更新。

## [0.3.0] - 2026-11-13

### 变更
- 新增协作者「资料体检」：11 类可解释规则、严重程度与姓名筛选、分页、手动刷新、定位人物与关系，不自动修改族谱。
- 修复公开图谱未裁剪私有生卒年；重复核对与导入报告改为仅家族协作者可读。
- 导入任务在数据库事务内以条件更新取得执行权，避免并发重复写入；重复人物标识阻止导入，JSON 未知关系不再转换为生物学亲子。
- GEDCOM 导出不再把配偶自动认定为子女父母，保留收养关系及已故但卒年未知状态；修复标准姓名顺序、日误作年、子女间收养标记串用。外部 `PEDI birth` 不作为生物学血缘证明。
- 图谱可正确查看零层范围。外部 GEDCOM 的 `PEDI birth` 不直接认定为生物学血缘，需依据史料核对；本版本无需数据库迁移。

## [0.2.2] - 2026-11-13

### 在线更新

- 稳定版更新使用项目专用 Release 资产；缺少受支持资产或 SHA-256 校验值时拒绝安装，并核对压缩包大小与摘要。
- 自托管实例可配置公钥并要求 detached signature 验证；启用后，签名缺失或验证失败会拒绝安装。
- 管理后台显示发布资产、大小、SHA-256 摘要、更新性质和最低支持版本；CI 为发布生成具名压缩包、校验文件与更新元数据。

## [0.2.1] - 2026-11-10

### 变更
- 开源规范化：新增 MIT `LICENSE` 与 `package.json` license 字段；README 全面重构为项目主页（新增 `README_EN.md` 英文版与 `docs/images/readme/` 下 19 张真实运行截图）；新增 `scripts/capture-readme.mjs` / `scripts/capture-cover.mjs` 截图生成器（从真实站点抓图，不进 CI）。
- 文档校准：`docs/TEST_REPORT.md` 更新为最新实测（20 文件 / 225 单测 + 2 跳过、冒烟 323、安全审计 42、E2E 11、备份演练 48 表 / 4369 行、构建 92 条路由）；修正 `docs/COMPLETION.md`、`docs/DEPLOYMENT.md` 的陈旧数字（Next.js 16.4.5、TypeScript 6.0.3、6 个迁移、48 个 model、68 个 Route Handler）。
- **测试数据污染公开面**：`smoke-archive` 为验证匿名可见性把测试族谱切换为 `PUBLIC` 后未改回，社区脚本留下的公开寻亲帖同样未回收，导致测试数据长期堆积在站点公开列表与社区流中。现在 5 套冒烟脚本在结尾统一回收自己创建的数据（先降级 `PRIVATE`，再软删除，可由所有者恢复），并各自新增 1~3 项清理断言。
- **登录页在生产环境暴露演示口令**：`auth-form` 原本无条件渲染演示账号密码，正式部署等于向所有访客公开一个可用凭据。改为只展示账号并指向 `prisma/seed.ts`；已验证口令字面量从生产构建产物中消失。同时从 `README.md`、`README_EN.md`、`docs/USER_GUIDE.md`、`docs/API.md` 中移除该口令。
- 修正文档中「生产构建 91 条路由」为实测 **92 条**（52 静态 / 40 动态：68 个 API + 20 个页面 + robots/sitemap）。
- `scripts/cleanup-test-data.mjs` 与 `pnpm test:cleanup`：按名称前缀清理历史遗留的测试族谱与帖子，只做软删除、默认 dry-run，需 `--apply` 才执行。
- `CONTRIBUTING.md`：数据纪律、开发环境、提交前检查、PR 规范。
- `SECURITY.md`：私密漏洞上报流程、已实现安全机制摘要与已知限制。
- fix(auth): 登录页不再暴露演示口令；同步文档实测数字与截图
- fix(test): 冒烟脚本回收测试数据，避免污染公开面
- chore: 移除内含本机路径的内部审计报告
- chore: 清理不该入库的生成物与旧验收截图
- docs: README 增加星标历史图（Star History，深浅色自适应）
- docs: README 全面重构为项目主页，校准全部交付文档数字
- chore(license): 新增 MIT LICENSE 与 package.json license 字段
- fix(deps): 把 minimatch 收口到 11.0.1（GHSA-g3hv-75wg-m249）

## [0.2.0] - 2026-11-10

### 新增

- **在线更新（自托管实例从上游仓库升级）**：后台「系统设置 → 系统更新」可检查上游版本、查看更新日志、一键升级。前端只能发起，不能指定目标版本；上游地址只来自环境变量，排除 SSRF。
  - 三种驱动：`SOURCE`（源码部署，独立进程安装构建后由 systemd/pm2 拉起）、`DOCKER`（容器部署，写重启标记由 updater sidecar 重建镜像）、`SIMULATE`（演示，不改文件，生产默认禁用）。
  - 更新前自动备份数据库与上传文件，备份失败即中止（`APP_UPDATE_SKIP_BACKUP=true` 可跳过）。
  - 发布包流式安全校验：路径穿越、绝对路径、链接/设备文件、tar 头校验和、解压体积与条目数上限、多顶层目录、结束标记；并比对包内 `package.json` 版本与目标版本。
  - 任务进度落库（`update_jobs`），数据库唯一索引保证同一时刻只有一个活跃任务；进程被重启打断的任务在读取状态时自愈收尾。
  - 新增 `POST /api/admin/system/update`、`POST /api/admin/system/update/check`、`GET /api/admin/system/update`、`GET /api/admin/system/update/jobs/[jobId]`，均仅管理员可访问并独立限流。
- **发布工具链**：`pnpm release patch|minor|major|x.y.z` 更新版本号、生成 CHANGELOG 段落、提交并打 annotated tag；支持 `--dry-run` / `--allow-dirty` / `--no-commit` / `--no-tag`。
- **CI 自动发布**：推送 `v*` tag 时，在 lint/typecheck/单测与构建冒烟全部通过后，从 `CHANGELOG.md` 提取对应版本段落创建 GitHub Release；缺少该版本条目时直接失败。
- **构建版本注入**：`next.config.ts` 把 `APP_VERSION` / `APP_BUILD_SHA` / `APP_BUILD_TIME` 注入构建产物，Docker 与 CI 通过 build arg / 环境变量传入，无 `.git` 的镜像环境也能显示准确版本与提交。
- **Docker 更新 sidecar**：新增 `updater` 服务，仅它挂载 `/var/run/docker.sock`；`app` 与 `nginx` 永不挂载该 socket。sidecar 只执行固定的 `docker compose build app` 与 `docker compose up -d --no-build app nginx`，不使用宿主机旧 checkout 作为构建上下文。
- **systemd 部署单元**：`deploy/systemd/xungen.service` 以 `Restart=always` 让更新器结束旧进程后自动拉起新版本，无需授予服务账号 `systemctl` 权限。
- **更新提醒**：管理员登录后进入个人中心或管理后台，若上游有新版本会直接看到提示条（含当前版本与目标版本）；后台侧边栏「系统设置」同时显示红点角标。提示按目标版本记忆关闭状态，新版本发布后会重新出现。更新提示只做提醒，是否可更新仍由服务端判定，前端无法指定目标版本。
- **家族统计仪表盘**：家族详情新增统计视图，展示人数与在世比例、性别构成、世代人口分布、生卒年代分布、分支人数、字辈用字频率与资料核实状态；只返回聚合数字，不含姓名/联系方式/加密字段，图表用 CSS 条形实现以免引入图表库体积。
- **疑似重复人物核对**：家族工作区新增「重复核对」页签，按姓名分桶并辅以字号/别名索引列出疑似同一人的配对，分三档置信度并给出可读判定依据；只提示、绝不自动合并。同时修复标签页增多后被横向截断、以及页签无法深链的问题。
- **按姓氏检索人物**：人物搜索框的关键词同时匹配姓氏、名、字号与别名（旧接口只查名，输入「陈」搜不到任何人）；并为姓氏字段补 pg_trgm GIN 索引，避免超大家族按姓氏检索退化为全表扫描。

### 修复

- 修复更新任务在备份/下载阶段仍停留在 `QUEUED` 时被 2 分钟超时误判为「执行器未启动」而强制失败的问题；现在任务创建后立即进入 `RUNNING`。
- 修复 stale 判定阈值（10 分钟）短于安装/构建超时（各 20 分钟）导致正常构建被误杀的问题；改为 45 分钟并以最后写库时间计时。
- 修复 branch 通道目标版本是 12 位 SHA 前缀、而收尾逻辑只认 40 位完整 SHA，导致该通道的更新永远无法判定成功、最终超时失败的问题；改为前缀比对 `APP_BUILD_SHA`。
- 修复 Docker 更新在等待新容器确认时每次轮询（约 1.5 秒）都写库并追加日志的问题，并补上「sidecar 报成功但新容器长期不生效」的超时失败与锁释放。
- 修复更新面板在别的管理员发起新任务后仍停留在旧任务上的问题。
- 修复 `scripts/release.mjs` 中 `Unreleased` 检测正则被双重转义、永远不命中，导致每次发布都重复插入 `## [Unreleased]`、手工整理条目永不进入发布段的问题。
- 修复统计接口的隐私回归：公开族谱中在世人物的出生年曾被聚合成年代/年龄分布，匿名访客据此几乎能反推个人生日；现在非协作者只统计已故与主动公开的在世人物，界面改为说明文案而非空图表。
- 修复服务端构建产物泄漏用户上传承档的问题：`UPLOAD_DIR` 无法静态求值，Turbopack 把整个项目目录记进每个 API 路由的 file trace，导致 `.storage/uploads` 下的真实档案随 `.next` 被复制、备份或打进镜像；排除运行期产物目录后 `.next` 329MB → 139MB，trace 内指向用户数据的条目归零。

### 变更

- 疑似重复人物检测增加规模上限并按需跳过字号/别名字段的组合比对，避免大家族在该维度上出现配对组合爆炸导致接口长时间占用。
- `.env.example` 补齐更新相关配置项（驱动、通道、分支、令牌、跳过备份、模拟开关、重启命令）并注明默认推断规则。
- `README.md` 增加在线更新章节与新的目录结构说明。
- `docs/API.md` 增加系统更新接口表与接口约束。
- `docs/COMPLETION.md`、`docs/TEST_REPORT.md` 更新单元测试口径与在线更新的验证边界（真实 SOURCE/DOCKER 升级未在本机执行）。
- 管理后台冒烟新增系统更新段落，覆盖匿名/普通用户拦截、状态字段、确认字面量、强制检查与错误码。

## [0.1.0]

初始版本：《百家姓》504 姓知识库、族谱与人物管理、关系冲突检测、四种图谱视图、祖先/后代追溯、亲属称谓引擎、GEDCOM/JSON/SVG/PNG/PDF 导入导出、版本快照与恢复、档案中心、宗亲社区、管理后台与审计日志、备份恢复、Docker/Nginx 部署配置与自动化测试体系。
