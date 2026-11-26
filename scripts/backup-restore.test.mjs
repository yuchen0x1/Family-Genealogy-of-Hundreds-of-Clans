import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes, randomUUID, createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync, gunzipSync } from "node:zlib";
import pg from "pg";
import { restoreSnapshot } from "./backup-restore.mjs";

const isolated = process.env.EVOLUTION_ISOLATED_TEST === "1" &&
  process.env.DATABASE_URL === "postgresql://evolution@127.0.0.1:55439/evolution?schema=public";
const quote = (value) => `"${String(value).replaceAll('"', '""')}"`;
const root = fileURLToPath(new URL("../", import.meta.url));

test("ordinary PostgreSQL role backs up and restores cyclic references, files, and rollback", {
  skip: !isolated,
  timeout: 90_000,
}, async (context) => {
  const adminUrl = new URL(process.env.DATABASE_URL);
  adminUrl.search = "";
  adminUrl.pathname = "/postgres";
  const admin = new pg.Client({ connectionString: adminUrl.href });
  const role = `backup_restore_${randomBytes(6).toString("hex")}`;
  const databases = [`${role}_source`, `${role}_target`];
  const directory = await mkdtemp(path.join(os.tmpdir(), "xungen-backup-restore-"));
  const connections = [];
  const roleUrl = (database) => {
    const url = new URL(adminUrl);
    url.username = role;
    url.password = "";
    url.pathname = `/${database}`;
    return url.href;
  };
  const invokeBackup = (database, uploads, ...args) => {
    const env = {
      ...process.env, PATH: "", DATABASE_URL: roleUrl(database),
      BACKUP_DIR: path.join(directory, "backups"), UPLOAD_DIR: uploads, BACKUP_KEEP: "7",
    };
    delete env.PG_DUMP_PATH;
    delete env.PG_RESTORE_PATH;
    const result = spawnSync(process.execPath, [path.join(root, "scripts", "backup.mjs"), ...args], {
      cwd: directory, env, encoding: "utf8", timeout: 30_000,
    });
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
    return result.stdout;
  };
  try {
    await admin.connect();
    await admin.query(`CREATE ROLE ${quote(role)} LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION`);
    for (const database of databases) {
      await admin.query(`CREATE DATABASE ${quote(database)} OWNER ${quote(role)}`);
      const client = new pg.Client({ connectionString: roleUrl(database) });
      await client.connect();
      connections.push(client);
      const migrationsRoot = path.join(root, "prisma", "migrations");
      for (const name of (await readdir(migrationsRoot)).filter((entry) => /^\d/.test(entry)).sort()) {
        await client.query(await readFile(path.join(migrationsRoot, name, "migration.sql"), "utf8"));
      }
    }
    const [source, target] = connections;
    const roleInfo = (await target.query("SELECT rolsuper, rolreplication FROM pg_roles WHERE rolname = current_user")).rows[0];
    assert.deepEqual(roleInfo, { rolsuper: false, rolreplication: false });
    const ids = Object.fromEntries(["user", "family", "member", "branch", "branchChild", "post", "comment", "reply", "division", "divisionChild", "document", "version"].map((name) => [name, randomUUID()]));
    await source.query("INSERT INTO users(id,email,password_hash,updated_at) VALUES($1,'backup-fixture@example.invalid','fixture',now())", [ids.user]);
    await source.query("INSERT INTO families(id,name,surname_text,owner_id,updated_at) VALUES($1,'Backup fixture','Fixture',$2,now())", [ids.family, ids.user]);
    await source.query("INSERT INTO family_members(id,family_id,surname_text,given_name,updated_at) VALUES($1,$2,'Fixture','Member',now())", [ids.member, ids.family]);
    await source.query("INSERT INTO family_branches(id,family_id,name,root_person_id,updated_at) VALUES($1,$2,'Parent',$3,now())", [ids.branch, ids.family, ids.member]);
    await source.query("INSERT INTO family_branches(id,family_id,name,parent_id,root_person_id,updated_at) VALUES($1,$2,'Child',$3,$4,now())", [ids.branchChild, ids.family, ids.branch, ids.member]);
    await source.query("UPDATE family_members SET branch_id=$1 WHERE id=$2", [ids.branchChild, ids.member]);
    await source.query("INSERT INTO posts(id,author_id,family_id,title,content,updated_at) VALUES($1,$2,$3,'Fixture','Fixture',now())", [ids.post, ids.user, ids.family]);
    await source.query("INSERT INTO comments(id,post_id,author_id,content,updated_at) VALUES($1,$2,$3,'Parent',now())", [ids.comment, ids.post, ids.user]);
    await source.query("INSERT INTO comments(id,post_id,author_id,parent_id,content,updated_at) VALUES($1,$2,$3,$4,'Child',now())", [ids.reply, ids.post, ids.user, ids.comment]);
    await source.query("INSERT INTO administrative_divisions(id,name,level) VALUES($1,'Parent','PROVINCE')", [ids.division]);
    await source.query("INSERT INTO administrative_divisions(id,name,level,parent_id) VALUES($1,'Child','CITY',$2)", [ids.divisionChild, ids.division]);
    const uploads = path.join(directory, "source-uploads");
    const targetUploads = path.join(directory, "target-uploads");
    const key = `${ids.family}/${ids.document}/fixture.txt`;
    const content = "backup fixture file\n";
    const checksum = createHash("sha256").update(content).digest("hex");
    await mkdir(path.dirname(path.join(uploads, key)), { recursive: true });
    await writeFile(path.join(uploads, key), content);
    await source.query("INSERT INTO family_documents(id,family_id,title,file_name,storage_key,mime_type,size_bytes,checksum,updated_at) VALUES($1,$2,'Fixture','fixture.txt',$3,'text/plain',$4,$5,now())", [ids.document, ids.family, key, Buffer.byteLength(content), checksum]);
    await source.query("INSERT INTO document_versions(id,document_id,version_number,storage_key,size_bytes,checksum) VALUES($1,$2,1,$3,$4,$5)", [ids.version, ids.document, key, Buffer.byteLength(content), checksum]);
    invokeBackup(databases[0], uploads);
    const backups = path.join(directory, "backups");
    const name = (await readdir(backups)).find((entry) => entry.endsWith(".snapshot.json.gz"));
    assert.ok(name, "expected the logical backup fallback");
    const file = path.join(backups, name);
    invokeBackup(databases[0], uploads, "--verify", file);
    const snapshot = JSON.parse(gunzipSync(await readFile(file)).toString("utf8"));
    for (const table of snapshot.tables) table.rows.reverse();
    const expectedRows = snapshot.tables.reduce((sum, table) => sum + table.rows.length, 0);
    assert.equal(expectedRows, 12);
    assert.equal(await restoreSnapshot(target, { ...snapshot, tables: snapshot.tables.map((table) => ({ ...table, rows: [] })) }), 0);
    const invalid = structuredClone(snapshot);
    invalid.tables.find((table) => table.name === "family_members").rows[0].branch_id = randomUUID();
    await assert.rejects(restoreSnapshot(target, invalid), (error) => error.code === "23503");
    assert.equal((await target.query("SELECT count(*)::int AS n FROM users")).rows[0].n, 0);
    const bytes = gzipSync(JSON.stringify(snapshot));
    const digest = createHash("sha256").update(bytes).digest("hex");
    await writeFile(file, bytes);
    await writeFile(`${file}.sha256`, `${digest}  ${name}\n`);
    const manifestFile = path.join(backups, name.replace(".snapshot.json.gz", ".manifest.json"));
    const manifest = JSON.parse(await readFile(manifestFile, "utf8"));
    await writeFile(manifestFile, JSON.stringify({ ...manifest, bytes: bytes.length, sha256: digest }));
    invokeBackup(databases[1], targetUploads, "--restore", file, "--i-understand");
    for (const table of snapshot.tables) {
      const restored = (await target.query(`SELECT * FROM ${quote(table.name)}`)).rows;
      const original = (await source.query(`SELECT * FROM ${quote(table.name)}`)).rows;
      const normalize = (rows) => rows.map((row) => JSON.stringify(row)).sort();
      assert.deepEqual(normalize(restored), normalize(original), table.name);
    }
    assert.equal(await readFile(path.join(targetUploads, key), "utf8"), content);
    await assert.rejects(restoreSnapshot(target, snapshot), /not empty/);
    context.diagnostic(`Restored ${expectedRows} rows across ${snapshot.tables.length} tables and one upload using a non-superuser; verified empty restore, deferred-FK rollback, and non-empty-target refusal.`);
  } finally {
    for (const connection of connections) await connection.end().catch(() => undefined);
    for (const database of databases) await admin.query(`DROP DATABASE IF EXISTS ${quote(database)} WITH (FORCE)`).catch(() => undefined);
    await admin.query(`DROP ROLE IF EXISTS ${quote(role)}`).catch(() => undefined);
    await admin.end().catch(() => undefined);
    await rm(directory, { recursive: true, force: true });
  }
});
