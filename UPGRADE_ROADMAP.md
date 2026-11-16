# 项目升级路线图

路线图基于 2026-11-16 的源码审计、18 个开源项目研究和本机回归结果。每一项都有唯一 ID；“已实现/已验证”是本轮或已有代码的证据，不代表所有部署环境都已经验收。

## P0/P1：本轮已实现的硬化项

| ID | 优先级/状态 | 问题与升级目标 | 参考/模块 | 验收标准 |
|---|---|---|---|---|
| EV-001 | P0 已实现 | 在世人物不得因 PATCH 部分字段被公开 | webtrees 隐私策略；`permissions.ts`, member routes | 任何最终 `isLiving=true` 且请求 PUBLIC 都落为 FAMILY；单测通过 |
| EV-002 | P1 已实现 | 全站人物搜索应命中姓氏 | Gramps 搜索；`src/lib/search.ts` | 输入 surnameText 可返回人物；新增单测通过 |
| EV-003 | P0 已实现 | 在 API 边界统一拒绝非法 UUID | GeneWeb/REST API 边界；`src/lib/api.ts` | 已知 UUID 参数收到非法值返回 400/INVALID_ID，不进入 Prisma |
| EV-004 | P0 已实现 | 生产禁止默认会话密钥 | OWASP secret hygiene；`src/lib/crypto.ts` | production 且缺 SESSION_SECRET 时启动相关调用抛错；开发行为不变 |
| EV-005 | P1 已实现 | 过期会话及时标记撤销 | webtrees session cleanup；`src/lib/auth.ts` | 过期 session 不返回用户，并异步更新 revokedAt/status |
| EV-006 | P1 已实现 | 健康检查覆盖文件存储可用性 | 自托管运维；`storage.ts`, `/api/health` | DB/存储任一不可用时健康接口 503；响应包含 storage |
| EV-007 | P0 已实现 | 构建追踪不得包含用户上传档案 | 安全发布实践；`next.config.ts`, `storage.ts` | `pnpm build` 不出现 upload trace 警告，运行期目录不进发布包 |
| EV-008 | P1 已实现 | 收紧 CSP 脚本与对象策略 | OWASP CSP；`next.config.ts` | production CSP 无 unsafe-eval 且有 object-src none；unsafe-inline 留有专项跟踪 |
| EV-009 | P1 已实现 | Redis fallback 测试限流可跨进程清理 | 单实例测试可靠性；cache/reset script | 连续 5 套 smoke 每套前 reset 后全部通过，不依赖人工重启 |
| EV-010 | P1 已实现 | 性能报告标注真实缓存模式 | 可观测性；`scripts/perf-check.mjs` | 报告环境来自 `/api/health.cache`，Redis/memory 不再写死 |

## P1：已有能力的可验证升级项

| ID | 优先级/状态 | 问题与升级目标 | 参考/模块 | 验收标准 |
|---|---|---|---|---|
| EV-011 | P1 已验证 | 保持 GEDCOM 5.5.1/7、CSV、JSON 交换兼容 | Gramps/webtrees；`genealogy-io.ts` | archive smoke 覆盖预览、确认、导入和导出；未知关系不被擅自转为血缘 |
| EV-012 | P1 已验证 | 导入预览、事务和并发幂等 | Origins；import routes/jobs | 同一任务并发只提交一次；预览不落库；失败事务可回滚 |
| EV-013 | P1 已验证 | 年代/世代/关系资料体检 | Ancestris/ged2svg；quality libs | 11 类问题分级、分页、定位；不自动改写事实 |
| EV-014 | P1 已验证 | 疑似重复人物提示 | Gramps/Ancestris；duplicate lib | 只提示不自动合并；置信度和判定依据可读；规模上限生效 |
| EV-015 | P1 已验证 | 版本快照与显式恢复确认 | Origins Git 思路；versions routes | 快照排除敏感密文；恢复必须提交 RESTORE；审计可追溯 |
| EV-016 | P1 已验证 | 敏感字段加密与导出脱敏 | openom；crypto/member routes | AES-GCM 密文不出现在公开图谱、交换文件和个人导出 |
| EV-017 | P1 已验证 | 私有档案存储与下载鉴权 | Gramps Web；storage/document routes | 文件不在 public；下载按族谱/协作者校验；伪造 MIME/路径被拒 |
| EV-018 | P1 已验证 | 来源、引用、证据等级模型 | Gramps/Zain-Bangash；schema/source libs | 资料有来源/引用/审核状态；未核实关系显式保留 |
| EV-019 | P1 已验证 | 关系循环与双亲数量校验 | GeneWeb/Gramps；`genealogy.ts` | 自身关系、亲子循环、超过两个生物学父母被阻止或标警告 |
| EV-020 | P1 已验证 | 关系路径与图谱节点上限 | GeneWeb/Kinship；graph/kinship routes | 查询可返回路径；零层参数有效；大图受 cap 保护 |
| EV-021 | P1 已验证 | 家族/人物按查看者裁剪 | webtrees；permissions/genealogy | 匿名、查看者、协作者分别看到合法字段；在世年份不泄露 |
| EV-022 | P1 已验证 | 管理后台隐私边界 | webtrees admin model；admin routes | 普通用户不能读/写管理接口；安全审计 admin 用例全通过 |
| EV-023 | P1 已验证 | 审计日志脱敏与可追踪 | Gramps Web；`audit.ts` | 不写密码、密文、完整 token；事件含主体和时间 |
| EV-024 | P1 已验证 | CSRF 同源与写请求兜底限流 | OWASP；`api.ts`, cache | Origin 不匹配返回 CSRF_REJECTED；新增写路由自动受兜底限流保护 |
| EV-025 | P1 已验证 | 登录锁定与会话管理 | webtrees；auth routes | 错误尝试计数/锁定；logout/撤销后访问被拒；冒烟和安全审计通过 |
| EV-026 | P1 已验证 | OCR 仅作人工复核输入 | 文档工作流；archive routes | 未配置 OCR 返回明确依赖错误；不会伪造识别结果或自动写入家谱 |
| EV-027 | P1 已验证 | 七种展示/交换导出 | ged2svg/Gramps；export libs | JSON/CSV/GEDCOM/SVG/PNG/PDF 等格式响应正确、权限正确 |
| EV-028 | P1 已验证 | 数据库+档案备份安全 | 自托管实践；backup/snapshot scripts | 备份包含 DB 与 uploads；恢复演练可读；路径与权限受限 |
| EV-029 | P1 部分完成 | 更新器完整性和签名就绪 | GitHub Release/updater | 资产大小/SHA-256/路径/版本校验；签名缺失时按策略拒绝；真实 `.sig` 发布待预发 |
| EV-030 | P1 部分完成 | CI 与本地质量门禁 | 工程基线；`.github/workflows`, scripts | lint/typecheck/test/build/smoke/security/perf 本地可复现；远程 CI 链接待发布时重跑 |

## P1/P2：下一阶段可执行升级

| ID | 优先级/状态 | 问题与升级目标 | 参考/模块 | 验收标准 |
|---|---|---|---|---|
| EV-031 | P1 计划 | CSP 从 unsafe-inline 迁移到 nonce/hash | OWASP/Next.js；layout/middleware | production 页面无 unsafe-inline；ECharts、登录和导出页面仍通过 E2E |
| EV-032 | P1 计划 | Redis HA、限流指标和故障告警 | webtrees/自托管；cache/ops | 多实例共享计数；Redis 故障可观测；超限、恢复、延迟有指标 |
| EV-033 | P1 计划 | S3 兼容对象存储适配器 | Gramps Web；storage adapter | MinIO/S3 预发上传、下载、删除、签名 URL 和故障回退均有集成测试 |
| EV-034 | P1 计划 | OCR provider + 队列 + 人工确认 | 文档/OCR 产品；archive/jobs | provider 超时可重试；结果标待审核；无凭证时明确 OCR_NOT_CONFIGURED |
| EV-035 | P1 计划 | 大型导入/导出后台任务 | Progenies/updater jobs | HTTP 只创建 job；进度、取消、失败原因可查询；重复提交幂等 |
| EV-036 | P1 计划 | 乐观并发控制 | Origins 版本思路；member/version routes | PATCH 携带 expectedVersion；版本不匹配 409；客户端可重新加载 |
| EV-037 | P2 计划 | 中文全文检索扩展 | OpenSearch/Meilisearch 方向；search | 用真实规模基准比较 pg_trgm 与外部索引；迁移可重建且无明文敏感字段 |
| EV-038 | P1 计划 | 证据来源链与确定性 UI | Gramps/Zain-Bangash | 人物/关系可查看信息提供者、来源、证据等级和冲突说明 |
| EV-039 | P1 计划 | 多族谱 dashboard 与研究工作板 | webtrees/Origins | 用户能切换多个族谱、聚合任务/来源/待核实项，权限不串树 |
| EV-040 | P1 计划 | 离线、本地优先、加密同步 | TreeMonk/RootFree/openom | 断网可编辑；冲突可解释合并；设备撤销/密钥恢复/审计通过威胁模型 |
| EV-041 | P2 计划 | 时间线、地图、资料研究 workspace | Ancestris/GeneWeb/family-plot | 事件、地点、来源可联动；公开视图不泄露在世精度位置/日期 |
| EV-042 | P1 计划 | 移动端图谱和键盘无障碍 | `@memoir/tree`/Open Family Tree | 键盘可聚焦/缩放/读出；移动端无横向溢出；真实辅助技术抽测 |
| EV-043 | P2 计划 | 视觉回归快照 | Playwright；e2e | 桌面/移动关键页面有基线截图；变化需人工批准；失败附 trace |
| EV-044 | P1 计划 | SBOM、依赖 CVE 与镜像扫描 | 供应链安全；CI | PR/发布生成 SBOM；高危依赖或镜像漏洞阻断发布并保留例外记录 |
| EV-045 | P0 计划 | 真实生产签名发布与更新 E2E | updater/CI | 真实 `.sig`、公钥、备份、安装、重启、健康、版本和回滚全部在预发通过 |
| EV-046 | P2 计划 | 定时会话/审计/临时文件清理 | auth/audit/jobs | 过期 session、旧上传临时文件和历史审计按保留策略清理；任务可观测 |
| EV-047 | P2 计划 | 版本化公开 API/OpenAPI | docs/API.md | 生成 OpenAPI；版本/弃用策略明确；SDK/契约测试覆盖核心读写 |
| EV-048 | P1 计划 | 请求 ID、结构化指标和链路日志 | observability；api/audit | 每请求有 requestId；错误日志可关联用户/路由/耗时但不含密文 |
| EV-049 | P2 计划 | 通知/事件投递可靠性 | community/notifications | 事件幂等、重试、失败可见；通知不会重复或越权 |
| EV-050 | P0 计划 | 灾备恢复演练纳入 CI/预发 | backup/deploy | 定期从备份恢复 DB+uploads，校验行数、哈希、权限和 `/api/health` |
| EV-051 | P3 计划 | 实验性 3D/静态分享视图 | family-plot/ged2svg；graph/export | 在不影响二维无障碍视图的前提下提供可选 3D 或纯静态分享；大图有节点上限和隐私裁剪 |

## 逐项实施登记（补齐方案、效果、文件与难度）

上面的优先级表用于排序；本节为每个 EV 编号补齐执行字段：升级名称/模块、当前问题与证据、参考项目的具体做法、我们的改进方案、预期效果、文件/模块、实施难度和验收标准。`低/中/高`按代码改动范围、外部依赖和回滚难度估计。

| ID | 名称/模块 | 当前问题与证据 | 参考项目的做法 | 我们的方案与预期效果 | 文件/难度 | 验收标准 |
|---|---|---|---|---|---|---|
| EV-001 | 在世人物可见性 / 权限 | PATCH 只写 visibility 可能绕过在世默认保护；由 member route 检查发现 | webtrees 按人员隐私策略裁剪 | 以最终 `isLiving` 归一化可见性，避免公开泄露 | `permissions.ts`、member routes / 低 | living + PUBLIC 最终为 FAMILY，单测和 smoke 通过 |
| EV-002 | 姓氏人物搜索 / 搜索 | 全站 OR 漏掉 `surnameText`；源码与用户承诺不一致 | Gramps 搜索索引姓、名、别名 | 加入姓氏条件，提升中文寻根命中率 | `src/lib/search.ts` / 低 | 姓氏关键字可返回人物且单测通过 |
| EV-003 | UUID 边界 / API | 非法 UUID 交给 Prisma，错误不一致 | GeneWeb/REST 在入口校验 ID | 统一 400 `INVALID_ID`，减少内部错误泄漏 | `src/lib/api.ts` / 中 | 所有已知 ID 参数非法值均在 handler 前拒绝 |
| EV-004 | 生产密钥 / 加密 | 缺 SESSION_SECRET 会使用开发默认值 | OWASP fail-fast secret hygiene | 生产缺密钥直接报错，开发保留明确 fallback | `src/lib/crypto.ts` / 低 | production 缺 secret 的测试抛错 |
| EV-005 | 过期会话 / 认证 | 过期记录长期保留，增加会话表噪音 | webtrees 过期 session 清理 | 读取时异步标记 revoked，减少陈旧会话 | `src/lib/auth.ts` / 低 | 过期 session 不返回用户并被撤销 |
| EV-006 | 存储健康 / 运维 | DB 正常但 uploads 不可写仍报告健康 | 自托管产品把依赖纳入 readiness | health 返回 storage 并在不可用时 503 | `storage.ts`, health route / 中 | DB/存储任一故障时状态准确 |
| EV-007 | 构建 trace / 发布安全 | 动态上传目录可能被 Turbopack 打包 | 发布构建排除运行期数据 | 固定默认目录并排除 trace，防止档案进入产物 | `storage.ts`, `next.config.ts` / 中 | build 无 trace 警告，产物不含 uploads |
| EV-008 | CSP / 安全头 | 存在 unsafe-eval 和缺失 object-src | OWASP CSP 最小策略 | production 移除 unsafe-eval、增加 object-src none | `next.config.ts` / 低 | security 42/42，CSP 只保留已知 inline 残留 |
| EV-009 | fallback 限流 / 测试稳定性 | 外部 reset CLI 无法访问进程内 counters | 单实例 fallback 需可运维清理 | marker 文件触发进程内清理，连续套件不互相污染 | `cache.ts`, reset script / 中 | 5 套 smoke 逐套 reset 后全绿 |
| EV-010 | 性能报告 / 工程化 | 报告固定写 Redis，掩盖真实环境 | 运行时健康信息驱动指标标签 | 从 `/api/health.cache` 读取模式，避免误导 | `scripts/perf-check.mjs` / 低 | report environment 与 health 一致 |
| EV-011 | GEDCOM 交换 / 导入导出 | 标准无法表达全部关系，误转会损失语义 | Gramps/webtrees 保留 GEDCOM 扩展/未知关系 | 5.5.1/7 交换并保留未知、待核实关系 | `genealogy-io.ts` / 高 | archive smoke 的导入导出与未知关系断言通过 |
| EV-012 | 导入幂等 / import jobs | 并发确认可能重复写入 | Origins 用版本/事务保护变更 | 条件更新抢执行权，预览不落库，失败事务回滚 | import routes/jobs / 高 | 并发只提交一次，失败无半成品 |
| EV-013 | 资料体检 / quality | 年代、世代、循环问题容易靠人工发现 | Ancestris/ged2svg 一致性报告 | 11 类分级检查、分页、定位且只报告不改事实 | quality libs/routes / 中 | 规则覆盖、级别和定位 smoke 通过 |
| EV-014 | 重复核对 / duplicate | 同名人物可能被误合并 | Gramps 只提供候选和依据 | 分桶、置信度、规模上限，绝不自动合并 | duplicate lib/routes / 中 | 置信度和规模测试通过，无自动 merge |
| EV-015 | 版本恢复 / versions | 恢复错误可能覆盖当前族谱 | Origins 使用版本化变更 | 快照脱敏，RESTORE 确认，审计恢复 | versions routes / 中 | 无确认拒绝，确认后可恢复并留痕 |
| EV-016 | 敏感字段 / crypto | 出生日期、联系方式不应出现在公开交换 | openom 端到端加密取向 | AES-GCM 存储并在图谱/导出/个人导出脱敏 | crypto/member/export / 高 | 密文和密码哈希不出现在公开输出 |
| EV-017 | 档案存储 / documents | public 目录或下载越权会暴露史料 | Gramps Web 私有媒体鉴权 | 私有目录、魔数/MIME 校验、按协作者鉴权下载 | storage/document routes / 中 | 路径穿越、伪造文件、匿名下载均失败 |
| EV-018 | 证据来源 / sources | 事实若只有备注无法追溯 | Gramps 来源/引用模型、Zain certainty | 来源、引用、审核和证据等级进入可追溯模型 | schema/source libs / 中 | 每条关键资料有来源状态，未核实关系保留 |
| EV-019 | 关系约束 / genealogy | 自身关系、循环、第三位生物学父母损坏数据 | GeneWeb/Gramps 关系校验 | 写入前校验并返回可读错误，收养/监护分开 | `genealogy.ts` / 中 | 关系 smoke 阻止非法图并保留合法非血缘边 |
| EV-020 | 路径与图谱 / graph | 大族谱图可能爆炸，称谓需要解释 | GeneWeb 路径报告、Kinship React Flow | 服务端 cap、路径查询、零层参数和解释性边 | graph/kinship routes / 高 | cap=200 等边界与路径测试通过 |
| EV-021 | 家族隐私 / permissions | 匿名、查看者、协作者字段范围不同 | webtrees 每树/每人隐私策略 | 统一裁剪人物、图谱、统计、搜索和导出 | permissions/genealogy / 高 | privacy/admin smoke 全通过 |
| EV-022 | 管理后台 / admin | 管理权限不能等同于读取私有家谱 | webtrees 管理与族谱权限分离 | admin 只管平台资源，不越过家族隐私边界 | admin routes / 中 | 管理员读取私有人员/图谱/导出均被拒 |
| EV-023 | 审计脱敏 / audit | 日志可能误写 token、密文、密码 | Gramps Web 事件审计 | 递归脱敏、长度/深度上限和主体追踪 | `audit.ts` / 中 | audit 单测确认敏感值不落日志 |
| EV-024 | CSRF/限流 / API | 新写路由容易漏手工限流 | OWASP 同源 + 统一 middleware | Origin 严格匹配，route 统一兜底，敏感接口叠加 | `api.ts`, cache / 中 | 跨站写 403，新增写路由有 429 保护 |
| EV-025 | 登录锁定 / auth | 暴力尝试和旧会话需收敛 | webtrees session/lockout | 失败次数、锁定、logout、撤销和审计组合 | auth routes / 中 | 安全审计及 community smoke 全通过 |
| EV-026 | OCR 边界 / archive | 没有 provider 时不能假装识别成功 | 文档系统把 OCR 结果置人工审核 | 明确 `OCR_NOT_CONFIGURED`，结果不自动建关系 | document OCR route / 中 | 无凭证返回依赖错误，人工确认前不写事实 |
| EV-027 | 多格式导出 / export | 单一格式无法覆盖展示和迁移 | ged2svg 静态 SVG、Gramps 交换 | JSON/CSV/GEDCOM/SVG/PNG/PDF 共享权限裁剪 | export libs/routes / 高 | 7 种格式真实字节、权限和内容断言通过 |
| EV-028 | 备份恢复 / backup | 只备数据库会丢上传档案 | 自托管产品双通道备份 | DB + uploads、哈希、非空目标保护和影子恢复 | `scripts/backup.mjs` / 高 | 48 表/文件恢复演练一致 |
| EV-029 | 更新完整性 / updater | 摘要校验不等于真实签名，线上附件未验 | GitHub Release asset + detached signature | 已实现大小/SHA/路径/版本/可选签名门禁；生产签名待补 | updater/CI / 高 | 模拟包攻击被拒；真实 `.sig` 预发通过后才标完成 |
| EV-030 | CI 质量门禁 / CI | 本地全绿不等于远程流水线已重跑 | 多数成熟项目把 lint/build/smoke 作为 release gate | 保留本地命令和 CI 配置，发布时重跑远程 | `.github/workflows`, scripts / 中 | 本地全绿；远程 CI 运行链接归档 |
| EV-031 | nonce/hash CSP / layout | unsafe-inline 仍是安全残留 | OWASP strict CSP | 迁移 Next/ECharts 动态样式和脚本到 nonce/hash | `next.config.ts`, layout / 高 | production 无 unsafe-inline 且 E2E 全绿 |
| EV-032 | Redis HA / ops | 多实例 memory fallback 不共享计数 | webtrees/自托管 Redis 共享状态 | Redis HA、连接池、指标、告警和降级演练 | cache/deploy/ops / 高 | 多实例限流一致，故障可告警和恢复 |
| EV-033 | S3 适配 / storage | 本地盘不适合多节点和大附件 | Gramps Web 对象/媒体存储 | S3/MinIO adapter、分片/签名 URL、失败回退 | storage adapter/CI / 高 | MinIO 集成上传下载删除全通过 |
| EV-034 | OCR 队列 / jobs | OCR 目前同步边界有限且无真实 provider | 文档队列重试/人工复核 | provider adapter、退避、状态机和人工确认 | documents/jobs / 高 | 超时可重试，结果不越权写入 |
| EV-035 | 异步导入导出 / jobs | 大任务占用 HTTP 请求，失败难续跑 | Progenies API/PWA 与任务分层 | job 创建、进度、取消、幂等和失败日志 | import/export jobs / 高 | 断网/重启后可查询最终状态 |
| EV-036 | 乐观并发 / versions | 同一人物并发编辑会互相覆盖 | Origins 版本化变更 | expectedVersion/ETag，冲突返回 409 和可重载信息 | member/version routes / 中 | 并发 PATCH 一成功一冲突，数据无静默覆盖 |
| EV-037 | 中文搜索扩展 / search | pg_trgm 规模上限未知 | OpenSearch/Meilisearch 索引 | 先真实数据基准，再可重建外部索引且过滤敏感字段 | search/index scripts / 高 | p95、重建、权限过滤和回退有报告 |
| EV-038 | 证据链 UI / sources | 模型存在但来源链可见性不足 | Zain informant chain/certainty ladder | 人物/关系侧边栏展示来源、提供者、确定性、冲突 | source components/routes / 中 | 证据链可查看、筛选且不泄露私有档案 |
| EV-039 | 多树工作区 / dashboard | 用户跨族谱切换和待办缺少统一入口 | webtrees 多树管理、Origins 研究流 | 多树 dashboard、来源任务和待核实队列按权限聚合 | dashboard/family routes / 高 | 切树不串数据，聚合指标可追踪来源 |
| EV-040 | 离线同步 / client data | 当前是可自托管，不是离线 CRDT | TreeMonk/RootFree/openom | 加密本地队列、设备密钥、冲突可解释合并和撤销 | client sync/crypto/server / 高 | 断网编辑、恢复密钥、冲突和审计场景通过 |
| EV-041 | 地图时间线 / research | 历史事件、地点、来源分散在不同页 | Ancestris/GeneWeb 视图组合 | 时间线、地点、迁徙和资料卡联动，精度按权限裁剪 | roots/components/graph / 高 | 事件联动、公开视图不泄露精确在世位置 |
| EV-042 | 移动/a11y 图谱 / UI | 图交互对键盘和小屏仍需深测 | `@memoir/tree` renderer/Open Family Tree | focus、读屏、键盘缩放、移动布局和空状态 | graph components/e2e / 中 | 键盘路径、Pixel/真机、无横向溢出 |
| EV-043 | 视觉回归 / e2e | 功能通过不保证布局未回归 | Playwright screenshot projects | 关键页桌面/移动基线、差异需人工批准 | `e2e/`, Playwright config / 中 | 关键视图快照稳定，失败带 trace |
| EV-044 | SBOM/CVE / CI | 锁文件和构建不能替代供应链门禁 | 发布流水线 SBOM/依赖扫描 | 生成 SBOM、扫描依赖和镜像，高危阻断并可审计例外 | CI/Docker / 中 | PR/release 有 SBOM，阈值策略生效 |
| EV-045 | 签名更新 E2E / updater | 当前没有真实签名附件和重启验收 | Release `.sig` + updater rollback | 预发密钥、备份、安装、重启、健康、版本和回滚闭环 | updater/deploy/CI / 高 | 真实 SOURCE/DOCKER 端到端通过 |
| EV-046 | 定时清理 / jobs | 过期 session、临时文件、审计会积累 | webtrees/后台维护任务 | 保留策略、dry-run、锁和失败告警 | auth/audit/cron / 中 | 重复执行幂等，清理范围和日志可审计 |
| EV-047 | OpenAPI / API docs | Markdown API 清单不能自动防漂移 | REST 项目契约生成 | 生成版本化 OpenAPI、弃用规则和契约测试 | `docs/API.md`, api tooling / 中 | spec 与路由一致，核心 SDK 契约通过 |
| EV-048 | requestId/metrics / observability | 错误跨请求关联困难，指标不统一 | 自托管可观测性实践 | requestId、结构化日志、耗时、状态和脱敏关联 | `api.ts`, audit, ops / 中 | 每请求可关联且日志无密文/token |
| EV-049 | 通知事件 / community | DB 通知缺少投递幂等和失败可见 | 社区事件队列 | outbox/idempotency/retry 和越权检查 | notifications/community/jobs / 高 | 事件不重复、不丢失，失败可重试 |
| EV-050 | 灾备演练 / deploy | 有备份脚本但未定期自动恢复 | 自托管恢复 rehearsal | CI/预发恢复 DB+uploads，校验行数、哈希、权限和 health | backup/CI/deploy / 高 | 定期演练产物可审计，恢复目标健康 |
| EV-051 | 3D/静态分享 / graph/export | 3D 可能增强探索但会牺牲可访问性/性能 | family-plot 3D、ged2svg 静态 SVG | 作为可选实验视图，二维/隐私裁剪仍为默认 | graph/export/components / 中 | 大图 cap、权限裁剪、二维无障碍不受影响 |

### 优先级口径

- **P0**：涉及隐私、数据恢复、生产升级或会导致错误发布，必须在生产前完成。
- **P1**：核心可靠性、可运维性和用户价值，作为下一迭代主线。
- **P2**：规模化、可访问性和体验增强，需在 P0/P1 稳定后推进。
- **P3**：探索性能力（例如 3D 图、更多客户端），本轮没有列入强制交付。

### 依赖与顺序

建议顺序为：EV-031/032/044（运行与供应链门禁）→ EV-033/034/035（外部服务与异步任务）→ EV-036/038/039/041（数据协作与研究体验）→ EV-040/043/045/050（离线、发布与灾备）。任何涉及敏感数据的新能力必须先补威胁模型和审计事件，再做 UI。
