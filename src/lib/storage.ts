/**
 * 文件存储抽象层。
 *
 * 安全要求：
 * - 上传目录必须位于 public/ 之外，文件绝不作为静态资源暴露。
 * - 读取文件必须先通过 /api/families/[id]/documents/[docId]/download 做家族级 + 人物级鉴权。
 * - storageKey 由服务端生成，永不接受客户端提供的路径；读取前再做白名单校验，防止路径穿越。
 *
 * 当前实现：local 驱动（已在本项目验证）。
 * S3 兼容对象存储：需要真实凭据与外网环境，属于外部依赖，未在本环境验证；
 * 配置 STORAGE_DRIVER=s3 时会返回明确的依赖错误，不会伪造成功。
 */
import { mkdir, readFile, writeFile, unlink, stat } from "node:fs/promises";
import path from "node:path";
import { randomBytes, createHash } from "node:crypto";

export type StoredObject = { bytes: Buffer; size: number };

const DRIVER = (process.env.STORAGE_DRIVER || "local").toLowerCase();
const LOCAL_ROOT = path.resolve(process.cwd(), process.env.UPLOAD_DIR || "./.storage/uploads");

/** storageKey 仅允许 ASCII 安全字符与 / 分层；拒绝 ..、绝对路径、反斜杠与空段。 */
export function assertSafeKey(key: string): string {
  if (!key || typeof key !== "string") throw new Error("无效的存储键");
  if (key.startsWith("/") || key.includes("\\") || key.includes("..") || key.includes("\0")) {
    throw new Error("非法的存储键");
  }
  const parts = key.split("/");
  if (parts.some((p) => !p || !/^[A-Za-z0-9._-]+$/.test(p))) throw new Error("非法的存储键");
  return key;
}

export function newStorageKey(familyId: string, documentId: string, originalName: string): string {
  const ext = (originalName.match(/\.[A-Za-z0-9]{1,10}$/)?.[0] || ".bin").toLowerCase();
  const safeExt = /^\.[a-z0-9]{1,10}$/.test(ext) ? ext : ".bin";
  return `${familyId}/${documentId}/${randomBytes(12).toString("hex")}${safeExt}`;
}

export function checksum(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function localPath(key: string): string {
  const resolved = path.resolve(LOCAL_ROOT, assertSafeKey(key));
  // 二次确认仍在根目录内
  if (!resolved.startsWith(LOCAL_ROOT + path.sep)) throw new Error("非法的存储路径");
  return resolved;
}

function assertLocalDriver() {
  if (DRIVER !== "local") {
    throw new Error(
      "STORAGE_DRIVER=s3 需要真实的对象存储凭据与外网环境；当前部署未配置或尚未验证该依赖。" +
      "请改用 STORAGE_DRIVER=local，或在完成 S3 凭据配置与联调后再启用。",
    );
  }
}

export async function putObject(key: string, bytes: Buffer): Promise<{ size: number; checksum: string }> {
  assertLocalDriver();
  const target = localPath(key);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, bytes, { flag: "wx" });
  return { size: bytes.byteLength, checksum: checksum(bytes) };
}

export async function getObject(key: string): Promise<StoredObject | null> {
  assertLocalDriver();
  const target = localPath(key);
  try {
    const info = await stat(target);
    if (!info.isFile()) return null;
    return { bytes: await readFile(target), size: info.size };
  } catch {
    return null;
  }
}

export async function deleteObject(key: string): Promise<void> {
  assertLocalDriver();
  try { await unlink(localPath(key)); } catch { /* 文件不存在时视为已删除 */ }
}

export function storageInfo() {
  return { driver: DRIVER, localRoot: DRIVER === "local" ? LOCAL_ROOT : null, s3Configured: false };
}
