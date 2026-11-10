# 测试报告

本报告只记录**本次实际执行并观察到结果**的验证；未执行的项目在最后一节明确列出。机器可读结果见 `reports/security-audit.json`、`reports/perf-report.json`。

生成时间：2026-11-08（2026-11-09 升级轮复测更新）；环境：Windows 开发机，Next.js dev / `next start` 单实例，PostgreSQL 17（本地官方二进制），Redis 7，Chromium。

## 1. 汇总

| 类别 | 命令 | 断言数 | 结果 |
| --- | --- | --- | --- |
| 单元测试 | `pnpm test` | 85 | 全部通过 |
| 核心后端冒烟 | `pnpm test:smoke` | 27 | 全部通过 |
| 族谱前端依赖接口 + 页面可达性 | `pnpm test:smoke:ui` | 54 | 全部通过 |
| 档案中心 + 导入导出 | `pnpm test:smoke:archive` | 71 | 全部通过 |
| 宗亲社区 + 用户中心 | `pnpm test:smoke:community` | 89 | 全部通过 |
| 管理后台 + 隐私边界 | `pnpm test:smoke:admin` | 64 | 全部通过 |
| 浏览器 E2E（桌面 + 移动端） | `pnpm test:e2e` | 11 | 全部通过 |
| 安全审计（真实 HTTP） | `pnpm test:security` | 42 | 全部通过 |
| **自动化断言合计** | — | **443** | **0 失败** |
| 静态检查 | `pnpm lint`、`pnpm typecheck` | — | 无错误 |
| 生产构建 | `pnpm build` | 41 个静态页 / 63 个 API 路由 / 20 个页面 | 通过（编译 35.5s） |
| 生产启动 | `PORT=3100 pnpm start` | `/api/health`、`/`、`/surnames` 均 200 | 通过 |
| 备份 / 恢复演练 | `pnpm db:backup` + 影子库恢复 | 47 张表 / 1017 行 | 恢复行数与快照一致 |
| 性能基线 | `pnpm test:perf` | 11 端点 ×3 + 60 并发 + 5 种导出 | 0 异常 |

## 2. 单元测试（Vitest，85 项）

| 文件 | 项数 | 覆盖 |
| --- | --- | --- |
| `src/tests/kinship.test.ts` | 18 | 直系、外祖父母、旁系、伯叔、堂兄弟、侄子、姻亲、收养、未核实关系不参与计算 |
| `src/tests/genealogy-io.test.ts` | 14 | CSV/JSON/GEDCOM 5.5.1/7.0/SVG 生成与解析、导入报告、缺字段与悬空引用 |
| `src/tests/validation.test.ts` | 12 | 注册/登录/家族/人物/关系/帖子/评论/私信 schema 边界与默认值（私有优先、在世保护、长度上限） |
| `src/tests/crypto.test.ts` | 11 | scrypt 哈希往返与畸形格式、token 摘要、IP 脱敏、AES-256-GCM 加解密/篡改检测/缺密钥报错 |
| `src/tests/graph-layout.test.ts` | 12 | 世代推导、纵向/横向布局、配偶吸附、子女居中、去重叠、时间轴 |
| `src/tests/permissions.test.ts` | 6 | `canViewPersonDetails` 可见矩阵：协作者全见、私有族谱全拒、在世非 PUBLIC 不给详情、已故 PRIVATE 不泄漏 |
| `src/tests/audit-sanitize.test.ts` | 6 | 审计载荷脱敏：敏感字段替换、超长截断、嵌套递归、深度上限 |
| `src/tests/search-term.test.ts` | 6 | 查询词规范化：中文/拼音不受影响、脚本标签剥离、控制字符、长度截断 |

## 3. HTTP 冒烟测试（305 项）

- **smoke（27）**：注册登录、私有族谱不出现在公开列表、人物 CRUD、重复关系与血缘环拦截、图谱节点/边、亲属称谓、祖先追溯、软删除恢复、版本快照、匿名越权。
- **smoke-ui（54）**：族谱相关页面 200、协作者编辑字段、敏感字段加密往返、在世人物 PUBLIC 自动降级为 FAMILY、回收站、关系核实状态切换、世代/字辈诗/分支、版本恢复必须 `RESTORE` 确认、邀请链接与邮箱裁剪、族谱公开/改回私有后匿名可见字段差异。
- **smoke-archive（71）**：上传扩展名/MIME/magic bytes 校验、文件不写入 `public/`、静态直连不可访问、受控下载与 `no-store`、历史版本、OCR 未配置明确报错且不自动建关系、档案—人物关联与审核可见性、7 种导出真实字节、导入预览不落库、跳过行、显式确认后事务写入、导入关系默认 `UNVERIFIED`、第三位生物学父母被拦截。
- **smoke-community（89）**：PRIVATE/FAMILY/PUBLIC 帖子权限、关键词检索不泄露私有帖、评论两级树、举报去重、私信收发与第三方隔离、通知未读数、宗亲检索授权与撤回、分支关联双确认且不创建亲属关系、改密撤销会话、个人数据导出、账号注销与公开内容下线。
- **smoke-admin（64）**：匿名/普通用户访问 8 个后台接口全被拒、总览不返回人物明细、**管理员不能读取私有族谱人物/详情/图谱/导出/搜索命中**、停权后会话失效、举报处理不自动删内容、史料与姓氏审核、审计日志、系统设置白名单与「同姓自动合并开关不可打开 / 隐私默认策略不可放宽」。

## 4. 浏览器 E2E（Playwright，11 项）

- 桌面 8 项：公开页面与搜索跳转、百家姓详情、历史寻根、社区/说明/法务/登录注册页、登录创建族谱并录入人物、社区发帖与评论。
- 移动端 3 项（Chromium 模拟 Pixel 5）：菜单展开与主要栏目可达、10 个主要公开页面无横向溢出、登录表单可操作。移动端首页曾发现 469px 横向溢出（`scrollWidth 862 / clientWidth 393`），已通过显式 `grid-cols-1` 修复，复测溢出为 0。

## 5. 安全审计（42 项，真实 HTTP）

8 类共 42 项全部通过，详见 `docs/SECURITY_AUDIT.md`。其中包括：安全响应头、HttpOnly/SameSite/Path Cookie、弱密码拒绝、CSRF 跨站拒绝、匿名访问 5 类私有资源被拒、普通用户访问 4 个后台接口被拒、加密敏感字段不出现在列表、匿名搜索不泄露私有族谱人物、XSS 存储与渲染、SQL 注入参数化、3 类上传伪装拒绝、路径穿越、登录锁定、退出后会话失效、注册限流。

本轮审计发现并修复了一个真实缺陷：搜索接口原样回显 `<script>` 查询词并写入搜索记录，已通过 `normalizeSearchTerm` 剥离标签形态后再匹配/回显/持久化，并补 6 项单元测试与专项断言，复跑 42/42 通过。

## 6. 性能基线（`reports/perf-report.json`）

预热后测量（排除 Next.js dev 首次按需编译开销）：

```
顺序请求 p50：19 ~ 224ms；p95：24 ~ 382ms；11 个端点全部 200
并发读取：20 并发 × 3 轮 = 60 次，成功 60 / 失败 0，p50 156ms，p95 250ms，max 252ms
图谱局部加载：44ms（服务端节点上限 200）
5 种导出：JSON 52ms、GEDCOM551 29ms、SVG 36ms、PNG 35ms、PDF 26ms
异常端点 0 个
```

阈值：顺序 p95 ≤ 5000ms、并发失败 0。首次未预热时姓氏列表 p95 曾达 6540ms，排查为 dev 首次按需编译，加入预热阶段后稳态为 81ms。**这是开发机单实例基线，不是生产压测**；生产需用 `next build + next start` 按真实并发重新测量。

## 7. 数据库备份与恢复演练

```
[backup] 模式：逻辑快照（本机缺少 pg_dump）
[backup] 47 张表，1017 行数据，84948 字节，sha256 b500acfe...，gzip + 行数/列完整性校验通过
[backup] --verify 校验通过
在 xungen_shadow 影子库：prisma migrate deploy（3 个迁移）→ --restore --i-understand → 共写入 1017 行
独立核对：表数 47，总行数 1017（与快照一致）
```

演练后已清空影子库，主库数据未被修改。生产环境检测到官方 `pg_dump`/`pg_restore` 时会改用 custom 格式备份。

## 8. 未执行 / 未覆盖（不伪造）

| 项目 | 原因 |
| --- | --- |
| `docker build` / `docker compose up` | 本机 Docker 引擎依赖的 `wsl.exe` 被环境策略阻断；已在 `docs/DEPLOYMENT.md` 标注为首次上线的必做验证 |
| 真实生产 HTTPS 证书 / 域名 / WAF / CDN | 无凭证与基础设施，仅提供 Nginx 配置与自签证书生成脚本 |
| 外部 OCR、S3 兼容对象存储、PostGIS、Meilisearch/OpenSearch、WebSocket 实时协作 | 未提供服务凭证或授权；代码返回明确依赖错误，不静默降级 |
| 大规模并发压测、长时间稳定性测试 | 仅做 60 次并发的开发机基线 |
| 独立第三方渗透测试、代码安全审计 | 需外部团队；本报告仅覆盖自建 42 项自动化审计 |
| Safari / Firefox / 真机移动端 | Playwright 仅安装 Chromium；移动端为 Chromium 模拟 Pixel 5 |
| 系统性无障碍（a11y）审计、国际化 | 未纳入本次范围 |
| 真实历史数据授权与批量史料录入 | 无授权来源；平台坚持「无来源不生成」，当前为少量可核验基础资料 + 明确标注的演示数据 |
