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

### 修复

- 修复更新任务在备份/下载阶段仍停留在 `QUEUED` 时被 2 分钟超时误判为「执行器未启动」而强制失败的问题；现在任务创建后立即进入 `RUNNING`。
- 修复 stale 判定阈值（10 分钟）短于安装/构建超时（各 20 分钟）导致正常构建被误杀的问题；改为 45 分钟并以最后写库时间计时。
- 修复 branch 通道目标版本是 12 位 SHA 前缀、而收尾逻辑只认 40 位完整 SHA，导致该通道的更新永远无法判定成功、最终超时失败的问题；改为前缀比对 `APP_BUILD_SHA`。
- 修复 Docker 更新在等待新容器确认时每次轮询（约 1.5 秒）都写库并追加日志的问题，并补上「sidecar 报成功但新容器长期不生效」的超时失败与锁释放。
- 修复更新面板在别的管理员发起新任务后仍停留在旧任务上的问题。
- 修复 `scripts/release.mjs` 中 `Unreleased` 检测正则被双重转义、永远不命中，导致每次发布都重复插入 `## [Unreleased]`、手工整理条目永不进入发布段的问题。

### 变更

- `.env.example` 补齐更新相关配置项（驱动、通道、分支、令牌、跳过备份、模拟开关、重启命令）并注明默认推断规则。
- `README.md` 增加在线更新章节与新的目录结构说明。
- `docs/API.md` 增加系统更新接口表与接口约束。
- `docs/COMPLETION.md`、`docs/TEST_REPORT.md` 更新单元测试口径与在线更新的验证边界（真实 SOURCE/DOCKER 升级未在本机执行）。
- 管理后台冒烟新增系统更新段落，覆盖匿名/普通用户拦截、状态字段、确认字面量、强制检查与错误码。

## [0.1.0]

初始版本：《百家姓》504 姓知识库、族谱与人物管理、关系冲突检测、四种图谱视图、祖先/后代追溯、亲属称谓引擎、GEDCOM/JSON/SVG/PNG/PDF 导入导出、版本快照与恢复、档案中心、宗亲社区、管理后台与审计日志、备份恢复、Docker/Nginx 部署配置与自动化测试体系。