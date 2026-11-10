/**
 * 数据库备份与恢复（真实读写 PostgreSQL，不做任何模拟）。
 *
 *   pnpm db:backup                                  # 生成数据库备份 + 上传文件 sidecar + sha256/manifest
 *   node scripts/backup.mjs --verify <file>        # 同时校验数据库与上传文件 sidecar
 *   node scripts/backup.mjs --restore <file> --i-understand   # 恢复数据库与上传目录
 *   node scripts/backup.mjs --restore-files <file> --i-understand   # 恢复 custom dump 旁的上传目录
 *
 * 双通道：
 *   1) 生产优先：官方 pg_dump / pg_restore，custom 格式（-Fc），含大对象，可由运维按标准流程恢复；
 *   2) 自动降级：开发环境若没有 pg_dump（例如本机使用精简版 embedded-postgres），
 *      则用项目已有的 pg 驱动导出全部 public 表的逻辑快照（gzip JSON），
 *      恢复时先由 `prisma migrate deploy` 建好结构，再把快照导回空库。
 *      快照只含数据行，DDL 由 prisma/migrations 提供，二者配合构成完整恢复路径。
 *
 * 环境变量（可从 .env 读取）：
 *   DATABASE_URL   必填 postgresql://user:pwd@host:5432/db?schema=public
 *   BACKUP_DIR     默认 ./backups
 *   BACKUP_KEEP    保留份数，默认 7
 *   PG_DUMP_PATH / PG_RESTORE_PATH  显式指定官方工具路径（容器部署推荐）
 *
 * 安全：只写/删本脚本在 backups/ 目录生成的严格命名文件与 `.files` sidecar；恢复前强制检查目标库全表为空、上传目录为空，
 * 且必须显式传 --i-understand，绝不覆盖已有数据。备份含用户表（密码为 scrypt 哈希、人物敏感字段为 AES-256-GCM 密文）与档案文件，
 * 仍应按敏感文件保管，详见 docs/DEPLOYMENT.md。
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, unlinkSync, writeFileSync, chmodSync, rmSync } from "node:fs";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { gzipSync, gunzipSync } from "node:zlib";
import path from "node:path";
import os from "node:os";
import pg from "pg";
import {
  copyStorageSnapshot,
  restoreStorageSnapshot,
  verifyStorageSnapshot,
} from "./storage-snapshot.mjs";

const { Client } = pg;
const ROOT = process.cwd();
const KEEP = Math.max(1, Number(process.env.BACKUP_KEEP || 7));

function loadEnv() {
  const file = path.join(ROOT, ".env");
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    if (/^\s*#/.test(line)) continue;
    const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (!m) continue;
    let value = m[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    if (process.env[m[1]] === undefined) process.env[m[1]] = value;
  }
}
loadEnv();

const BACKUP_DIR = path.resolve(ROOT, process.env.BACKUP_DIR || "./backups");
const FILE_RE = /^(xungen-\d{8}-\d{6})\.(?:dump|dump\.sha256|snapshot\.json\.gz|snapshot\.json\.gz\.sha256|manifest\.json|files)$/;
const quote = (s) => `"${String(s).replace(/"/g, '""')}"`;

function parseDatabaseUrl() {
  const raw = process.env.DATABASE_URL;
  if (!raw) throw new Error("缺少 DATABASE_URL，请在 .env 或环境变量中配置");
  let u;
  try { u = new URL(raw); } catch { throw new Error("DATABASE_URL 格式无效"); }
  if (!/^postgres(ql)?:$/.test(u.protocol)) throw new Error("DATABASE_URL 必须是 postgresql:// 连接串");
  return {
    host: u.hostname,
    port: Number(u.port || 5432),
    user: decodeURIComponent(u.username),
    password: decodeURIComponent(u.password),
    database: u.pathname.replace(/^\//, "").split("?")[0],
  };
}

function findTool(name) {
  const envKey = name === "pg_dump" ? "PG_DUMP_PATH" : "PG_RESTORE_PATH";
  if (process.env[envKey] && existsSync(process.env[envKey])) return process.env[envKey];
  const exe = process.platform === "win32" ? `${name}.exe` : name;
  const local = path.join(os.homedir(), ".xungen-pg", "package", "native", "bin", exe);
  if (existsSync(local)) return local;
  const probe = spawnSync(process.platform === "win32" ? "where" : "which", [name], { encoding: "utf8" });
  if (probe.status === 0 && probe.stdout.trim()) return probe.stdout.split(/\r?\n/)[0].trim();
  return null;
}

function run(tool, args, cfg) {
  const r = spawnSync(tool, args, {
    encoding: "utf8", windowsHide: true, maxBuffer: 20 * 1024 * 1024,
    env: { ...process.env, PGPASSWORD: cfg.password },
  });
  if (r.error) throw new Error(`无法执行 ${path.basename(tool)}：${r.error.message}`);
  if (r.status !== 0) throw new Error(`${path.basename(tool)} 失败：${(r.stderr || r.stdout || "").trim().slice(0, 600)}`);
  return (r.stdout || "").trim();
}

const sha256 = (buf) => createHash("sha256").update(buf).digest("hex");

function storageRoot() {
  return path.resolve(ROOT, process.env.UPLOAD_DIR || "./.storage/uploads");
}

function backupBase(file) {
  const match = path.basename(file).match(/^(xungen-\d{8}-\d{6})\./);
  if (!match) throw new Error(`无法从备份文件名解析批次：${file}`);
  return match[1];
}

function storageDirForBackup(file) {
  return path.join(path.dirname(file), `${backupBase(file)}.files`);
}

function writeProtected(file, content) {
  writeFileSync(file, content);
  try { chmodSync(file, 0o600); } catch { /* Windows 不支持 POSIX 权限，忽略 */ }
}

// ---------------- 通道 1：官方 pg_dump ----------------
function pgDumpBackup(cfg, file) {
  const tool = findTool("pg_dump");
  const version = run(tool, ["--version"], cfg);
  run(tool, [
    "--format=custom", "--no-owner", "--no-privileges", "--blobs",
    "-h", cfg.host, "-p", String(cfg.port), "-U", cfg.user, "-d", cfg.database, "-f", file,
  ], cfg);
  const restoreTool = findTool("pg_restore");
  run(restoreTool, ["--list", file], cfg);
  return { format: "pg_dump custom (-Fc, --blobs)", engine: version, verifiedBy: "pg_restore --list" };
}

function verifyDump(file, cfg) {
  if (!existsSync(file)) throw new Error(`备份文件不存在：${file}`);
  const bytes = statSync(file).size;
  if (bytes < 1024) throw new Error(`备份文件异常过小（${bytes} 字节），疑似失败产物`);
  const tool = findTool("pg_restore");
  if (!tool) throw new Error("缺少 pg_restore，无法校验 custom 格式备份");
  run(tool, ["--list", file], cfg);
  return { bytes, sha256: sha256(readFileSync(file)), verifiedBy: "pg_restore --list" };
}

// ---------------- 通道 2：逻辑快照（pg 驱动） ----------------
function serializeValue(v, udt) {
  if (v === null || v === undefined) return null;
  if (Buffer.isBuffer(v)) return { __bytea: v.toString("base64") };
  if (udt === "json" || udt === "jsonb") return { __json: JSON.stringify(v) };
  return v; // Date / string / number / boolean / array 由 JSON 与 pg 驱动各司其职
}

function deserializeValue(v, udt) {
  if (v === null || v === undefined) return null;
  if (typeof v === "object" && !Array.isArray(v) && typeof v.__bytea === "string") return Buffer.from(v.__bytea, "base64");
  if (typeof v === "object" && !Array.isArray(v) && typeof v.__json === "string") return v.__json;
  if ((udt === "timestamp" || udt === "timestamptz" || udt === "date") && typeof v === "string") return v;
  return v;
}

async function withClient(cfg, fn) {
  const client = new Client({
    host: cfg.host, port: cfg.port, user: cfg.user, password: cfg.password,
    database: cfg.database, connectionTimeoutMillis: 15_000,
  });
  await client.connect();
  try { return await fn(client); } finally { await client.end().catch(() => undefined); }
}

async function collectStorageKeys(client) {
  const result = await client.query(`
    SELECT storage_key AS key FROM public.family_documents
    UNION
    SELECT storage_key AS key FROM public.document_versions
    ORDER BY key
  `);
  return result.rows.map((row) => row.key).filter((key) => typeof key === "string" && key.length > 0);
}

async function createStorageBackup(cfg, base) {
  const keys = await withClient(cfg, (client) => collectStorageKeys(client));
  const directory = path.join(BACKUP_DIR, `${base}.files`);
  const info = await copyStorageSnapshot({ sourceRoot: storageRoot(), targetDir: directory, keys });
  return { required: true, ...info };
}

function readMainManifest(file) {
  const manifestFile = path.join(path.dirname(file), `${backupBase(file)}.manifest.json`);
  if (!existsSync(manifestFile)) return null;
  try { return JSON.parse(readFileSync(manifestFile, "utf8")); }
  catch { throw new Error(`主备份 manifest 无法解析：${manifestFile}`); }
}

async function verifyStorageForBackup(file) {
  const mainManifest = readMainManifest(file);
  const directory = storageDirForBackup(file);
  if (!existsSync(directory)) {
    if (mainManifest?.storage?.required) {
      throw new Error(`缺少上传文件 sidecar：${directory}`);
    }
    return { required: false, status: "legacy-missing", fileCount: 0, totalBytes: 0 };
  }
  const info = await verifyStorageSnapshot(directory);
  if (mainManifest?.storage?.required) {
    const expected = mainManifest.storage;
    if (expected.directory !== info.directory || expected.fileCount !== info.fileCount || expected.totalBytes !== info.totalBytes || expected.manifestSha256 !== info.manifestSha256) {
      throw new Error("上传文件 sidecar 与主备份 manifest 不一致");
    }
  }
  return { required: Boolean(mainManifest?.storage?.required), status: "complete", ...info };
}

async function snapshotBackup(cfg) {
  return withClient(cfg, async (client) => {
    // _prisma_migrations 由 Prisma 自行管理，恢复时由 migrate deploy 重建，不纳入数据快照
    const tablesRes = await client.query(
      `SELECT table_name FROM information_schema.tables
       WHERE table_schema='public' AND table_type='BASE TABLE' AND table_name <> '_prisma_migrations'
       ORDER BY table_name`);
    const colsRes = await client.query(
      `SELECT table_name, column_name, udt_name FROM information_schema.columns WHERE table_schema='public' ORDER BY table_name, ordinal_position`);
    const udt = new Map();
    for (const c of colsRes.rows) udt.set(`${c.table_name}.${c.column_name}`, c.udt_name);
    const tables = [];
    for (const { table_name: table } of tablesRes.rows) {
      const res = await client.query(`SELECT * FROM "public".${quote(table)}`);
      const columns = res.fields.map((f) => f.name);
      const rows = res.rows.map((row) => {
        const out = {};
        for (const c of columns) out[c] = serializeValue(row[c], udt.get(`${table}.${c}`));
        return out;
      });
      tables.push({ name: table, columns, columnTypes: columns.map((c) => udt.get(`${table}.${c}`)), rowCount: rows.length, rows });
    }
    return {
      kind: "xungen-logical-snapshot-v1",
      createdAt: new Date().toISOString(),
      database: `${cfg.host}:${cfg.port}/${cfg.database}`,
      note: "仅含数据行；表结构由 prisma migrate deploy 提供，恢复目标库必须全表为空。",
      tables,
    };
  });
}

function verifySnapshot(file) {
  if (!existsSync(file)) throw new Error(`备份文件不存在：${file}`);
  const raw = readFileSync(file);
  const snapshot = JSON.parse(gunzipSync(raw).toString("utf8"));
  if (snapshot.kind !== "xungen-logical-snapshot-v1" || !Array.isArray(snapshot.tables)) {
    throw new Error("快照格式无法识别");
  }
  for (const t of snapshot.tables) {
    if (t.rowCount !== t.rows.length) throw new Error(`表 ${t.name} 行数与清单不一致（${t.rows.length} / ${t.rowCount}）`);
    for (const row of t.rows) for (const c of t.columns) if (!(c in row)) throw new Error(`表 ${t.name} 缺少列 ${c}`);
  }
  return { bytes: raw.length, sha256: sha256(raw), verifiedBy: "gzip + 行数/列完整性校验", snapshot };
}

/** 无 replica 权限时按外键依赖做拓扑排序（忽略自引用边）。 */
async function dependencyOrder(client, tables) {
  const fk = await client.query(`
    SELECT DISTINCT tc.table_name AS child, ccu.table_name AS parent
    FROM information_schema.table_constraints tc
    JOIN information_schema.constraint_column_usage ccu
      ON ccu.constraint_name = tc.constraint_name AND ccu.table_schema = tc.table_schema
    WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_schema = 'public'`);
  const names = new Set(tables.map((t) => t.name));
  const deps = new Map([...names].map((n) => [n, new Set()]));
  for (const { child, parent } of fk.rows) {
    if (names.has(child) && names.has(parent) && child !== parent) deps.get(child).add(parent);
  }
  const ordered = [];
  const remaining = new Set(names);
  while (remaining.size) {
    const ready = [...remaining].filter((n) => [...deps.get(n)].every((p) => !remaining.has(p)));
    if (!ready.length) throw new Error("外键存在无法自动排序的环，请在具备 session_replication_role 权限的账号下恢复");
    for (const n of ready.sort()) { ordered.push(n); remaining.delete(n); }
  }
  return ordered;
}

async function snapshotRestore(cfg, snapshot) {
  return withClient(cfg, async (client) => {
    for (const t of snapshot.tables) {
      const r = await client.query(`SELECT count(*)::int AS n FROM "public".${quote(t.name)}`);
      if (r.rows[0].n > 0) throw new Error(`目标表 ${t.name} 已有 ${r.rows[0].n} 行数据，为避免覆盖拒绝恢复`);
    }
    let replica = false;
    await client.query("BEGIN");
    try {
      try { await client.query("SET session_replication_role = replica"); replica = true; }
      catch { /* 非超级用户：改用外键拓扑顺序插入 */ }
      const order = replica ? snapshot.tables.map((t) => t.name) : await dependencyOrder(client, snapshot.tables);
      const byName = new Map(snapshot.tables.map((t) => [t.name, t]));
      let inserted = 0;
      for (const name of order) {
        const t = byName.get(name);
        if (!t || !t.rows.length) continue;
        const cols = t.columns.map(quote).join(", ");
        const ph = t.columns.map((_, i) => `$${i + 1}`).join(", ");
        const sql = `INSERT INTO "public".${quote(name)} (${cols}) VALUES (${ph})`;
        for (const row of t.rows) {
          const values = t.columns.map((c, i) => deserializeValue(row[c], t.columnTypes[i]));
          await client.query(sql, values);
          inserted++;
        }
      }
      await client.query("COMMIT");
      return inserted;
    } catch (e) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw e;
    } finally {
      if (replica) await client.query("SET session_replication_role = DEFAULT").catch(() => undefined);
    }
  });
}

// ---------------- 通用流程 ----------------
function prune() {
  if (!existsSync(BACKUP_DIR)) return [];
  const groups = new Map();
  for (const name of readdirSync(BACKUP_DIR)) {
    const m = name.match(FILE_RE);
    if (!m) continue; // 绝不删除非本脚本生成的文件
    if (!groups.has(m[1])) groups.set(m[1], []);
    groups.get(m[1]).push(name);
  }
  const expired = [...groups.keys()].sort().reverse().slice(KEEP);
  const removed = [];
  for (const stamp of expired) {
    for (const name of groups.get(stamp)) {
      const target = path.join(BACKUP_DIR, name);
      if (statSync(target).isDirectory()) rmSync(target, { recursive: true, force: true });
      else unlinkSync(target);
      removed.push(name);
    }
  }
  return removed;
}

function restoreHint(file, cfg) {
  if (file.endsWith(".dump")) {
    return `PGPASSWORD=*** pg_restore --clean --if-exists --no-owner --no-privileges -h ${cfg.host} -p ${cfg.port} -U ${cfg.user} -d ${cfg.database} ${file}  # 数据库恢复后执行 node scripts/backup.mjs --restore-files ${file} --i-understand`;
  }
  return `1) pnpm db:migrate  2) node scripts/backup.mjs --restore ${file} --i-understand  # 目标库必须全表为空`;
}

async function main() {
  const cfg = parseDatabaseUrl();
  const args = process.argv.slice(2);
  const verifyIndex = args.indexOf("--verify");
  const restoreIndex = args.indexOf("--restore");
  const restoreFilesIndex = args.indexOf("--restore-files");

  if (verifyIndex >= 0) {
    const file = path.resolve(args[verifyIndex + 1] || "");
    const info = file.endsWith(".dump") ? verifyDump(file, cfg) : verifySnapshot(file);
    const storage = await verifyStorageForBackup(file);
    console.log(`[backup] 校验通过：${path.basename(file)}，${info.bytes} 字节，sha256 ${info.sha256}，方式 ${info.verifiedBy}`);
    if (storage.status === "legacy-missing") {
      console.warn("[backup] 警告：这是旧版数据库-only备份，不包含上传文件，不能作为完整灾备");
    } else {
      console.log(`[backup] 上传文件 sidecar 校验通过：${storage.fileCount} 个文件，${storage.totalBytes} 字节`);
    }
    console.log(`[backup] 恢复命令：${restoreHint(path.relative(ROOT, file), cfg)}`);
    return;
  }

  if (restoreFilesIndex >= 0) {
    const file = path.resolve(args[restoreFilesIndex + 1] || "");
    if (!args.includes("--i-understand")) throw new Error("恢复为高风险操作，请显式附加 --i-understand");
    if (!file.endsWith(".dump")) throw new Error("--restore-files 只接受 .dump；逻辑快照请使用 --restore");
    const storage = await verifyStorageForBackup(file);
    if (storage.status !== "complete") throw new Error("该数据库备份没有完整的上传文件 sidecar，拒绝恢复");
    await restoreStorageSnapshot({ snapshotDir: storageDirForBackup(file), targetRoot: storageRoot() });
    console.log(`[backup] 上传文件恢复完成：${storage.fileCount} 个文件，${storage.totalBytes} 字节`);
    return;
  }

  if (restoreIndex >= 0) {
    const file = path.resolve(args[restoreIndex + 1] || "");
    if (!args.includes("--i-understand")) throw new Error("恢复为高风险操作，请显式附加 --i-understand");
    if (!file.endsWith(".snapshot.json.gz")) throw new Error("逻辑恢复只接受 .snapshot.json.gz；custom 格式请用 pg_restore");
    const { snapshot } = verifySnapshot(file);
    const storage = await verifyStorageForBackup(file);
    console.log(`[backup] 准备恢复 ${snapshot.tables.length} 张表，快照时间 ${snapshot.createdAt}`);
    let storageRestored = false;
    try {
      if (storage.status === "complete") {
        await restoreStorageSnapshot({ snapshotDir: storageDirForBackup(file), targetRoot: storageRoot() });
        storageRestored = true;
        console.log(`[backup] 上传文件恢复完成：${storage.fileCount} 个文件，${storage.totalBytes} 字节`);
      } else {
        console.warn("[backup] 警告：旧版快照不包含上传文件，仅恢复数据库行");
      }
      const inserted = await snapshotRestore(cfg, snapshot);
      console.log(`[backup] 恢复完成，共写入 ${inserted} 行`);
    } catch (error) {
      if (storageRestored) rmSync(storageRoot(), { recursive: true, force: true });
      throw error;
    }
    return;
  }

  mkdirSync(BACKUP_DIR, { recursive: true });
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  const stamp = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
  const base = `xungen-${stamp}`;
  const useDump = Boolean(findTool("pg_dump") && findTool("pg_restore"));
  const backupFile = path.join(BACKUP_DIR, `${base}.${useDump ? "dump" : "snapshot.json.gz"}`);
  if (existsSync(backupFile)) throw new Error(`同名备份已存在，为避免覆盖请稍后重试：${backupFile}`);

  const finish = (meta) => {
    const raw = readFileSync(backupFile);
    const hash = sha256(raw);
    writeProtected(`${backupFile}.sha256`, `${hash}  ${path.basename(backupFile)}\n`);
    const manifest = {
      createdAt: new Date().toISOString(),
      database: `${cfg.host}:${cfg.port}/${cfg.database}`,
      file: path.basename(backupFile),
      format: meta.format,
      engine: meta.engine,
      verifiedBy: meta.verifiedBy,
      bytes: raw.length,
      sha256: hash,
      tables: meta.tables ?? null,
      rows: meta.rows ?? null,
      storage: meta.storage ?? null,
      note: "生产推荐使用 pg_dump/pg_restore；逻辑快照需先执行 prisma migrate deploy 建表。数据库与上传文件 sidecar 必须成套保管；恢复绝不覆盖非空库。",
    };
    writeProtected(path.join(BACKUP_DIR, `${base}.manifest.json`), JSON.stringify(manifest, null, 2));
    const removed = prune();
    console.log(`[backup] 模式：${useDump ? "官方 pg_dump custom 格式" : "逻辑快照（本机缺少 pg_dump）"}`);
    console.log(`[backup] 备份完成：${path.relative(ROOT, backupFile)}`);
    if (meta.tables !== undefined) console.log(`[backup] ${meta.tables} 张表，${meta.rows} 行数据`);
    console.log(`[backup] 大小 ${raw.length} 字节；sha256 ${hash}；校验方式 ${meta.verifiedBy}`);
    console.log(`[backup] 保留最近 ${KEEP} 份，清理 ${removed.length} 个旧文件`);
    if (removed.length) console.log(`[backup] 已清理：${removed.join(", ")}`);
    console.log(`[backup] 恢复命令：${restoreHint(path.relative(ROOT, backupFile), cfg)}`);
  };

  try {
    if (useDump) {
      const meta = pgDumpBackup(cfg, backupFile);
      const storage = await createStorageBackup(cfg, base);
      finish({ format: meta.format, engine: meta.engine, verifiedBy: meta.verifiedBy, storage });
    } else {
      const snapshot = await snapshotBackup(cfg);
      writeProtected(backupFile, gzipSync(Buffer.from(JSON.stringify(snapshot), "utf8"), { level: 9 }));
      const verified = verifySnapshot(backupFile);
      const storage = await createStorageBackup(cfg, base);
      finish({
        format: "xungen-logical-snapshot-v1 (gzip JSON, 数据行)",
        engine: "pg driver (node-postgres)",
        verifiedBy: verified.verifiedBy,
        tables: snapshot.tables.length,
        rows: snapshot.tables.reduce((s, t) => s + t.rowCount, 0),
        storage,
      });
    }
  } catch (error) {
    for (const file of [backupFile, `${backupFile}.sha256`, path.join(BACKUP_DIR, `${base}.manifest.json`)]) {
      if (existsSync(file)) unlinkSync(file);
    }
    const directory = storageDirForBackup(backupFile);
    if (existsSync(directory)) rmSync(directory, { recursive: true, force: true });
    throw error;
  }
}

main().catch((error) => {
  console.error(`[backup] 失败：${error.message}`);
  process.exitCode = 1;
});
