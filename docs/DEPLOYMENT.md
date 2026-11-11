# 部署说明

## 0. 本次环境的验证边界（务必先读）

- 本机为 Windows 沙箱，Docker 引擎依赖的 `wsl.exe` 被环境策略阻断，因此 **`Dockerfile` / `docker-compose.yml` 的镜像构建与容器编排未在本机执行过验证**。这两份配置是按项目实际依赖、启动命令与端口编写的标准交付物，首次在目标服务器部署时需要按第 3 节逐步验证。
- 已在本机真实验证的是**同一套生产启动路径**：`pnpm build` → `pnpm start`，以及 `prisma migrate deploy`、seed、`/api/health`、备份与恢复。
- 本地开发数据库由 `scripts/pg.mjs` 提供 PostgreSQL 17 官方二进制（数据目录 `~/.xungen-pg`），仅用于开发；生产请使用 `docker-compose.yml` 中的 `postgres:17`。

## 1. 部署形态

| 形态 | 适用 | 命令 |
| --- | --- | --- |
| A. 裸机 / PaaS（Node 22） | 已有托管 PostgreSQL、Redis 与 TLS 网关 | `pnpm build && pnpm start` |
| B. Docker Compose（推荐） | 单机自建全套服务 | `docker compose up -d --build` |

形态 A 不依赖 Docker，适合先做一次最小可用上线；形态 B 附带数据库、Redis、Nginx 和数据卷。

## 2. 前置条件

- Node.js 22（形态 A）或 Docker Engine 24+ 与 Compose v2（形态 B）
- PostgreSQL 17，可执行 `CREATE EXTENSION pg_trgm, unaccent`（`docker/postgres/init-extensions.sql` 已处理）
- Redis 7（可选，未连接自动降级）
- 域名与受信任 TLS 证书
- 至少 2 GB 内存；上传目录与备份目录需持久化且**不在网站根目录 static 路径下**

## 3. 形态 B：Docker Compose 部署

```bash
# 1) 准备环境变量（.env 不会进入镜像，见 .dockerignore）
cp .env.example .env

# 2) 生成生产密钥，绝不复用模板中的 dev 值
node -e "console.log(require('crypto').randomBytes(48).toString('base64'))"   # → SESSION_SECRET
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"      # → ENCRYPTION_KEY

# 3) 编辑 .env：填入 SESSION_SECRET、ENCRYPTION_KEY、POSTGRES_PASSWORD、
#    NEXT_PUBLIC_SITE_URL=https://你的域名；删除 seed 后的演示账号变量。
#    注意：ENCRYPTION_KEY 一旦投入生产不得更换，否则已加密的人物敏感字段无法解密。

# 4) TLS 证书（生产请用真实证书替换这两个文件）
#    本地演练：bash nginx/generate-dev-cert.sh
#    生产：把 CA 签发的 fullchain.pem 与 privkey.pem 放到 nginx/certs/（该目录 *.pem 已被 gitignore）

# 5) 启动（app 容器启动时自动执行 prisma migrate deploy）
docker compose up -d --build
docker compose ps
docker compose logs -f app

# 6) 首次初始化基础资料与角色（幂等，可重复执行；完成后删除 seed 变量）
docker compose run --rm app pnpm db:seed

# 7) 验收
curl -k https://localhost/api/health          # {"ok":true,"data":{"status":"ok",...}}
curl -k -I https://localhost/                 # 200 + 安全响应头
```

`docker-compose.yml` 关键点：

- `POSTGRES_PASSWORD`、`SESSION_SECRET`、`ENCRYPTION_KEY` 使用 `:?` 必填校验，缺失时 Compose 直接拒绝启动。
- 容器内的 `DATABASE_URL` 由 Compose 覆盖为 `postgres:5432`，与 `.env` 中本地的 `127.0.0.1` 互不干扰。
- 上传文件与备份分别挂载到 `uploads` 数据卷和 `./backups`，不使用 `public/` 静态目录。
- `app` 与 `nginx` 均有 healthcheck；Nginx 只在 app 健康后才启动对外服务。
- 数据库 5432、Redis 6379 不向宿主机暴露。

## 4. 形态 A：裸机 / PaaS

```bash
cp .env.example .env   # 修改 DATABASE_URL / REDIS_URL / SESSION_SECRET / ENCRYPTION_KEY / NEXT_PUBLIC_SITE_URL
pnpm install --frozen-lockfile
pnpm exec prisma generate
pnpm exec prisma migrate deploy
pnpm db:seed
pnpm build
pnpm start             # 监听 3000，由外部 TLS 网关反代
```

若外部网关会**覆盖**（而非追加）`X-Forwarded-For`，才可以把 `TRUST_PROXY=true`；否则保持默认 `false`。

## 5. Nginx、HTTPS 与来源 IP 安全

`nginx/nginx.conf` 提供 80 → 443 跳转、TLS 1.2/1.3、HSTS、`client_max_body_size 25m`（对应 `MAX_UPLOAD_MB=20`）、60 秒以上读超时（兼容 PNG/PDF 导出）与健康检查日志关闭。

**安全关键**：配置中使用

```nginx
proxy_set_header X-Forwarded-For $remote_addr;   # 覆盖
```

而**不是** `$proxy_add_x_forwarded_for`（追加）。应用只有在 `TRUST_PROXY=true` 时才读取该头做限流分桶；若网关追加了客户端可伪造的值，攻击者可无限生成限流桶绕过注册/登录/搜索限流。若前置还有负载均衡，必须保证最靠近应用的这一层用 `$remote_addr` 覆盖该头。

生产证书建议用 certbot（`/.well-known/acme-challenge/` 已在 80 端口预留）或云负载均衡托管；`nginx/certs/*.pem` 已被 `.gitignore` 排除，绝不入库。

## 6. 备份与恢复

```bash
pnpm db:backup                                   # 数据库 + 上传文件 sidecar 备份
node scripts/backup.mjs --verify <备份文件>      # 同时校验数据库与 .files sidecar
node scripts/backup.mjs --restore <快照> --i-understand   # 恢复逻辑快照、数据库和上传目录
node scripts/backup.mjs --restore-files <dump> --i-understand  # pg_restore custom dump 后恢复上传目录
```

双通道设计：

1. **生产优先**：检测到官方 `pg_dump`/`pg_restore` 时输出 custom 格式（`-Fc --blobs`），用 `pg_restore --list` 校验；恢复走标准 `pg_restore --clean --if-exists --no-owner`。数据库备份旁边同时生成同名 `<timestamp>.files/` 上传文件 sidecar，必须与 `.dump` 一起保管。
2. **自动降级**：本机精简版 PostgreSQL 不含 `pg_dump`，脚本改用项目已有的 `pg` 驱动导出所有 public 业务表的 gzip JSON 逻辑快照（排除 Prisma 自管的 `_prisma_migrations`），恢复时先 `prisma migrate deploy` 建结构，再在事务中按外键顺序写回；同时生成并校验上传文件 sidecar。

文件 sidecar 的 `manifest.json` 记录每个数据库引用档案的安全 `storageKey`、大小与 SHA-256。校验会拒绝缺失、篡改、符号链接、重复 key、路径穿越和未列入清单的文件；恢复先写临时目录并校验，再切换到空的上传目录，绝不覆盖已有文件。旧版只有数据库文件的备份仍可验证和恢复数据库，但会明确警告其不包含上传文件，不能作为完整灾备。

真实演练记录（2026-11-10，v0.2.0 发布轮）：

```
[backup] 模式：逻辑快照（本机缺少 pg_dump）
[backup] 48 张表，4369 行数据；367493 字节；sha256 c65be252...；校验方式 gzip + 行数/列完整性校验
[backup] 上传 sidecar：15 个文件随快照打包
[backup] 恢复完成，共写入 4369 行
影子库行数核对：表数 48，总行数 4369     ← 与快照一致
```

恢复前强制检查目标库全表为空、上传目录为空，且必须显式传 `--i-understand`，绝不覆盖已有数据。备份文件包含用户表（密码为 scrypt 哈希、人物敏感字段为 AES-256-GCM 密文）和可能包含个人档案的文件，仍需按敏感文件保管：目录权限 600、传输加密、异地存放、定期演练恢复。

定时备份示例（宿主机 crontab，每天 02:30）：

```cron
30 2 * * * cd /srv/xungen && docker compose exec -T app node scripts/backup.mjs >> /var/log/xungen-backup.log 2>&1
```

## 7. 升级流程

1. `pnpm db:backup` 并校验备份；
2. 阅读新增迁移，`docker compose run --rm app pnpm exec prisma migrate deploy`；
3. `docker compose up -d --build`（滚动替换 app）；
4. `curl /api/health`、跑一遍 `pnpm test:smoke` 指向生产前预发环境；
5. 观察审计日志与错误日志，确认无异常后再放量。

**禁止**在生产使用 `prisma migrate dev` 或 `prisma db push`（可能重置数据）。

## 8. 监控与排障

| 现象 | 排查 |
| --- | --- |
| `/api/health` 返回 503 | `database:false`：检查 `DATABASE_URL`、PG 容器健康、连接池；`cache:"memory"` 属正常降级 |
| 注册/登录突然 429 | Redis 限流桶残留（开发期用 `pnpm test:reset-limits` 清理）；生产检查是否有代理未覆盖 `X-Forwarded-For` |
| 上传 413 | `MAX_UPLOAD_MB` 与 Nginx `client_max_body_size` 需同步调大 |
| 下载 404 `FILE_MISSING` | 上传数据卷未持久化或文件被清理；从备份/对象存储恢复 |
| OCR 503 | 未配置 `OCR_API_URL`/`OCR_API_KEY`；可先用人工录入待校对文本 |
| S3 报错 | 未填真实凭据时明确返回依赖错误，不会静默降级 |
| 私有族谱 403/404 | 符合预期：无权访问私有对象一律不暴露存在性 |

审计日志位于后台「审计日志」页，记录关键写操作的 `before/after`、IP 摘要与 User-Agent。

## 9. 上线前检查清单

- [ ] 替换全部 dev 密钥、删除 seed 演示账号变量、修改演示账号密码或删除
- [ ] `SESSION_SECRET` / `ENCRYPTION_KEY` 已安全备份（丢失将无法解密人物敏感字段）
- [ ] `.storage/uploads` 不在 `public/` 下，`/.storage/` 与 `/backups/` 不在版本库
- [ ] `TRUST_PROXY` 仅在可信代理覆盖来源头时开启
- [ ] 真实 TLS 证书与自动续期已配置
- [ ] 数据库备份与同名 `.files` 上传文件 sidecar 均已异地加密保存，并完成一次数据库 + 文件恢复演练
- [ ] `UPLOAD_DIR` 对应的 Docker Volume 或对象存储已纳入备份策略
- [ ] 隐私政策、用户协议、授权撤回与账号注销入口可达（`/legal/privacy`、`/legal/terms`、`/me`）
- [ ] 首次在目标服务器完成一次 `docker compose up -d --build` 全链路验证（本机因环境策略未执行）

## 10. 更新驱动与 updater sidecar（Docker）

Docker 部署必须将 `APP_UPDATE_DRIVER=DOCKER`。Web `app` 容器把经过校验的发布包解压到 `/app/.storage/update/staging-<version>`，并写入 `.storage/update/docker-restart.requested` 标记；`app` 与 `updater` 通过同一个 `update_state` 命名卷共享此目录。**app/nginx 绝不挂载 `/var/run/docker.sock`**；只有 `updater` sidecar 挂载该 socket。sidecar 校验普通请求文件、任务 ID、staging 名称和必要文件后，将 Compose build context 指向共享卷中的 staging 源码，再固定执行 `docker compose build app` 与 `docker compose up -d --no-build app nginx`。它不会执行请求内容中的命令或参数，也不会使用宿主机旧 checkout 作为 app 的构建上下文。

`.env` 至少配置：

```dotenv
APP_UPDATE_DRIVER=DOCKER
APP_UPDATE_REPO=owner/repository
APP_UPDATE_PROJECT_DIR=/srv/xungen       # 宿主机项目绝对路径，必须与 compose 文件所在目录一致
APP_UPDATE_POLL_SECONDS=15
```

首次部署时，`APP_UPDATE_PROJECT_DIR` 必须是宿主机绝对路径，且与 `docker-compose.yml` 和 `.env` 所在目录一致；sidecar 以只读方式访问该目录的 Compose 配置与 `.env`，更新 staging 和状态通过 app/updater 共用的 `update_state` 命名卷共享。app 以 UID 1001 写共享卷，updater 镜像以 root 写该卷；首次部署应让 app 镜像初始化卷目录权限（Compose 挂载前创建目录并 chown 为 1001），并验证两容器均可访问；不要把宿主机项目目录改成可写挂载。检查权限与启动状态：

```bash
chmod 0750 docker/update-sidecar.sh
# 仅 updater 应显示 Docker socket 挂载；app/nginx 不得出现 docker.sock
DOCKER_CONFIG=${DOCKER_CONFIG:-$HOME/.docker} docker compose config
docker compose up -d --build
docker compose ps updater
docker compose logs -f updater
```

sidecar 失败请求会移到 `docker-restart.failed`，并在共享卷写入 `docker-restart.last` 的失败结果；应用读取更新状态时会按 `jobId` 立即将对应任务标为失败并释放更新锁，不必等待超时。sidecar 不自动重试；处理前请查看日志、备份并人工确认构建环境。`docker-restart.last` 的 `SUCCEEDED` 仅表示 Compose build/up 命令成功返回，不代表新 app 已健康或目标版本已生效；运维仍须检查 `docker compose ps`、`docker compose logs app` 和 `/api/health`，并确认后台显示的当前版本。应用端只应将匹配的 `jobId` 结果作用于对应的活动 DOCKER 任务；成功需再核对当前运行版本/构建 SHA 与目标版本，不匹配时保持等待并由超时策略收尾。Sidecar 使用部署目录中的 Compose 配置和 `.env`，发布包仅作为 app/Dockerfile 的 build context；Compose 服务定义、Nginx 配置和宿主证书不会随该在线更新覆盖，变更这些部署文件时仍需按人工升级流程应用。Docker socket 等价于宿主机高权限，必须限制服务器登录、保护 `.env`（含数据库密钥和仓库令牌），不要把 updater 端口暴露到公网。

## 11. 源码部署与 systemd

源码部署使用 `APP_UPDATE_DRIVER=SOURCE`，不需要 Docker socket。**安全取舍：**源码更新器作为 Web 服务的同一 UID 执行，须能写受管源码、`node_modules` 和 `.next`；因此被攻陷的 Web 进程也可修改这些路径，不能视为最小权限或强隔离部署。若优先隔离，应使用 Docker staging 更新，或由运维人工部署更新，而不是启用 SOURCE 自动更新。若仍使用 SOURCE，必须把生产密钥放到工作树外（例如 `/etc/xungen/xungen.env`，root 所有、服务账号只读），不要在工作树保存可写 `.env`；工作树由专用 `xungen` 用户拥有，不授予 sudo 或 Docker socket。将 `deploy/systemd/xungen.service` 安装到 `/etc/systemd/system/`，按实际路径调整 `WorkingDirectory`、`EnvironmentFile` 和 `ExecStart`：

```bash
sudo install -d -o root -g root -m 0755 /etc/xungen
sudo mv /srv/xungen/.env /etc/xungen/xungen.env
sudo chown root:root /etc/xungen/xungen.env
sudo chmod 0640 /etc/xungen/xungen.env
# /srv/xungen 工作树（不含 .env）归专用 xungen 用户所有，更新器需要替换受管源码和构建产物。
sudo chown -R xungen:xungen /srv/xungen
sudo install -o root -g root -m 0644 deploy/systemd/xungen.service /etc/systemd/system/xungen.service
sudo systemctl daemon-reload
sudo systemctl enable --now xungen.service
sudo systemctl status xungen.service
```

`.env` 的关键配置：

```dotenv
APP_UPDATE_DRIVER=SOURCE
APP_UPDATE_REPO=owner/repository
# 此 unit 使用 Restart=always；更新器结束旧进程后由 systemd 自动拉起，无需 systemctl 提权命令。
```

该 unit 用 `Restart=always`：更新器在安装、构建完成后结束旧 Node 进程，systemd 自动拉起新版本，避免授予服务账号 `systemctl restart` 权限。`ProtectSystem=strict` 配合 `ReadWritePaths=/srv/xungen` 允许 updater 在工作树内替换源码、写 `node_modules`/`.next` 与用户数据；因此必须把 `.env` 移出该目录并将其配置为 root 所有、服务账号只读的 `EnvironmentFile`（如 `/etc/xungen/xungen.env`）。如项目路径或 Node/pnpm 路径不同，应在部署前调整并用 `systemd-analyze verify /etc/systemd/system/xungen.service` 校验。
