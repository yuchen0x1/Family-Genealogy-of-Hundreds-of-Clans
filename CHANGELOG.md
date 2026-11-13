# Changelog

本文件记录各版本的功能、修复、维护和升级要求；面向使用者的操作说明见 [完整发布记录](docs/releases/release-notes.md)。版本号遵循 [Semantic Versioning](https://semver.org/)，日期沿用项目的北京时间（UTC+8）口径。v0.1.0 为未单独发布的初始功能基线。

`pnpm release patch|minor|major` 会读取 `Unreleased` 正文与自上个 tag 以来的 commit 摘要生成新版本段落，并重置 `Unreleased`。发布前应按实际版本差异整理条目、合并重复摘要，并补充适用的升级说明。推送 `v*` tag 后 CI 自动创建 GitHub Release。

## [Unreleased]

记录尚未发布的功能、修复与维护性更新。

## [0.3.0] - 2026-11-13

资料体检、导入可靠性与 GEDCOM 交换修正。

### 新增

- 家族协作者可在「资料体检」中检查 11 类问题：生卒年倒置、在世与去世资料矛盾、未来年份、关系引用缺失人物、自身关系、重复关系、未核实关系、亲子生年顺序、已确认世代间隔、生物学父母数量及亲子循环。
- 提示按错误、警告、信息分级，支持严重程度/姓名筛选、分页、重新检查和定位人物/关系。检查只报告线索，不自动改写资料、合并人物或认定血缘。

### 修复

- 公开图谱按查看权限裁剪生卒年；重复核对与导入报告改为仅家族协作者可读。
- 导入任务在数据库事务内通过条件更新取得执行权，避免并发重复写入；文件内重复人物标识会阻止导入，避免关系引用错人。
- JSON 导入保留监护、过继等关系类型，未知关系不再被默认转换为生物学亲子。
- GEDCOM 导出不再根据配偶关系推断子女父母，保留收养关系及已故但卒年未知状态；修正标准姓名顺序、日被误作年份、不同子女之间收养标记串用的问题。
- 图谱的零层查看参数可正确生效。

### 升级与兼容

- 相对 v0.2.2 无新增数据库迁移。收紧后的重复核对和导入报告权限需要家族协作身份。
- 外部 GEDCOM 的 `PEDI birth` 不作为生物学血缘证明，缺少明确子类型的关系保留为未知。修复只影响后续交换，不自动纠正此前导入的数据。
- GEDCOM 无法完整表达本项目的全部关系信息；版本快照用于族谱恢复，完整实例备份需包含数据库及上传档案。

[Release](https://github.com/yuchen0x1/Family-Genealogy-of-Hundreds-of-Clans/releases/tag/v0.3.0) · [完整差异](https://github.com/yuchen0x1/Family-Genealogy-of-Hundreds-of-Clans/compare/v0.2.2...v0.3.0)

## [0.2.2] - 2026-11-13

发布包校验、可选签名验证与更新详情完善。

### 新增

- 稳定版更新使用项目专用 Release 资产，下载后核对大小和 SHA-256；缺少受支持的发布资产、缺少摘要或校验失败时拒绝安装。
- 支持配置 `APP_UPDATE_SIGNING_PUBLIC_KEY` 验证 detached signature；启用 `APP_UPDATE_REQUIRE_SIGNATURE` 后，公钥或签名缺失、验证失败均拒绝安装。
- 管理后台显示发布资产、大小、SHA-256、更新性质和最低支持版本。
- CI 自动附加 `xungen-<version>.tar.gz`、`.sha256` 与 `.update.json`；配置发布签名密钥后才生成 `.sig`。

### 修复与改进

- Release 缺少受支持资产时不再回退安装未经摘要校验的源码包；限制发布资产的下载地址为配置仓库下的 GitHub HTTPS 地址。
- 同源写请求校验完整 Origin，区分协议、主机与端口，并将无效 Origin 作为拒绝请求处理。
- 增加「跳到主要内容」键盘入口和主导航辅助标签。
- 补充在线更新部署说明，统一主分支维护约定。

### 升级与兼容

- 相对 v0.2.1 无新增数据库迁移。稳定 Release 校验与开发分支通道的保证不同。
- 配置公钥也会要求发布包提供签名。截至 2026-11-13 整理日志时，v0.2.2 和 v0.3.0 发布附件未包含 `.sig`，强制验签的实例会拒绝安装。SHA-256 用于完整性校验，不等同于签名认证。

[Release](https://github.com/yuchen0x1/Family-Genealogy-of-Hundreds-of-Clans/releases/tag/v0.2.2) · [完整差异](https://github.com/yuchen0x1/Family-Genealogy-of-Hundreds-of-Clans/compare/v0.2.1...v0.2.2)

## [0.2.1] - 2026-11-10

演示口令保护、测试数据回收和项目文档完善。

### 修复

- 登录页不再渲染演示账号密码，改为指向种子数据说明；README、英文说明、用户手册和 API 文档同步移除口令。
- 5 套冒烟脚本在结束时回收自己创建的族谱、帖子等测试记录；需要公开验证的族谱先恢复私有再软删除，避免公开列表残留测试内容。
- 将 minimatch 依赖约束收口到 11.0.1，处理该工具链依赖的已知问题。

### 新增与改进

- 新增 `pnpm test:cleanup` 历史测试数据清理命令：按约定名称前缀筛选，默认只预览，添加 `--apply` 后软删除。
- 新增 MIT `LICENSE` 和包许可证字段、贡献指南与安全问题私密报告说明。
- 重构项目首页，新增 `README_EN.md`、19 张真实界面截图及截图生成脚本，补齐功能、快速启动、隐私与部署入口。
- 校准部署、API、用户说明和历史验收报告中的版本、路由与测试口径；清理不应入库的生成物、旧截图和包含本机路径的内部报告。历史验收数据不代表后续版本的验证结果。

### 升级与兼容

- 相对 v0.2.0 无新增数据库迁移。页面移除口令不会轮换已有演示账号密码，生产实例需自行处理演示账号。
- 历史测试数据不会随升级自动清除；先检查 `pnpm test:cleanup` 的候选列表，再决定是否执行 `--apply`。

[Release](https://github.com/yuchen0x1/Family-Genealogy-of-Hundreds-of-Clans/releases/tag/v0.2.1) · [完整差异](https://github.com/yuchen0x1/Family-Genealogy-of-Hundreds-of-Clans/compare/v0.2.0...v0.2.1)

## [0.2.0] - 2026-11-10

在线更新、家族统计、重复核对和人物检索扩展。

### 新增

- **在线更新（自托管实例从上游仓库升级）**：后台「系统设置 → 系统更新」可检查上游版本、查看更新日志、一键升级。前端只能发起，不能指定目标版本；上游仓库只来自环境变量，客户端不能提交任意下载地址。
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
- 修复统计接口的隐私回归：公开族谱中在世人物的出生年曾被聚合成年代/年龄分布，可能暴露不应公开的年代信息；现在非协作者只统计已故与主动公开的在世人物，界面改为说明文案而非空图表。
- 修复服务端构建产物泄漏用户上传档案的问题：`UPLOAD_DIR` 无法静态求值，Turbopack 把整个项目目录记进每个 API 路由的 file trace，导致 `.storage/uploads` 下的真实档案随 `.next` 被复制、备份或打进镜像；通过排除运行期产物目录，防止上传档案被该构建追踪路径带入发布产物。

### 变更

- 基础依赖升级至 Next.js 16.4.5、TypeScript 6.0.3、Zod 4.6.7、ECharts 6.1.0 和 Vitest 5.1.0，并适配 Zod 4 与 TypeScript 6 的接口/类型变化；调整 PostCSS、deepmerge-ts 依赖约束。
- 疑似重复人物检测增加规模上限并按需跳过字号/别名字段的组合比对，避免大家族在该维度上出现配对组合爆炸导致接口长时间占用。
- `.env.example` 补齐更新相关配置项（驱动、通道、分支、令牌、跳过备份、模拟开关、重启命令）并注明默认推断规则。
- `README.md` 增加在线更新章节与新的目录结构说明。
- `docs/API.md` 增加系统更新接口表与接口约束。
- `docs/COMPLETION.md`、`docs/TEST_REPORT.md` 更新单元测试口径与在线更新的验证边界（真实 SOURCE/DOCKER 升级未在本机执行）。
- 管理后台冒烟新增系统更新段落，覆盖匿名/普通用户拦截、状态字段、确认字面量、强制检查与错误码。

### 升级与兼容

- 从 v0.1.0 基线升级时，执行 `pnpm db:migrate` 应用新增的更新任务表与人物姓氏搜索索引，再重新构建。升级前备份数据库及上传档案。
- SOURCE 驱动依赖进程守护和重启配置；DOCKER 驱动依赖 updater 服务；SIMULATE 仅作演示。
- 本版发布时尚无真实 SOURCE / DOCKER 跨版本升级全流程验收记录，需在部署环境确认备份、重启和新版本健康状态。

[Release](https://github.com/yuchen0x1/Family-Genealogy-of-Hundreds-of-Clans/releases/tag/v0.2.0) · [完整差异](https://github.com/yuchen0x1/Family-Genealogy-of-Hundreds-of-Clans/compare/355b7b9...v0.2.0)

## [0.1.0]

初始功能基线，对应首次提交的包版本；未单独创建 Git 标签或 GitHub Release，不补记未经确认的发布日期。

### 初始功能

- 《百家姓》504 姓字典与有来源的姓氏史料、历史人物、迁徙线索；资料附可信程度与审核状态，未补齐源流的条目明确标记。
- 族谱、人物、亲属关系、字辈、世代和分支管理；关系冲突检测、祖先/后代追溯与亲属称谓计算。
- 纵向/横向世代树、分支折叠、时间轴图谱，支持缩放、搜索定位与关系路径查看。
- GEDCOM、CSV、JSON 导入预览与确认写入；JSON、CSV、GEDCOM 5.5.1 / 7.0、SVG、PNG、PDF 导出。图片和 PDF 仅用于展示，不属于可回导的完整备份。
- 版本快照、恢复、删除回收与协作邀请；所有者、编辑者和查看者权限及私有族谱边界。
- 档案中心、宗亲社区、寻亲与纠错、私信和通知、管理后台与审计日志。
- 数据库与上传档案备份恢复、Docker/Nginx 部署配置及自动化验证脚本。

### 数据边界

- 同姓、同名与历史人物匹配不会自动建立真实家族关系；导入的关系需人工核实。
- 版本快照与交换文件不包含全部敏感字段；完整实例备份需同时保存数据库与上传档案。

[初始源码记录](https://github.com/yuchen0x1/Family-Genealogy-of-Hundreds-of-Clans/commit/355b7b9)
