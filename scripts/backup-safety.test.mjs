import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { beginRestoreTransaction, parseBackupKeep } from "./backup-safety.mjs";
import { planSnapshotRestore } from "./backup-restore.mjs";

test("accepts only positive safe backup counts", () => {
  assert.equal(parseBackupKeep(undefined), 7);
  assert.equal(parseBackupKeep("1"), 1);
  assert.equal(parseBackupKeep("12"), 12);
  for (const value of ["", "0", "-1", "1.5", "NaN", "Infinity", "1e2", " 7 ", "9007199254740992"]) {
    assert.throws(() => parseBackupKeep(value), /BACKUP_KEEP/);
  }
});

test("loads and validates .env retention before accessing any backup", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "xungen-backup-config-"));
  const directory = path.join(root, "backups");
  const existing = path.join(directory, "xungen-20261101-000000.snapshot.json.gz");
  try {
    await mkdir(directory);
    await writeFile(existing, "existing backup");
    await writeFile(path.join(root, ".env"), "BACKUP_KEEP=NaN\nDATABASE_URL=postgresql://fixture@127.0.0.1:1/fixture\n");
    const env = { ...process.env };
    delete env.BACKUP_KEEP;
    const result = spawnSync(process.execPath, [fileURLToPath(new URL("./backup.mjs", import.meta.url))], {
      cwd: root, env, encoding: "utf8", timeout: 10_000,
    });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /BACKUP_KEEP/);
    assert.equal(await readFile(existing, "utf8"), "existing backup");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("a permission error falls back before opening the restore transaction", async () => {
  const queries = [];
  let inTransaction = false;
  let aborted = false;
  const client = {
    async query(sql) {
      queries.push(sql);
      if (aborted) throw Object.assign(new Error("transaction aborted"), { code: "25P02" });
      if (sql === "SET session_replication_role = replica") {
        aborted = inTransaction;
        throw Object.assign(new Error("permission denied"), { code: "42501" });
      }
      if (sql === "BEGIN") inTransaction = true;
      return { rows: [] };
    },
  };
  assert.equal(await beginRestoreTransaction(client), false);
  await client.query("SELECT 1");
  assert.deepEqual(queries, ["SET session_replication_role = replica", "BEGIN", "SELECT 1"]);
});

test("does not hide failures other than missing replica permission", async () => {
  const failure = Object.assign(new Error("connection lost"), { code: "08006" });
  const queries = [];
  const client = { async query(sql) { queries.push(sql); throw failure; } };
  await assert.rejects(beginRestoreTransaction(client), (error) => error === failure);
  assert.deepEqual(queries, ["SET session_replication_role = replica"]);
});

test("resets replica mode when opening the restore transaction fails", async () => {
  const queries = [];
  const failure = new Error("BEGIN failed");
  const client = {
    async query(sql) {
      queries.push(sql);
      if (sql === "BEGIN") throw failure;
      return { rows: [] };
    },
  };
  await assert.rejects(beginRestoreTransaction(client), (error) => error === failure);
  assert.deepEqual(queries, ["SET session_replication_role = replica", "BEGIN", "SET session_replication_role = DEFAULT"]);
});

test("reports replica mode when privileged restore initialization succeeds", async () => {
  assert.equal(await beginRestoreTransaction({ query: async () => ({ rows: [] }) }), true);
});

test("restores nullable table cycles and self references in a second pass", () => {
  const tables = [
    { name: "members", columns: ["id", "branch_id"], rows: [{ id: "member", branch_id: "branch" }] },
    { name: "branches", columns: ["id", "root_id", "parent_id"], rows: [{ id: "branch", root_id: "member", parent_id: "parent" }] },
  ];
  const plan = planSnapshotRestore(tables, [
    { child: "members", parent: "branches", columns: ["branch_id"], nullable: true },
    { child: "branches", parent: "members", columns: ["root_id"], nullable: true },
    { child: "branches", parent: "branches", columns: ["parent_id"], nullable: true },
  ], new Map([["members", ["id"]], ["branches", ["id"]]]));
  assert.deepEqual(plan.order, ["branches", "members"]);
  assert.deepEqual([...plan.deferred.get("members")], ["branch_id"]);
  assert.deepEqual([...plan.deferred.get("branches")], ["root_id", "parent_id"]);
});

test("empty tables cannot create a restore dependency cycle", () => {
  const plan = planSnapshotRestore([
    { name: "a", columns: ["id"], rows: [] },
    { name: "b", columns: ["id"], rows: [] },
  ], [
    { child: "a", parent: "b", columns: ["id"], nullable: false },
    { child: "b", parent: "a", columns: ["id"], nullable: false },
  ], new Map());
  assert.deepEqual(plan.order, []);
});

test("required foreign keys still put parents before their children", () => {
  const plan = planSnapshotRestore([
    { name: "a_child", columns: ["id", "parent_id"], rows: [{ id: "child", parent_id: "parent" }] },
    { name: "z_parent", columns: ["id"], rows: [{ id: "parent" }] },
  ], [{ child: "a_child", parent: "z_parent", columns: ["parent_id"], nullable: false }], new Map());
  assert.deepEqual(plan.order, ["z_parent", "a_child"]);
});

test("rejects unsupported required cycles and missing row identifiers before insertion", () => {
  const table = { name: "self", columns: ["id", "parent_id"], rows: [{ id: "a", parent_id: "b" }] };
  assert.throws(() => planSnapshotRestore([table], [
    { child: "self", parent: "self", columns: ["parent_id"], nullable: false },
  ], new Map()), /Non-nullable foreign-key cycle/);
  assert.throws(() => planSnapshotRestore([table], [
    { child: "self", parent: "self", columns: ["parent_id"], nullable: true },
  ], new Map()), /primary key/);
});
