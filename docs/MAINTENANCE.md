# 仓库维护与发布

`main` 是稳定分支。功能或修复从短期分支提交 PR，处理讨论并通过 CI 后再合并。紧急修复走同一路径，先处理数据与权限风险，再制作补丁版。遇到冲突时更新分支并重新执行检查。仓库目前按单维护者运行，PR 必审对话与检查，独立审批人数取决于有写权限的维护者数量。

## 版本发布

1. 从最新版 `main` 准备 PR，更新 `package.json` 版本、`CHANGELOG.md` 与 [面向用户的发布记录](releases/release-notes.md)。模块变更应标注桌面 Web、移动/PWA 和自托管影响。
2. 合并后在实际合并提交创建带注释的 `vMAJOR.MINOR.PATCH` 标签并推送该标签。发版 Action 只接受默认分支上可达的同版本提交。
3. 所有门禁完成后，发布任务生成压缩包、SHA-256、更新元数据和 CycloneDX SBOM。在 `release` 环境签发 GitHub 构建来源证明，上传到草稿、复下载比对后公开，再通过公开下载链接复查。
4. 在 [最新 Release](https://github.com/yuchen0x1/Family-Genealogy-of-Hundreds-of-Clans/releases/latest) 和 [Actions](https://github.com/yuchen0x1/Family-Genealogy-of-Hundreds-of-Clans/actions) 核对发布状态。已发布标签和资产出现问题时发布后续补丁，避免复用旧版本号。
5. 在隔离预发实例上先验证带备份的真实跨版本升级，再滚动发布到生产。SOURCE 脚本的文件恢复和数据库/档案备份见 [在线更新](AUTO_UPDATE.md) 与 [部署指南](DEPLOYMENT.md)。

## 自动化与状态入口

| 内容 | 核查位置 |
| --- | --- |
| 构建、迁移、HTTP、安全测试、Chromium E2E | [CI](https://github.com/yuchen0x1/Family-Genealogy-of-Hundreds-of-Clans/actions/workflows/ci.yml) |
| 依赖建议、漏洞告警和密钥扫描 | [Dependabot](https://github.com/yuchen0x1/Family-Genealogy-of-Hundreds-of-Clans/security/dependabot) 和仓库 Security |
| 最新版包、摘要、构建证明、许可清单 | [Releases](https://github.com/yuchen0x1/Family-Genealogy-of-Hundreds-of-Clans/releases/latest) |
| 每周重跑在线资产与依赖检查 | [Release Maintenance](https://github.com/yuchen0x1/Family-Genealogy-of-Hundreds-of-Clans/actions/workflows/sync-release-readme.yml) |
| 平台支持、功能差距、审计 | [兼容性](PLATFORMS.md)、[调研](../COMPETITOR_ANALYSIS.md)、[路线图](../UPGRADE_ROADMAP.md) |

每月在路线图评审时回看竞品近期 Release、未处理问题和兼容性变化。每次正式版本保留实际构建和验证证据。依赖升级优先确认锁文件、测试结果、许可证和迁移要求。Prisma Client 与 CLI 大版本升级需要配套迁移，单独的 Dependabot PR 通过不了时保持待审。

## 发布包许可与安全

项目沿用 MIT。源码发布包从 Git 提交归档，不附带依赖、数据库、上传档案或运行密钥。SBOM 记录依赖，而 Docker 构建会安装宣告的依赖。再次对外分发构建好的容器或依赖二进制时，应保留相关许可和归属，检查 Sharp/libvips 的 LGPL 条款与 caniuse-lite 的 CC BY 4.0 归属。工作流 SHA 固定后由 Dependabot 提交更新。报告安全问题请用 [私密安全报告](https://github.com/yuchen0x1/Family-Genealogy-of-Hundreds-of-Clans/security/advisories/new)。
