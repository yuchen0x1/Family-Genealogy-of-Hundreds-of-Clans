# 安全策略

## 报告漏洞

请**不要**通过公开 Issue 报告安全问题。

优先使用 GitHub 的私密报告通道：
仓库页面 → **Security** → **Report a vulnerability**（Security Advisory）。

如果该入口不可用，请通过以下方式联系维护者：

- 在 Issue 中**只**说明"发现一个安全问题，希望私下沟通"，不要写复现细节；
- 维护者会回复一个私密渠道。

请在报告中尽量包含：

| 项 | 说明 |
| --- | --- |
| 影响范围 | 受影响的接口 / 页面，以及需要什么身份（匿名 / 普通用户 / 协作者 / 管理员） |
| 复现步骤 | 最小可复现步骤，或可直接运行的请求 |
| 实际与预期 | 实际发生了什么、你认为应该是什么 |
| 数据性质 | 是否涉及私有族谱、在世人物、档案文件、凭据 |

**请勿**在报告中附带真实用户的个人信息、真实族谱数据或他人凭据。
如需演示，请使用本地 seed 的演示数据。

## 支持范围

只对最新发布版本（见 [Releases](https://github.com/yuchen0x1/Family-Genealogy-of-Hundreds-of-Clans/releases)）
与 `main` 分支的最新提交提供安全修复。

## 已实现的安全机制

完整的实现说明与 42 项真实 HTTP 审计结果见 [docs/SECURITY_AUDIT.md](docs/SECURITY_AUDIT.md)，摘要：

- 密码 `scrypt` 加盐哈希；会话为 HttpOnly + SameSite Cookie，改密/登出后旧会话失效
- 人物敏感字段 AES-256-GCM 字段级加密，列表接口不返回密文
- 家族默认 `PRIVATE`；公开族谱中在世人物详情降级，统计接口不做可反推生日的聚合
- 档案文件存于非公开目录，只能鉴权下载，静态直连不可访问
- 管理后台仅处理元数据与审核状态，管理员不能读取私有族谱的人物明细与档案正文
- 写操作同源校验（CSRF）、Zod 全量校验、参数化查询、多维限流、上传三重伪装检测
- 审计日志写入即脱敏（密码/令牌/私密正文替换、超长截断）

## 已知限制（不夸大）

| 项 | 现状 |
| --- | --- |
| CSP | 仍包含 `unsafe-inline` / `unsafe-eval` 以兼容 Next.js 与 ECharts；迁移到 nonce/hash 尚未完成 |
| 第三方渗透测试 | **未进行**，当前审计为项目自测 |
| 依赖 CVE 扫描 | 未接入流水线；`pnpm audit` 需手工执行 |
| 容器镜像扫描 | 未执行 |
| 多浏览器 / 真机安全测试 | E2E 仅覆盖 Chromium |

## 部署侧必做

正式部署前请确认：

1. 替换 `SESSION_SECRET`、`ENCRYPTION_KEY`、`POSTGRES_PASSWORD`（`.env.example` 中的值仅供开发）。
2. 删除或改密 seed 产生的演示账号与演示族谱。
3. 配置受信任的 HTTPS 证书，禁止明文 HTTP 对外提供服务。
4. 为 `UPLOAD_DIR` 配置独立磁盘并纳入备份。
5. 按 [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) 配置备份与更新流程。

## 致谢

确认的安全问题修复后，会在对应版本的 [CHANGELOG](CHANGELOG.md) 中致谢（如报告者希望匿名则省略）。
