# 全球开源竞品与方案研究

研究日期：2026-11-16。以下项目按公开仓库、README、许可证文件、源码结构和近期可见活动进行点时检查；星标/提交数等易变指标不作为结论依据。研究的目的是提取可验证的产品模式，不是复制代码或许可证义务。

检查口径：每个条目至少核对仓库主页、README、许可证和目录/源码入口；重点项目另外核对 Releases/提交活动可见信息与运行/截图线索。无法从公开页面确认的能力没有写成“已实现”，而是标为取向、alpha、实验性或待验证。该研究不替代目标项目自己的 LICENSE、NOTICE 和发布说明审阅。

## 1. 项目清单

| 项目 | 许可证/形态 | 观察到的能力 | 对本项目的启发 |
|---|---|---|---|
| [Gramps Web](https://github.com/gramps-project/gramps-web) | AGPL-3.0；Web + API | 多用户族谱、媒体、权限、搜索、时间线 | 证据/媒体/权限应继续做成独立领域；需评估 AGPL 义务 |
| [Gramps](https://github.com/gramps-project/gramps) | GPL-2.0；桌面 | 成熟的事件、来源、引用、关系和报告模型 | 继续强化来源/证据链和可打印报告 |
| [webtrees](https://github.com/fisharebest/webtrees) | GPL-3.0；PHP Web | 多族谱、协作、隐私策略、模块化视图 | EV-039 多树工作区和 EV-042 可访问视图 |
| [GeneWeb](https://github.com/geneweb/geneweb) | GPL-2.0；OCaml Web | 关系路径、祖先/后代报告、复杂婚姻和历史数据 | 关系路径和复杂家庭边界是核心差异化能力 |
| [TreeMonk](https://github.com/janosh/tree-monk) | 非 OSI 的个人/非商业条款；Electron/React/SQLite | 本地优先、离线编辑、桌面体验 | EV-040 离线同步；许可证不能直接作为本项目依赖 |
| [Origins](https://github.com/OriginsDev/Origins) | MIT；Go + Markdown/YAML/Git，alpha | Git 版本化、GEDCOM、矛盾检查、文本优先 | 版本快照之外增加可审阅的研究变更集 |
| [RootFree](https://github.com/caoyue/RootFree) | MIT；浏览器本地存储/WebRTC | 浏览器优先、导入导出、点对点分享 | 本地数据主权和无服务器分享可作为可选模式 |
| [Open Family Tree](https://github.com/OpenFamilyTree/OpenFamilyTree) | MIT；React/Tailwind/Vite | GEDCOM/CSV、移动端和轻量树编辑 | 移动端编辑流程与导入体验值得借鉴 |
| [openom](https://github.com/openom-project/openom) | Rust/WASM；CRDT/加密同步取向 | 加密、离线、冲突合并、端到端同步 | EV-040 必须先有密钥恢复和冲突模型 |
| [Kinship](https://github.com/try-kinship/kinship) | 开源前端；React Flow/IndexedDB | GEDCOM/GEDCOM X、关系图和本地数据库 | 渲染器与持久层分离；图交互可独立演进 |
| [Progenies](https://github.com/Progenies/progenies) | 开源；FastAPI + React + PostgreSQL/D3 | 自托管 PWA、D3 图谱、API 分层 | 保持 API/渲染/存储解耦，适合后续移动端 |
| [Zain-Bangash/family-tree](https://github.com/Zain-Bangash/family-tree) | MIT；Next.js/React/Supabase | 来源、信息提供者链、确定性等级、关系路径 | EV-038 把证据来源和 certainty ladder 做成 UI |
| [Furqatovm/Family-tree](https://github.com/Furqatovm/Family-tree) | 开源；Flask REST + PostgreSQL/SQLite + React Flow | JWT、REST、可视化编辑、多数据库 | 对比出本项目同源校验/会话审计的优势 |
| [GEDCOM Navigator](https://github.com/elliotwutingfeng/GEDCOM-Navigator) | 开源桌面/CLI | 模糊搜索、关系路径和 GEDCOM 导航 | 大数据集检索与 CLI 诊断工具值得补强 |
| [family-plot](https://github.com/kamilmielnik/family-plot) | 开源前端 | 3D 力导向族谱可视化 | 可作为实验性视图，不应替代无障碍二维视图 |
| [@memoir/tree](https://github.com/memoir-app/tree) | 开源 React renderer | 渲染器包、CSS 变量、可访问性 | EV-042/043：图组件应有键盘、语义和视觉回归契约 |
| [ged2svg](https://github.com/ged2svg/ged2svg) | GPL-3.0；CLI | GEDCOM→SVG、格式检查、静态发布 | 本项目 SVG 导出可增加一致性报告和纯静态分享 |
| [Ancestris](https://github.com/ancestris/ancestris) | GPL-3.0；Java 桌面 | 多视图、来源/报告、数据质量工具 | 资料体检、时间线和地图工作区可继续产品化 |

## 1.1 重点项目的深度决策记录

| 项目 | 对方优势与实现原因 | 我们当前优势 | 差距 | 决策 |
|---|---|---|---|---|
| Gramps Web/Gramps | 来源、引用、媒体和复杂事件模型成熟；桌面核心长期沉淀 | 中文姓氏/迁徙场景、在世人物默认保护、7 种导出 | 来源链 UI 和报告生态较薄 | 借鉴数据模型与报告思路，不直接引入 GPL/AGPL 代码 |
| webtrees | 多族谱、协作、隐私策略和模块化视图成熟 | Next.js/TypeScript 迭代快，隐私边界已有自动化审计 | 多树 dashboard、扩展生态不足 | 实施 EV-039/042；保持当前 API/领域分层 |
| GeneWeb | 关系路径、复杂婚姻/亲属报告和历史数据处理强 | 中文证据等级和隐私脱敏更明确 | 路径解释和复杂家庭 UI 仍可增强 | 实施 EV-020/041，保留未知关系语义 |
| TreeMonk | Electron/React/SQLite 的本地优先和离线编辑体验 | 服务端协作、备份、审计、权限更完整 | 离线同步和冲突合并缺失 | 只借鉴本地优先交互；许可证条款不作为依赖 |
| Origins | Git + Markdown/YAML 的可审阅变更和矛盾检查 | Prisma 事务、权限和网页端流程更完整 | 研究变更集和可回溯 diff 不够直观 | 借鉴版本/变更审阅，落到 EV-015/036 |
| RootFree/openom | 浏览器本地、WebRTC/CRDT、加密同步降低服务器依赖 | 服务器端权限与搜索更适合多人族谱 | 密钥恢复、设备撤销、离线冲突未实现 | 先做威胁模型，再按 EV-040 分阶段实现 |
| Kinship/Progenies | React Flow/D3 与 API/存储分离，图渲染可复用 | 已有四视图、亲属称谓和导出链 | 图渲染器仍与页面交互耦合 | 借鉴 renderer boundary，实施 EV-020/042/043 |
| Zain-Bangash/family-tree | informant chain、certainty ladder、关系路径贴合证据场景 | 本项目已有来源/审核/证据枚举和中文资料 | 缺少面向用户的证据链呈现 | 实施 EV-038，不把确定性当成自动血缘判定 |
| ged2svg | 专注 GEDCOM→SVG 和格式/一致性检查，静态分享成本低 | 同时支持 PNG/PDF/JSON/CSV/GEDCOM 并有权限裁剪 | 静态分享和兼容性报告可更完整 | 借鉴格式检查与静态产物，实施 EV-011/027/051 |
| Ancestris/family-plot | 桌面多视图、地图/时间线/3D 探索能力 | Web 自托管、移动模拟、隐私默认值更适合当前定位 | 地图、时间线、3D 仍是路线图 | 先实施 EV-041；EV-051 仅作为 P3 实验，不影响二维可访问性 |

每条决策都经过“学习、局部重实现、保持现有特色、许可证复核”四步；本仓库没有复制上述项目的源代码或把 GPL/AGPL/非 OSI 组件直接加入依赖。

## 2. 能力矩阵

| 能力 | 本项目现状 | 竞品常见做法 | 差距/升级方向 |
|---|---|---|---|
| GEDCOM 交换 | GEDCOM 5.5.1/7 + CSV/JSON 导入导出，带预览/事务 | Gramps、webtrees、Ancestris、GEDCOM Navigator | 增加兼容性样本库和导入差异报告（EV-011/013） |
| 证据与来源 | Prisma 有来源、引用、证据等级，页面已有边界文案 | Gramps/Zain-Bangash 更强调来源链 UI | 将来源链、信心和矛盾点可视化（EV-018/038） |
| 隐私 | 私有族谱、在世人物降级、协作者权限、敏感字段加密 | webtrees/Gramps Web 按树/用户策略控制 | 多树策略和可审计授权界面（EV-021/022/039） |
| 复杂关系 | 生物学/收养/监护等关系、循环和数量校验 | GeneWeb/Gramps 支持复杂关系 | 增加关系路径解释、冲突工作台（EV-019/020/041） |
| 本地优先 | 本地部署可运行，Redis/存储可 fallback | TreeMonk/RootFree/openom 更彻底离线 | 加密离线队列、冲突合并、恢复密钥（EV-040） |
| 图谱渲染 | 纵向/横向/网络/时间轴，导出 SVG/PNG/PDF | React Flow、D3、3D force、renderer packages | 图渲染器独立化、键盘/移动体验、视觉回归（EV-020/042/043） |
| 研究工作区 | 历史寻根、迁徙、地点和资料中心 | Ancestris/GeneWeb 有报告、地图、时间线 | 时间线/地图/证据板组合视图（EV-041） |
| 搜索 | PostgreSQL/pg_trgm，已补人物姓氏检索 | Navigator/大型 Web 项目常用索引或搜索服务 | 先基准测试，后决定 OpenSearch/Meilisearch（EV-037） |
| 数据质量 | 资料体检、重复提示、关系检查 | Ancestris/ged2svg/Origins 也有一致性校验 | 增加批处理、修复建议和可追踪报告（EV-013/014） |
| 发布与自托管 | Docker/Nginx/systemd/updater/备份，签名链路未做生产演练 | 多数竞品偏桌面或手工部署 | SBOM、签名资产、回滚/灾备演练（EV-029/045/050） |

## 3. 可迁移的设计结论

1. **交换标准优先**：GEDCOM 是跨产品迁移底座，但不能承载本项目全部隐私、证据和非生物学关系；导入必须保留未知/待核实状态。
2. **来源不是备注字段**：来源、引用、信息提供者、确定性和冲突应形成可追溯链，而不是只留一段自由文本。
3. **本地优先必须连同恢复设计**：离线和端到端加密不是把 IndexedDB 加上即可，密钥轮换、设备丢失、冲突合并和审计必须先定义。
4. **图谱是渲染器，不是领域模型**：借鉴 Kinship、Progenies 和 `@memoir/tree`，将布局、可访问性、导出和数据查询分层。
5. **复杂家庭关系要显式解释**：借鉴 GeneWeb/Gramps，路径查询应说明“为什么得到这个称谓”，而不是只画一条边。
6. **许可证是架构约束**：GPL/AGPL 项目适合学习接口和用户体验，但不能无视传染性许可；MIT 项目也必须独立审查依赖和版权。

## 4. 本项目的相对优势与短板

优势：中文姓氏/历史寻根场景更深；在世人物和私有族谱默认保护更明确；关系类型、证据等级、导入事务和 7 种导出均已落地；本轮有安全审计与回归证据。
短板：离线/加密同步、来源链 UI、多树研究工作区、外部对象存储/OCR、搜索集群、生产签名更新和多浏览器覆盖尚未完成。

竞品研究只用于形成路线图，不构成“已达到竞品全部能力”的声明。对应的可执行条目见 [UPGRADE_ROADMAP.md](UPGRADE_ROADMAP.md)。
