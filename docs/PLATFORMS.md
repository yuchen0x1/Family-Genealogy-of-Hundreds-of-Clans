# 平台与兼容性

族谱、协作、档案和管理员权限共享 Next.js 服务端 API 与 PostgreSQL。桌面浏览器提供完整导航和图谱工作区，移动浏览器使用紧凑导航与触控布局。安装为 PWA 后可从系统图标进入独立窗口，业务操作仍需要连接原站点。

| 候选 | 级别 | 核心功能、体验与限制 | 分发、维护和验证 |
| --- | --- | --- | --- |
| 桌面 Web（Windows 10/11、Linux、macOS Intel/Apple Silicon） | A | 在能运行受维护浏览器的系统上使用完整功能。文件访问受浏览器选择器约束。无需管理员权限。 | 单一服务版本。CI 的 Chromium 覆盖桌面流程。系统逐项真机验收待补。 |
| 手机 Web（Android、iOS） | A | 响应式页面、触控导航，复杂图谱可缩放或切换视图。 | 随服务更新。Chromium 手机模拟检查导航和视口；iOS 真机待验收。 |
| 平板 Web（Android、iPadOS）与折叠屏 Web | A | 随可用窗口宽度重排。折叠屏铰链和各设备文件交互仍需真机验证。 | 共用响应式构建。 |
| PWA（桌面和移动） | B | 在支持安装的浏览器使用独立窗口。离线仅显示通用提示，业务数据始终由服务端读取。 | HTTPS 或 localhost，按浏览器安装入口分发。Service Worker 更新经用户确认刷新，其他标签页保留当前编辑状态。 |
| Linux x64 Docker / 私有化 / 云服务器 | A | Node.js、PostgreSQL 17、文件卷、HTTPS 反代。Compose 提供 PostgreSQL/Redis/Nginx 和可选更新服务；仅更新服务需要宿主 Docker socket。 | 从 Release 源码包构建。CI 检查 Linux x64 镜像冷启动与迁移。SOURCE/DOCKER 的自动更新见运维文档。 |
| Ubuntu、Debian、Fedora、Arch Linux | A | Linux x64 Docker 路径相同。源码部署要求有受支持的 Node.js、pnpm、Prisma 二进制和 PostgreSQL 扩展。 | 以容器 CI 为基线。各发行版的逐一安装与 SELinux 挂载验收待补。 |
| Linux ARM64 / NAS | C | 支持 Docker Engine/Compose、可写持久卷和足够内存的型号有部署价值。Sharp/Prisma、权限与 socket 取决于具体型号。 | ARM64 与厂商系统缺乏产品验收，本轮只发通用源码包。 |
| Windows 10/11 原生桌面 | C | 要达到完整能力需自带或连接服务端、处理本地权限、安装与升级。Web/PWA 已提供绝大多数操作。 | 原生签名、安装与维护成本高于当前增益。 |
| Ubuntu、Debian、Fedora、Arch 原生桌面 | C | 可做独立 GTK/Qt 客户端，但各发行版的依赖和更新通道需单独维护。 | AppImage/DEB/RPM/Flatpak 需要各自验收，暂缓。 |
| macOS Intel 和 Apple Silicon 原生桌面 | C | 本地服务、沙盒、Keychain、双架构和文件访问都需专项设计。 | 需要 Apple 签名、公证和双架构验证，暂缓。 |
| Android 手机、平板与折叠屏原生 | C | 独立触控工作区和离线编辑有潜在价值，需要权限、冲突合并和安全本地数据层。 | 需要 APK/商店签名、分发和多种真机，暂缓。 |
| iOS / iPadOS 原生 | C | 要支持离线协作需重建加密存储与恢复，还涉及后台任务、沙盒和审核。 | 需要 Apple 开发者账号和真机，暂缓。 |
| Chrome / Edge / Firefox 扩展 | D | 无需读取第三方页面，也无需扩展权限。族谱管理在标准标签页可完成。 | 额外商店审查、浏览权限和升级成本，当前无对应业务场景。 |
| 运维 CLI | A | 现有脚本提供迁移、备份、种子数据和版本准备。需要部署权限与 Node.js。 | 随相同 Release 源码包更新。暂不提供独立编辑 CLI。 |
| GitHub Pages 静态应用 | D | 私有族谱、鉴权、上传与数据写入需要运行时和数据库。 | GitHub 用作源码、协作与发版中心。 |

通用浏览器入口只需要站点 URL。部署和下载见 [README](../README.md)、[部署指南](DEPLOYMENT.md) 与 [GitHub Releases](https://github.com/yuchen0x1/Family-Genealogy-of-Hundreds-of-Clans/releases/latest)。安装退出可使用浏览器或系统的应用管理功能，卸载 PWA 仅影响本机入口。
