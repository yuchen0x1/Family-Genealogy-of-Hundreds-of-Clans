import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  copyStorageSnapshot,
  restoreStorageSnapshot,
  verifyStorageSnapshot,
} from "./storage-snapshot.mjs";

async function tempDir(prefix) {
  return mkdtemp(path.join(os.tmpdir(), prefix));
}

test("copies, verifies, and restores nested storage keys", async () => {
  const root = await tempDir("xungen-storage-source-");
  const sidecar = await tempDir("xungen-storage-backup-");
  const target = path.join(await tempDir("xungen-storage-target-parent-"), "uploads");
  try {
    const key = "family-1/document-1/archive.txt";
    await mkdir(path.dirname(path.join(root, key)), { recursive: true });
    await writeFile(path.join(root, key), "archive bytes\n");
    const created = await copyStorageSnapshot({ sourceRoot: root, targetDir: sidecar, keys: [key, key] });
    assert.equal(created.fileCount, 1);
    assert.equal((await verifyStorageSnapshot(sidecar)).fileCount, 1);
    await restoreStorageSnapshot({ snapshotDir: sidecar, targetRoot: target });
    assert.equal(await readFile(path.join(target, key), "utf8"), "archive bytes\n");
  } finally {
    await Promise.all([rm(root, { recursive: true, force: true }), rm(sidecar, { recursive: true, force: true }), rm(path.dirname(target), { recursive: true, force: true })]);
  }
});

test("rejects missing and tampered objects", async () => {
  const root = await tempDir("xungen-storage-source-");
  const sidecar = await tempDir("xungen-storage-backup-");
  try {
    const key = "family-1/document-1/archive.txt";
    await mkdir(path.dirname(path.join(root, key)), { recursive: true });
    await writeFile(path.join(root, key), "original");
    await copyStorageSnapshot({ sourceRoot: root, targetDir: sidecar, keys: [key] });
    await writeFile(path.join(sidecar, key), "tampered");
    await assert.rejects(verifyStorageSnapshot(sidecar), /校验和/);
    await assert.rejects(copyStorageSnapshot({ sourceRoot: root, targetDir: path.join(sidecar, "missing"), keys: ["missing/file.txt"] }), /不存在/);
  } finally {
    await Promise.all([rm(root, { recursive: true, force: true }), rm(sidecar, { recursive: true, force: true })]);
  }
});

test("rejects unsafe manifest keys and non-empty restore targets", async () => {
  const sidecar = await tempDir("xungen-storage-backup-");
  const target = await tempDir("xungen-storage-target-");
  try {
    await writeFile(path.join(sidecar, "manifest.json"), JSON.stringify({
      kind: "xungen-storage-snapshot-v1", fileCount: 1, totalBytes: 1,
      files: [{ key: "../escape.txt", size: 1, sha256: "a".repeat(64) }],
    }));
    await assert.rejects(verifyStorageSnapshot(sidecar), /非法的存储键/);

    await writeFile(path.join(sidecar, "manifest.json"), JSON.stringify({ kind: "xungen-storage-snapshot-v1", fileCount: 0, totalBytes: 0, files: [] }));
    await writeFile(path.join(target, "existing.txt"), "do not overwrite");
    await assert.rejects(restoreStorageSnapshot({ snapshotDir: sidecar, targetRoot: target }), /目录非空/);
  } finally {
    await Promise.all([rm(sidecar, { recursive: true, force: true }), rm(target, { recursive: true, force: true })]);
  }
});

test("rejects duplicate manifest keys", async () => {
  const sidecar = await tempDir("xungen-storage-backup-");
  try {
    await writeFile(path.join(sidecar, "manifest.json"), JSON.stringify({
      kind: "xungen-storage-snapshot-v1", fileCount: 2, totalBytes: 2,
      files: [
        { key: "a.txt", size: 1, sha256: "a".repeat(64) },
        { key: "a.txt", size: 1, sha256: "a".repeat(64) },
      ],
    }));
    await assert.rejects(verifyStorageSnapshot(sidecar), /重复存储键/);
  } finally {
    await rm(sidecar, { recursive: true, force: true });
  }
});
