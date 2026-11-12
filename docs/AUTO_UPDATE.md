# 在线自动更新

本项目是自托管 Web 应用，在线更新使用 **GitHub Releases + 服务端更新器**，不使用 Electron/Tauri 安装器。

## 工作流程

1. GitHub Actions 在 `vMAJOR.MINOR.PATCH` 标签上运行 lint、类型检查、单测、数据库冒烟和生产构建。
2. 通过后创建 GitHub Release，并上传 `xungen-<version>.tar.gz`、`.sha256`、`.update.json`。
3. 管理员后台读取配置的 GitHub 仓库，检查稳定版 Release 或 `main` 分支。
4. 稳定版只接受名为 `xungen-<version>.tar.gz` 的 Release 资产；下载后校验大小和 SHA-256，再检查归档安全性与 `package.json` 版本，最后才进入安装。
5. `SOURCE` 驱动交给独立进程安装依赖、构建并由 systemd/pm2 拉起；`DOCKER` 驱动写入共享标记，由 updater sidecar 使用 staging 源码重建 app 镜像。
6. 备份、下载、校验、构建或健康确认失败时保留旧版本并记录任务日志。

## 配置

```dotenv
APP_UPDATE_DRIVER=DOCKER
APP_UPDATE_REPO=yuchen0x1/Family-Genealogy-of-Hundreds-of-Clans
APP_UPDATE_CHANNEL=stable
APP_UPDATE_TOKEN=                 # 私有仓库或提高 GitHub API 配额时填写
APP_UPDATE_SKIP_BACKUP=false
APP_UPDATE_REQUIRE_SIGNATURE=false
APP_UPDATE_SIGNING_PUBLIC_KEY=    # 可选，PEM 公钥；配置后 Release 必须有 .sig
```

生产 Docker 部署还需要 `APP_UPDATE_PROJECT_DIR`，并且只有 updater sidecar 挂载 Docker socket。源码部署见 [DEPLOYMENT.md](./DEPLOYMENT.md) 第 11 节。

## 签名发布

SHA-256 校验默认强制执行。若要强制数字签名：

1. 在 GitHub Actions Secret 中配置 `UPDATE_SIGNING_PRIVATE_KEY`。
2. 在部署环境配置对应的 `APP_UPDATE_SIGNING_PUBLIC_KEY`，并设置 `APP_UPDATE_REQUIRE_SIGNATURE=true`。
3. Actions 会把 `xungen-<version>.tar.gz.sig` 上传到 Release；服务端只有在签名验证通过后才允许安装。

私钥不能写入仓库、镜像、`.env.example` 或日志。没有配置代码签名证书时，操作系统仍可能在部署或浏览器下载环节显示来源警告；这不影响服务器端 SHA-256/签名拒绝策略。

## 发布新版本

```bash
pnpm release patch
git push origin main --follow-tags
```

正式发布仍由仓库维护者决定。Actions 的 `UPDATE_MANDATORY`、`UPDATE_SECURITY_FIX`、`UPDATE_MIN_SUPPORTED_VERSION` Repository Variables 可写入 Release 元数据；未设置时按普通可选更新处理。

## 测试与限制

- `pnpm test` 覆盖版本比较、GitHub API 解析、资产地址限制、SHA-256、签名和更新 API。
- `pnpm lint`、`pnpm typecheck`、`pnpm build` 是发布前必跑检查。
- 本机没有真实生产数据库、systemd、Docker socket 或已授权的 GitHub Release 发布权限时，只能验证本地状态机和测试；SOURCE/DOCKER 的真实重启、远程 Release 资产下载和签名密钥验收必须在预发环境完成。
- `branch` 通道用于开发跟踪，只有稳定 Release 通道具备发布资产完整性门禁。
