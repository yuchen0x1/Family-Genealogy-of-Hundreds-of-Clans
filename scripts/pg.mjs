/**
 * 本地开发 PostgreSQL 17 生命周期脚本（跨平台、零 Docker 依赖）。
 *
 *   node scripts/pg.mjs start   # 若缺少二进制则从 npmmirror 自动下载；初始化数据目录；启动；建库
 *   node scripts/pg.mjs stop    # 停止
 *   node scripts/pg.mjs status  # 查看状态
 *
 * 二进制来自 npm 官方镜像中的 @embedded-postgres/windows-x64（PostgreSQL 官方构建），
 * 仅用于本地开发；生产部署请使用 docker-compose.yml 中的 postgres:17 + PostGIS。
 */
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import os from "node:os";
import net from "node:net";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
// 重要：PostgreSQL 的 Windows 引导脚本不接受非 ASCII 路径（项目名含中文），
// 因此二进制与数据目录统一放在用户主目录下的纯 ASCII 路径中。
const PG_HOME = process.env.XUNGEN_PG_HOME || path.join(os.homedir(), ".xungen-pg");
const BIN = path.join(PG_HOME, "package", "native", "bin");
const DATA = path.join(PG_HOME, "data");
const TARBALL = path.join(PG_HOME, "pg17.tgz");
const PG_VERSION = "17.11.0-beta.19";
const TARBALL_URL = `https://registry.npmmirror.com/@embedded-postgres/windows-x64/-/windows-x64-${PG_VERSION}.tgz`;

const HOST = process.env.PGHOST || "127.0.0.1";
const PORT = Number(process.env.PGPORT || 5432);
const USER = process.env.PGUSER || "xungen";
const PASSWORD = process.env.PGPASSWORD || "xungen_pwd";
const DATABASES = ["xungen", "xungen_shadow"];

const exe = (name) => path.join(BIN, process.platform === "win32" ? `${name}.exe` : name);

function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { encoding: "utf8", windowsHide: true, ...opts });
  if (r.status !== 0) {
    throw new Error(`${path.basename(cmd)} 失败 (${r.status}): ${r.stdout || ""} ${r.stderr || ""}`);
  }
  return r.stdout || "";
}

async function portOpen(port) {
  return new Promise((resolve) => {
    const s = net.createConnection({ host: HOST, port });
    s.setTimeout(800);
    s.once("connect", () => { s.destroy(); resolve(true); });
    s.once("error", () => resolve(false));
    s.once("timeout", () => { s.destroy(); resolve(false); });
  });
}

async function provision() {
  if (existsSync(exe("postgres"))) return;
  mkdirSync(path.dirname(TARBALL), { recursive: true });
  console.log("[pg] 未找到 PostgreSQL 二进制，正在从 npmmirror 下载…");
  const r = spawnSync("curl", ["-L", "-f", "-s", "-m", "600", "-o", TARBALL, TARBALL_URL], { encoding: "utf8" });
  if (r.status !== 0) throw new Error(`下载失败: ${r.stderr}`);
  console.log("[pg] 解压中…");
  run("tar", ["-xzf", TARBALL, "-C", path.dirname(TARBALL)]);
  if (!existsSync(exe("postgres"))) throw new Error("解压后未找到 postgres 可执行文件");
}

async function initdb() {
  if (existsSync(path.join(DATA, "PG_VERSION"))) return;
  mkdirSync(DATA, { recursive: true });
  const pwfile = path.join(PG_HOME, "pwfile.tmp");
  writeFileSync(pwfile, PASSWORD, "utf8");
  console.log("[pg] 初始化数据目录…");
  run(exe("initdb"), [
    "-D", DATA,
    "-U", USER,
    `--pwfile=${pwfile}`,
    "--encoding=UTF8",
    "--locale=C",
    "--auth-host=scram-sha-256",
    "--auth-local=trust",
  ]);
  // 仅监听本机，避免开发实例暴露到局域网
  const conf = path.join(DATA, "postgresql.conf");
  writeFileSync(conf, `\nlisten_addresses = '127.0.0.1'\nport = ${PORT}\n`, { flag: "a" });
  const { unlinkSync } = await import("node:fs");
  unlinkSync(pwfile);
}

async function ensureDatabases() {
  const { Client } = require("pg");
  const client = new Client({ host: HOST, port: PORT, user: USER, password: PASSWORD, database: "postgres" });
  await client.connect();
  try {
    for (const db of DATABASES) {
      const { rowCount } = await client.query("SELECT 1 FROM pg_database WHERE datname = $1", [db]);
      if (!rowCount) {
        await client.query(`CREATE DATABASE "${db}"`);
        console.log(`[pg] 已创建数据库 ${db}`);
      }
    }
  } finally {
    await client.close();
  }
}

async function start() {
  await provision();
  if (await portOpen(PORT)) {
    console.log(`[pg] 端口 ${PORT} 已有服务在监听，跳过启动`);
    await ensureDatabases();
    return;
  }
  await initdb();
  console.log("[pg] 启动 PostgreSQL…");
  const log = path.join(PG_HOME, "server.log");
  // -W: 不等待。pg_ctl -w 在 Windows + scram-sha-256 下会因 PQping 认证而挂起，
  // 改为自行轮询 TCP 端口判断就绪。
  run(exe("pg_ctl"), ["-D", DATA, "-l", log, "-W", "start"], {
    env: { ...process.env, PGPASSWORD: PASSWORD },
  });
  for (let i = 0; i < 60 && !(await portOpen(PORT)); i++) {
    await new Promise((r) => setTimeout(r, 500));
  }
  if (!(await portOpen(PORT))) throw new Error("PostgreSQL 启动超时，请查看 " + log);
  await ensureDatabases();
  console.log(`[pg] 就绪: postgresql://${USER}:***@${HOST}:${PORT}/xungen`);
}

async function stop() {
  if (!existsSync(path.join(DATA, "PG_VERSION"))) return console.log("[pg] 无数据目录");
  const r = spawnSync(exe("pg_ctl"), ["-D", DATA, "-m", "fast", "-w", "stop"], {
    encoding: "utf8",
    env: { ...process.env, PGPASSWORD: PASSWORD },
  });
  console.log(r.status === 0 ? "[pg] 已停止" : `[pg] ${r.stdout || ""} ${r.stderr || ""}`);
}

async function status() {
  await provision();
  if (!existsSync(path.join(DATA, "PG_VERSION"))) return console.log("[pg] 未初始化");
  console.log(run(exe("pg_ctl"), ["-D", DATA, "status"], {
    env: { ...process.env, PGPASSWORD: PASSWORD },
  }));
}

/** 常驻模式：启动后保持进程存活，供 `pnpm db:pg:serve` 在开发会话中使用。 */
async function serve() {
  await start();
  console.log("[pg] keeper 已启动，按 Ctrl+C 结束");
  setInterval(() => {}, 60_000);
}

const action = process.argv[2] || "start";
const actions = { start, stop, status, serve };
if (!actions[action]) {
  console.error("用法: node scripts/pg.mjs [start|stop|status|serve]");
  process.exit(1);
}
actions[action]().catch((e) => {
  console.error(`[pg] ${e.message}`);
  process.exit(1);
});
