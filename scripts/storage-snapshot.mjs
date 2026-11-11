import { copyFile, chmod, lstat, mkdir, readdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { createHash, randomBytes } from "node:crypto";
import { createReadStream } from "node:fs";
import path from "node:path";

export const STORAGE_SNAPSHOT_KIND = "xungen-storage-snapshot-v1";
export const STORAGE_MANIFEST_NAME = "manifest.json";

export function assertSafeStorageKey(key) {
  if (!key || typeof key !== "string") throw new Error("无效的存储键");
  if (key.startsWith("/") || key.includes("\\") || key.includes("..") || key.includes("\0")) {
    throw new Error(`非法的存储键：${key}`);
  }
  const parts = key.split("/");
  if (parts.some((part) => !part || !/^[A-Za-z0-9._-]+$/.test(part))) {
    throw new Error(`非法的存储键：${key}`);
  }
  if (key === STORAGE_MANIFEST_NAME) throw new Error(`存储键保留：${key}`);
  return key;
}

function safePath(root, key) {
  const base = path.resolve(root);
  const resolved = path.resolve(base, assertSafeStorageKey(key));
  if (resolved !== base && !resolved.startsWith(`${base}${path.sep}`)) {
    throw new Error(`非法的存储路径：${key}`);
  }
  return resolved;
}

async function ensureEmptyDirectory(dir) {
  try {
    const info = await lstat(dir);
    if (!info.isDirectory() || info.isSymbolicLink()) throw new Error(`目标不是普通目录：${dir}`);
    if ((await readdir(dir)).length > 0) throw new Error(`目录非空，拒绝覆盖：${dir}`);
  } catch (error) {
    if (error?.code === "ENOENT") {
      await mkdir(dir, { recursive: true });
      return;
    }
    throw error;
  }
}

function sha256Buffer(value) {
  return createHash("sha256").update(value).digest("hex");
}

export function sha256File(file) {
  return new Promise((resolve, reject) => {
    const hash = createHash("sha256");
    const stream = createReadStream(file);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("error", reject);
    stream.on("end", () => resolve(hash.digest("hex")));
  });
}

async function validateManifest(manifest) {
  if (!manifest || manifest.kind !== STORAGE_SNAPSHOT_KIND || !Array.isArray(manifest.files)) {
    throw new Error("文件快照清单格式无法识别");
  }
  const seen = new Set();
  let totalBytes = 0;
  const files = manifest.files.map((entry) => {
    const key = assertSafeStorageKey(entry?.key);
    if (seen.has(key)) throw new Error(`文件快照包含重复存储键：${key}`);
    seen.add(key);
    if (!Number.isSafeInteger(entry.size) || entry.size < 0) throw new Error(`文件大小无效：${key}`);
    if (!/^[a-f0-9]{64}$/.test(entry.sha256)) throw new Error(`文件校验和无效：${key}`);
    totalBytes += entry.size;
    return { key, size: entry.size, sha256: entry.sha256 };
  });
  if (manifest.fileCount !== files.length || manifest.totalBytes !== totalBytes) {
    throw new Error("文件快照清单统计不一致");
  }
  return files;
}

async function walkFiles(root, prefix = "") {
  const result = [];
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    const full = path.join(root, entry.name);
    if (entry.isSymbolicLink()) throw new Error(`文件快照包含符号链接：${relative}`);
    if (entry.isDirectory()) result.push(...await walkFiles(full, relative));
    else if (entry.isFile()) result.push(relative.replaceAll(path.sep, "/"));
    else throw new Error(`文件快照包含不支持的文件类型：${relative}`);
  }
  return result;
}

export async function copyStorageSnapshot({ sourceRoot, targetDir, keys }) {
  await ensureEmptyDirectory(targetDir);
  const uniqueKeys = [...new Set(keys ?? [])].sort();
  const files = [];
  for (const key of uniqueKeys) {
    const source = safePath(sourceRoot, key);
    const sourceInfo = await lstat(source).catch((error) => {
      if (error?.code === "ENOENT") throw new Error(`存储文件不存在：${key}`);
      throw error;
    });
    if (!sourceInfo.isFile() || sourceInfo.isSymbolicLink()) throw new Error(`存储对象不是普通文件：${key}`);
    const destination = safePath(targetDir, key);
    await mkdir(path.dirname(destination), { recursive: true });
    await copyFile(source, destination);
    const destinationInfo = await stat(destination);
    files.push({ key, size: destinationInfo.size, sha256: await sha256File(destination) });
  }

  const manifest = {
    kind: STORAGE_SNAPSHOT_KIND,
    createdAt: new Date().toISOString(),
    fileCount: files.length,
    totalBytes: files.reduce((sum, file) => sum + file.size, 0),
    files,
  };
  const manifestPath = path.join(targetDir, STORAGE_MANIFEST_NAME);
  const manifestBytes = Buffer.from(JSON.stringify(manifest, null, 2), "utf8");
  await writeFile(manifestPath, manifestBytes, { flag: "wx", mode: 0o600 });
  try { await chmod(manifestPath, 0o600); } catch { /* Windows does not expose POSIX modes. */ }
  return {
    directory: path.basename(targetDir),
    fileCount: manifest.fileCount,
    totalBytes: manifest.totalBytes,
    manifestSha256: sha256Buffer(manifestBytes),
  };
}

export async function verifyStorageSnapshot(snapshotDir) {
  const manifestPath = path.join(snapshotDir, STORAGE_MANIFEST_NAME);
  const manifestBytes = await readFile(manifestPath);
  const manifest = JSON.parse(manifestBytes.toString("utf8"));
  const files = await validateManifest(manifest);
  const listed = new Set(files.map((file) => file.key));
  const actual = (await walkFiles(snapshotDir)).filter((file) => file !== STORAGE_MANIFEST_NAME);
  if (actual.length !== listed.size || actual.some((file) => !listed.has(file))) {
    throw new Error("文件快照存在未列入清单的文件");
  }
  for (const file of files) {
    const full = safePath(snapshotDir, file.key);
    const info = await lstat(full);
    if (!info.isFile() || info.isSymbolicLink()) throw new Error(`文件快照对象无效：${file.key}`);
    if (info.size !== file.size) throw new Error(`文件大小校验失败：${file.key}`);
    if (await sha256File(full) !== file.sha256) throw new Error(`文件校验和失败：${file.key}`);
  }
  return {
    directory: path.basename(snapshotDir),
    fileCount: files.length,
    totalBytes: files.reduce((sum, file) => sum + file.size, 0),
    manifestSha256: sha256Buffer(manifestBytes),
  };
}

export async function restoreStorageSnapshot({ snapshotDir, targetRoot }) {
  const verification = await verifyStorageSnapshot(snapshotDir);
  await ensureEmptyDirectory(targetRoot);
  const temporary = `${targetRoot}.restore-${randomBytes(8).toString("hex")}`;
  let committed = false;
  try {
    await mkdir(temporary, { recursive: true });
    const manifestPath = path.join(snapshotDir, STORAGE_MANIFEST_NAME);
    await copyFile(manifestPath, path.join(temporary, STORAGE_MANIFEST_NAME));
    const manifest = JSON.parse((await readFile(manifestPath)).toString("utf8"));
    const files = await validateManifest(manifest);
    for (const file of files) {
      const destination = safePath(temporary, file.key);
      await mkdir(path.dirname(destination), { recursive: true });
      await copyFile(safePath(snapshotDir, file.key), destination);
    }
    await verifyStorageSnapshot(temporary);
    await rm(targetRoot, { recursive: true, force: true });
    await rename(temporary, targetRoot);
    committed = true;
    return verification;
  } finally {
    if (!committed) await rm(temporary, { recursive: true, force: true }).catch(() => undefined);
  }
}
