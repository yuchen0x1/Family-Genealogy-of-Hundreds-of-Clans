# 安全审计报告

生成时间：2026-11-08 · 方法：对运行中的站点发起**真实 HTTP 请求**（`scripts/security-audit.mjs`）· 结果：**42 项通过 / 0 失败** · 机器可读：`reports/security-audit.json`

## 1. 审计范围与结果

| # | 类别 | 项数 | 结果 | 关键断言 |
| --- | --- | --- | --- | --- |
| 1 | HTTP 安全响应头 | 6 | 通过 | `nosniff`、`X-Frame-Options`、`Referrer-Policy`、`Permissions-Policy`、CSP `script-src`、不暴露 `X-Powered-By` |
| 2 | 会话 Cookie 与密码策略 | 7 | 通过 | 弱密码拒绝、合规注册、HttpOnly / SameSite / Path=/、响应体不含令牌原文、`/api/auth/me` 不含密码哈希 |
| 3 | CSRF | 1 | 通过 | 跨站 `Origin: https://evil.example.com` 的写请求返回 403 `CSRF_REJECTED` |
| 4 | 越权与隐私边界 | 16 | 通过 | 私有族谱与加密敏感字段创建成功；匿名访问成员/详情/图谱/导出/档案 5 类接口被拒；普通用户访问 4 个后台接口被拒；列表无 `sensitiveDataEncrypted`；匿名搜索不泄露私有族谱人物 |
| 5 | 注入与恶意输入 | 6 | 通过 | 脚本标签内容可提交但服务端 HTML 不产出可执行脚本；SQL 注入式查询不报错且无额外数据；姓氏查询参数化不泄露用户表；搜索接口不回显可执行脚本 |
| 6 | 文件上传与路径穿越 | 4 | 通过 | 伪装 PNG（`MAGIC_MISMATCH`）、可执行扩展名（`UNSUPPORTED_FILE_TYPE`）、MIME 不符（`MIME_MISMATCH`）均被拒；下载接口版本号不接受路径 |
| 7 | 登录锁定与会话失效 | 5 | 通过 | 锁定账号创建、连续错误登录触发锁定、锁定期正确密码仍不可登录、退出成功、退出后会话立即失效 |
| 8 | 注册接口频率限制 | 1 | 通过 | 12 次探测中命中 429 |

复现：`pnpm test:reset-limits && pnpm test:security`（清理开发期限流计数后再跑；脚本把会打满限流桶的用例放在最后，避免污染功能用例）。

## 2. 已实现的安全控制

### 认证与会话
- scrypt 密码哈希（随机盐），密码 ≥8 位且含字母与数字；连续失败触发账号临时锁定（423）。
- 会话 token 随机生成，数据库**只存 SHA-256 摘要**；Cookie 为 HttpOnly + SameSite + `Path=/`；改密撤销其他设备，退出立即失效。
- 登录/注册统一错误信息，避免账号枚举。

### 权限与隐私
- RBAC 角色权限 + 家族级权限（OWNER/EDITOR/VIEWER）+ 人物级可见性；私有对象对无权访问者返回 403/404，不暴露存在性。
- 私有族谱默认不公开；在世人物 PUBLIC 自动降级为 FAMILY；公开视图裁剪字段，永不返回 `sensitiveDataEncrypted`。
- 人物敏感字段 AES-256-GCM 加密；版本快照、导出、个人数据导出均排除密文与密码哈希。
- 管理员不是超级读者：后台只处理元数据与状态，`smoke-admin.mjs` 已验证管理员无法读取私有族谱人物/详情/图谱/导出，搜索也不命中。
- 搜索结果按权限过滤；搜索记录只存规范化查询词与聚合数量，不记录被过滤掉的私有内容。
- 帖子列表把可见性条件与关键词条件组合在 `AND` 下，避免关键词 `OR` 覆盖权限表达式。
- 宗亲检索需用户主动授权且可撤回；分支关联需双方确认且不产生亲属关系；同姓自动合并开关在后台不可被打开。

### 传输与输入
- CSRF：`assertSameOrigin` 校验 `Origin`；无 Origin 的同源请求由 SameSite Cookie 兜底。
- 全站 CSP、`X-Content-Type-Options`、`X-Frame-Options`、`Referrer-Policy`、`Permissions-Policy`、`X-XSS-Protection`；关闭 `X-Powered-By`。
- SQL 全部走 Prisma 参数化查询；Zod 严格校验请求体；统一错误处理不向客户端回传堆栈。
- 查询词经 `normalizeSearchTerm` 剥离控制字符与 HTML 标签形态后再匹配、回显、持久化。
- 上传校验：扩展名白名单 + 声明 MIME 一致性 + magic bytes + 大小上限 + 文件名清洗；存储于 `public/` 之外，仅经鉴权接口下载；下载带 `nosniff`、`private, no-store`，内联预览使用 CSP `sandbox`。
- 限流：注册 8/小时、登录 15/5 分钟、搜索 60/分钟（Redis，降级为进程内）。`clientIpHash` 默认**不信任**客户端可伪造的 `X-Forwarded-For`。
- 关键写操作写审计日志：before/after、IP 的 HMAC 摘要、User-Agent。

## 3. 本轮发现并修复的问题

| 问题 | 风险 | 修复 |
| --- | --- | --- |
| `clientIpHash` 默认读取客户端传入的 `X-Forwarded-For` | 攻击者可伪造任意来源 IP，无限生成限流桶，绕过注册/登录/搜索限流 | `src/lib/api.ts` 改为仅当 `TRUST_PROXY=true` 时才读取；Nginx 配置用 `$remote_addr` **覆盖**而非追加该头；`.env.example` 增加 `TRUST_PROXY=false` 与说明 |
| 搜索接口把 `<script>alert(1)</script>` 原样回显并写入 `search_records` | 查询词被持久化，若将来展示端改用 `innerHTML` 或日志导出为 HTML 将形成存储型 XSS | 新增 `normalizeSearchTerm`（剥离控制字符与标签形态），`searchAll`、`/api/search` 的回显/缓存键/搜索记录统一使用规范化结果；补 6 项单元测试与专项审计断言；复跑 42/42 通过 |
| 安全审计脚本自身缺陷 | 注册请求带 `anonymous:true` 导致会话 Cookie 未捕获、后续全部 401；限流测试排在前面堵住后续注册；`JSON.stringify(undefined)` 抛错中断报告生成 | 重写脚本：Cookie 捕获改为显式 `capture` 开关、限流用例移到末尾、全部断言加空值保护；报告现可正常生成 |

历史修复（开发过程中已完成并在冒烟测试中验证）：上传文件从 `public/uploads` 迁至 `.storage/uploads` 并强制鉴权下载；帖子列表权限表达式与关键词 `OR` 的优先级问题；协作者邮箱对非协作者裁剪；版本恢复必须 `RESTORE` 确认；导入预览不落库、确认后事务写入且关系默认未核实。

## 4. 威胁模型与残留风险

**不在本次自动化审计覆盖范围内**（需在生产部署或独立评估中处理）：

- 生产 TLS 证书与密钥管理、HSTS 预加载、证书自动续期；
- WAF、DDoS 防护、真实 CDN 与源站隐藏；
- 独立第三方渗透测试、依赖组件 CVE 扫描（如 `npm audit` / SCA）、容器镜像基线扫描；
- 社会工程、账号找回流程、内部运维人员越权（审计日志可追溯但不等于实时阻断）；
- 会话固定、CSRF 在「无 Origin + 宽松 SameSite 的旧浏览器」上的残余面；
- 备份文件与 `ENCRYPTION_KEY` 的离线保管、密钥轮换方案（当前更换密钥会导致旧密文无法解密，文档中已声明）；
- 多租户场景下的资源隔离与速率配额（当前为单实例限流分桶）。

**CSP 现状**：为兼容 Next.js 与 ECharts，开发配置保留了 `script-src 'unsafe-inline' 'unsafe-eval'`。生产上线建议改用 nonce/hash 策略并移除 `unsafe-eval`，同时复测图谱与导出功能。该项属于已知加固项，未标记为已完成。

## 5. 外部依赖的明确标注

S3 兼容对象存储、外部 OCR、PostGIS、Meilisearch/OpenSearch、WebSocket 实时协作、真实历史数据授权均**未提供凭证或授权**，代码在缺失时返回明确依赖错误（如 `OCR_NOT_CONFIGURED`），不伪造结果、不静默降级。生产 HTTPS 证书、WAF、独立渗透测试与生产 CDN 需由部署方补齐。
