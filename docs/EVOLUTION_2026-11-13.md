# 2026-11-13 项目升级报告（首次本地验收记录）

> 本文保留开发完成时的状态与证据，后续升级内容纳入 v0.3.0。版本发布说明见 [发布记录](releases/release-notes.md)；文中的未提交、未发布以及运行环境限制均描述首次本地验收时点。

## 范围与执行状态

起点：`main`，HEAD `618c6bd`，package version `0.2.2`，Git 工作区干净。项目为「中华寻根 · 百家族谱」，Next.js 16.4.5 / React 19 / TypeScript / Prisma 6 / PostgreSQL 全栈 Web 应用，使用 pnpm；支持 Docker/源码自托管。

本轮完成项目调查、五个开源项目源码研究、数据与权限重点审查、代码升级、自动化及数据库集成验证、文档同步。改动保留在本地工作区，没有提交、推送、发版、部署或修改用户原有数据库。

浏览器验收仍受阻，因此本报告不宣称全部阶段验收完成，也不将既有截图视作新面板截图。不是全仓形式化安全证明，亦不是生产环境性能认证。

## 项目功能地图与原有实现

| 模块 | 实现位置 | 原有能力 / 本轮审查结论 |
| --- | --- | --- |
| 姓氏与寻根 | `src/app/surnames`、`roots`、`src/lib/search.ts`、`prisma/seed.ts` | 504 姓资料、来源分级、检索与迁徙，已有真实持久化，无需另造资料库 |
| 族谱与人物 | `src/components/family`、`src/app/api/families` | 人物、关系、分支、字辈、软删除、协作，已有完整操作入口 |
| 图谱与称谓 | `src/lib/genealogy.ts`、`kinship.ts`、`graph-layout.ts` | 四视图、局部图、核实关系计算；图谱字段裁剪与人物详情不一致 |
| 数据核查 | `duplicate-detection.ts`、`family-stats.ts` | 已有重复核对和统计；没有覆盖旧数据的结构/年代问题清单 |
| 导入导出 | `genealogy-io.ts`、import/export 路由 | 预览、确认、事务、7 种导出；存在并发重复写入和 GEDCOM 语义错误 |
| 身份与隐私 | `auth.ts`、`permissions.ts`、`api.ts` | 会话、家族权限、同源校验、写限流；部分内部报告仅做家族公开可读判断 |
| 档案 / 社区 / 后台 | documents、community、admin 路由和服务 | 已有真实上传、存储、帖子、审核、审计；本轮未重写这些业务 |
| 运维 | `src/lib/updater`、`scripts`、`.github/workflows/ci.yml` | 已有备份、更新校验、CI；本轮没有触发更新或发布 |

已读 README、package、schema、相关 API/服务/面板、测试与 CI，并检索了 TODO/FIXME 等标记；命中主要是正常表单 placeholder，未据此把正常输入框当作空实现。已按 AGENTS.md 阅读安装版 Next Route Handlers 与 Server/Client Components 文档。使用 application-development、frontend-design、webapp-testing 工作流；Python Playwright 未安装，复用仓库现有 TypeScript Playwright 测试体系，没有新增依赖。

## 开源竞品研究

2026-11-13 通过联网检索与 GitHub connector 读取仓库元数据、目录树、README、许可证和以下核心源码，并抽查近期 Issue/PR。五仓库均非 archived，元数据最近 push 时间分别为 11-12、10-27、11-12、11-12、10-31；这些只是维护活跃度信号，不代表质量保证。没有运行竞品，也没有声称实测其交互。

| 项目 / 许可证 | 直接研究的实现 | 借鉴与边界 |
| --- | --- | --- |
| [webtrees](https://github.com/fisharebest/webtrees) / GPL-3.0 | [CheckTree.php](https://github.com/fisharebest/webtrees/blob/main/app/Http/Controllers/CheckTree.php)：检查原始记录、引用类型、双向关联，区分 errors/warnings/infos，考虑内存上限 | 采用可解释问题清单、严重程度、限量报告；没有移植 PHP 代码 |
| [Gramps Desktop](https://github.com/gramps-project/gramps) / GPL-2.0 | [check.py](https://github.com/gramps-project/gramps/blob/maintenance/gramps61/gramps/plugins/tool/check.py)：坏家庭链接、重复配偶、对象引用、校验和等检查/修复流程 | 借鉴结构检查覆盖面；本项目只提示，保留原始史料，不自动执行修复 |
| [Gramps Web](https://github.com/gramps-project/gramps-web) / AGPL-3.0 | [GrampsjsTasks.js](https://github.com/gramps-project/gramps-web/blob/main/src/components/GrampsjsTasks.js)：任务过滤、排序、权限相关操作和空状态；README 描述 Lit 前端与桌面数据互通 | 采用筛选、定位、刷新式核查流程；不引入远程 AI、任务数据库或新前端框架 |
| [GeneWeb](https://github.com/geneweb/geneweb) / GPL-2.0 | [checkItem.ml](https://github.com/geneweb/geneweb/blob/master/lib/checkItem.ml)：年代区间、出生/死亡次序、父母/婚姻年龄警告 | 采用年代规则和谨慎措辞；不套用其经验年龄阈值，不把约略日期当确定事实 |
| [Topola](https://github.com/PeWu/topola) / Apache-2.0 | [gedcom.ts](https://github.com/PeWu/topola/blob/master/src/gedcom.ts)：标准姓名解析、年月日与范围、FAMC/FAMS 记录链接和缺失引用过滤；TypeScript + D3 SVG | 用于审查交换格式边界，促成本项目姓名/日期/亲子边修复；保留既有图谱布局，无新依赖 |

许可证文件均已读取；本仓库为 MIT。本次只借鉴设计与检查思路，未复制以上项目代码，未引入 GPL/AGPL 或 Apache 库。GEDCOM 语义另参照 [FamilySearch GEDCOM 官方规范](https://gedcom.io/specifications/FamilySearchGEDCOMv7.html)：`INDI.FAMC.PEDI` 描述人物与家庭的关系，`BIRTH` 不应被直接解释为遗传学父母。

| 对比维度 | 当前项目原状 | 竞品实践与差距 | 本轮结果 |
| --- | --- | --- | --- |
| 核心功能 | 有重复检测，缺综合历史资料核查 | webtrees/Gramps 提供错误检查流程 | 增加 11 类体检规则 |
| UI | 族谱工作区风格一致，核查缺入口 | Gramps Web 提供可筛选的任务列表 | 沿用现有色板、字体和导航；增加清单、搜索、分页 |
| 用户体验 | 需要在大量记录中手工找问题对象 | 可解释提示与对象定位 | 带人物/关系 ID 的核对深链与解除筛选 |
| 架构 | 规则分散，检查多发生在写入时 | 维护工具可重查历史资料 | 纯函数规则引擎 + 鉴权只读 API + 组件 |
| 自动化 | 导入预览与写入有基础，但并发状态存在窗口 | 严格数据边界和处理生命周期 | 原子领取导入任务；失败回滚；导入身份歧义阻断 |
| 扩展性 | 需要保持现有 Prisma/React 技术栈 | 开源工具以明确规则/对象组织工作 | 规则码、严重程度、结构化报告可后续复用，无 schema 变更 |

## 优先级与已实施成果

| 优先级 | 发现 / 收益 | 实施与兼容性 | 风险与投入 |
| --- | --- | --- | --- |
| P0 | 图谱泄漏人物私有生卒年 | 复用详情权限判定，协作者保持完整年代，公开节点仅保留允许字段，响应 no-store | 低；保留图谱结构 |
| P0 | 重复核对与导入报告向公开访客暴露内部线索 | 新 `assertFamilyReview` 限家族协作者，公开导航隐藏内部核查入口，服务端独立拒绝 | 低；刻意收紧公开读取权限 |
| P0 | 并发提交同一导入任务可能重复造人/关系 | 同一数据库事务内条件更新 QUEUED → PROCESSING，竞争失败 409；中途失败回滚 | 中；真实数据库并发与回滚测试已通过 |
| P0 | JSON 未知关系默认亲子、重复人物 ID 让关系指向最后一条记录 | 保留监护/过继，未知类型跳过并警告，缺失血缘子类型不再默认生物学；重复 ID 阻止预览/提交 | 中；旧的歧义任务也不能再提交 |
| P0 | GEDCOM 导出将配偶自动当作父母，遗漏收养，未知卒年变回在世 | 只导出已登记亲子/收养边；标准 FAMC/FAMS 链接；DEAT Y；按子女处理 PEDI | 中；导出 FAM 数量/组织方式改变，不改存量数据库 |
| P1 | 标准 GEDCOM 姓名颠倒、日误作年 | 按标准 `Given /Surname/`；识别公历日期与 ISO 日期；无法解释的纪年保留原文 | 中；保留旧文件明确 GIVN/SURN 的可读性 |
| P1 | 旧资料缺少可反复执行的核查 | 新资料体检引擎、权限 API、工作区入口、筛选/分页/定位/刷新/异常状态 | 中；无外部服务、无数据库迁移 |
| P2 | 图谱 up/down=0 被默认 2 覆盖 | 接受零值、整数化、范围限制 | 低；恢复参数含义 |

体检规则：生卒倒置、在世与去世资料矛盾、未来年份、父母生年顺序、已确认世代间隔、自反关系、重复关系、引用缺失人物、生物学父母超过两位、生物学关系环、关系未核实。年代/世代异常是人工核对提示。已否定关系不参与检查；收养/监护不混入生物学图。

性能设计：Map/Set 索引、显式栈 DFS，覆盖一万代深链测试；同一个数据库 RepeatableRead 快照读取人物与关系。最多 10,000 人 / 30,000 条关系，超限明确拒绝，避免截断数据导致误报悬挂关系。问题完整计数，响应最多 500 条、前端每页 20 条。没有用全量浏览器压测替代这些边界测试。

UI 设计沿用项目已有藏青 `#1b2a41`、墨色 `#191b1d`、金色 `#b08d57`、纸白 `#f7f5ef`、玉色 `#3e6b6b`，宋体标题与现有无衬线正文。布局为说明/刷新 → 分类/搜索 → 问题清单 → 分页；提示包含规则依据和原记录链接，避免用百分比分数宣称族谱可信。新控件含标签、选中状态和键盘焦点；实际桌面/移动视觉检查尚未执行。

## 文件修改清单

- `src/lib/genealogy-quality.ts`：新增纯规则引擎、报告类型与扫描边界。
- `src/app/api/families/[id]/quality/route.ts`：新增协作者鉴权、同一读取快照、超限响应。
- `src/components/family/quality-panel.tsx`、`family-workspace.tsx`：体检工作流和权限入口。
- `person-panel.tsx`、`relation-panel.tsx` 及对应 members/relationships GET：按记录 ID 定位、UUID 校验与解除定位，仍限定当前家族。
- `src/lib/permissions.ts` 与 duplicates、import、import/[jobId] GET：内部报告权限统一。
- `src/lib/genealogy.ts`、graph GET：图谱年代裁剪、零层参数及禁缓存。
- import/[jobId]/commit：原子任务领取、重复标识保护。
- `src/lib/genealogy-io.ts`：JSON/GEDCOM 语义与数据完整性修复。
- `src/tests/genealogy-quality.test.ts`、`genealogy-privacy.test.ts`、`genealogy-integration.test.ts`、`genealogy-io.test.ts`：规则、隐私、交换格式、真实事务回归。
- `e2e/quality.spec.ts`：新增显式启用的浏览器验收流程，尚未执行。
- README 中英文、CHANGELOG Unreleased、API、用户指南、测试报告及本文：同步真实能力和验证边界。

没有删除源文件；没有新增生产依赖；没有修改 schema、现有迁移、.env 或发布版本号。

## 验证证据

环境：Windows，Node 24.20.0、pnpm 11.20.0，已安装依赖。使用现有 PostgreSQL 可执行文件，在当前项目 `.pgdata/evolution-20261113` 新建独立数据目录、仅监听 `127.0.0.1:55439`；没有连接原业务数据库。验收后停止独立测试库进程，数据目录保留用于复核，不执行破坏性清理。

| 状态 | 检查 | 证据与范围 |
| --- | --- | --- |
| PASS | 基线 `pnpm test` | 217 通过，17 跳过 |
| PASS | 最终 `pnpm test`（独立库开关开启） | 243 通过，17 跳过；24 文件通过、1 文件跳过 |
| PASS | 单独真实数据库集成 | 4 项通过：并发 200/409 且人物/关系不重复，中途失败回滚，VIEWER/撤销/匿名权限，精确定位与跨家族隔离 |
| PASS | GEDCOM / JSON 测试 | 21 项通过，含 5.5.1 和 7.0 往返、配偶非父母、收养、日期、重复标识 |
| PASS | `pnpm typecheck` / `pnpm lint` | 已运行并成功；最终构建另执行 TypeScript |
| PASS | `pnpm db:migrate`、`pnpm db:seed` | 在独立空库应用现有 6 个迁移、写入演示数据 |
| PASS | `pnpm build` | 生产编译通过；仍有 storage.ts 动态文件路径追踪的 2 条构建警告，既有 tracing 排除规则保留 |
| PASS | `git diff --check` | 无空白错误 |
| PASS | 构建文件追踪清单检查 | 扫描 95 个 `.nft.json`，未引用 `.env`、`.pgdata`、`.storage` 或 backups 路径；此结果仅覆盖列出的路径规则，不等于完整包安全审计 |
| BLOCKED | 启动生产测试站点、浏览器 E2E、截图 | 自动审批两次拒绝本机站点启动，均只返回 `blocked by policy`；没有通过其他入口绕过 |
| BLOCKED | `pnpm audit --prod`；`pnpm audit --prod --registry=https://registry.npmjs.org` | 默认 npmmirror 缺 audit endpoint；官方 npm advisory 请求重试后超时，均以退出码 1 结束，不能宣称无漏洞 |
| PARTIAL | 17 个 POSIX sidecar 测试 | 环境 shell 探测失败而跳过，未降低断言或将跳过记作通过 |
| NOT APPLICABLE | 新 schema 迁移 / 新依赖安装 | 本轮均未新增；已有依赖可运行构建测试，未做全新安装复验 |
| NOT APPLICABLE | 远程 CI / Release / 客户端更新 | 本轮未请求远程写入，没有发布或更新实测 |

集成测试绕过了 HTTP 会话解析，用 mock 注入当前用户身份；API 处理函数、家族权限、Prisma 和 PostgreSQL 事务是真实执行。因此不能用它代替 Cookie/网络/浏览器端到端验收。

复现事务回归（仅限事先准备好同名独立测试库，不能指向业务库）：

```powershell
$env:DATABASE_URL='postgresql://evolution@127.0.0.1:55439/evolution?schema=public'
$env:EVOLUTION_ISOLATED_TEST='1'
$env:REDIS_URL=''
pnpm exec vitest run src/tests/genealogy-integration.test.ts
```

默认 `pnpm test` 跳过这 4 个有数据库写入的用例；只有明确开关和固定测试库 URL 同时满足时执行。浏览器脚本同样要求显式开关，待允许启动独立站点后运行，当前没有截图产物。

## 后续任务与边界

| 优先级 | 建议 | 价值 / 难度 / 风险 |
| --- | --- | --- |
| P1 验收 | 允许本机服务后运行新旧桌面/移动 E2E，检查焦点、溢出、刷新及空状态，补真实截图 | 高价值，低实现难度；当前受执行策略阻止 |
| P1 | 将其他人物/关系写入与自动版本快照进一步统一事务，处理不同任务之间的版本号竞争 | 高价值，中等难度；涉及恢复和审计语义，需要专门回归。本轮只保证单导入任务一次写入及其主体事务回滚 |
| P1 | GEDCOM 扩展事件、日期区间、不同父母收养范围、来源引用的完整兼容矩阵 | 高价值，中高难度；不应以轻量解析宣称全标准无损支持 |
| P2 | 公共关系备注、档案关联元数据等剩余跨接口隐私检查；修复动态存储路径 tracing 警告 | 中高价值，中等难度；需要逐项验证原有公开策略和部署产物 |
| P2 | 更大族谱的后台分批体检、完整问题分页与核查标注 | 中等价值，中等难度；需要持久化任务/权限设计，当前选择明确上限 |
| P2 | 补可用 advisory 查询和生产构建的 HTTP/负载回归 | 中高价值，环境依赖；不能由本轮单测替代 |
| P3 | 档案出处与结构化研究任务联动、受控插件扩展 | 有潜力，高投入；先把人工核实和权限边界做牢，不引入无依据的 AI 关系推断 |

## 完成度评估

以下为本轮证据下的保守成熟度，非商业认证。尺度：1=未形成可用链路，2=局部实现，3=实现且自动验证，4=另有真实交互与主要边界验收，5=另有生产持续证据。对尚未验证部分不给满分。

| 维度 | 评分 / 5 | 依据与限制 |
| --- | --- | --- |
| 功能完整度 | 3 | 体检/权限/导入/定位已实现且真实数据集成通过；高级 GEDCOM 和更大规模检查仍有限制 |
| UI/UX | 2 | 加入工作流、加载/错误/空态、标签/焦点；本轮浏览器与视觉验收受阻 |
| 代码质量 | 3 | 类型、Lint、测试、独立纯函数模块；未做全仓形式化分析 |
| 性能 | 3 | 线性图遍历、一万代边界测试、扫描/返回上限；未跑在线负载测试 |
| 安全性 | 3 | 已修复明确的公开字段/报告边界并测试；漏洞查询与全公共字段矩阵仍未完成 |
| 稳定性 | 3 | 真实并发/回滚、243 测试、生产构建；启动与 E2E 受阻 |
| 可维护性 | 3 | 无新依赖/迁移，权限复用、纯规则引擎、文档与复现命令齐备 |
| 扩展性 | 3 | 结构化规则报告可扩展；后台分页与研究任务尚未设计为生产能力 |

交付状态：本地代码与可执行回归已交付；运行策略、浏览器验证和在线漏洞查询限制已明确保留。
