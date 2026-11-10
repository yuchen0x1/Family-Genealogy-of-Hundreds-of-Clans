# Changelog

本文件记录每次发布的用户可见变更。版本号遵循 [Semantic Versioning](https://semver.org/)；发布前请先将 `Unreleased` 内容整理完整。

`pnpm release patch|minor|major` 会读取 `Unreleased` 正文与自上个 tag 以来的 commit 摘要生成新版本段落，并重置 `Unreleased`。推送 `v*` tag 后 CI 自动创建 GitHub Release。

## [Unreleased]

记录尚未发布的功能、修复与维护性更新。

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