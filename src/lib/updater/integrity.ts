import { createReadStream } from "node:fs";
import { createHash, createVerify } from "node:crypto";
import { readFile } from "node:fs/promises";

/** GitHub API digest 常见格式：sha256:<64 hex>；.sha256 文件则通常是 hex + 文件名。 */
export function normalizeSha256(value: string | null | undefined): string | null {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const digest = raw.match(/(?:sha256:)?([a-f0-9]{64})/i)?.[1];
  return digest ? digest.toLowerCase() : null;
}

/** 从 sha256sum 输出中提取指定资产的摘要；没有文件名时取唯一摘要。 */
export function parseSha256Manifest(text: string, assetName?: string): string | null {
  const lines = String(text ?? "").split(/\r?\n/);
  const candidates = lines
    .map((line) => {
      const match = line.match(/^\s*([a-f0-9]{64})\s+(?:\*?(.+?))?\s*$/i);
      return match ? { digest: match[1].toLowerCase(), name: match[2]?.trim() || null } : null;
    })
    .filter((entry): entry is { digest: string; name: string | null } => Boolean(entry));
  if (assetName) {
    const exact = candidates.find((entry) => entry.name === assetName || entry.name?.endsWith(`/${assetName}`));
    if (exact) return exact.digest;
  }
  return candidates.length === 1 ? candidates[0].digest : null;
}

export async function sha256File(filePath: string): Promise<string> {
  const hash = createHash("sha256");
  await new Promise<void>((resolve, reject) => {
    const stream = createReadStream(filePath);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.once("error", reject);
    stream.once("end", resolve);
  });
  return hash.digest("hex");
}

export async function verifyDetachedSignature(filePath: string, signatureText: string, publicKey: string): Promise<boolean> {
  const encoded = String(signatureText ?? "").trim();
  if (!encoded) return false;
  let signature: Buffer;
  try {
    signature = Buffer.from(encoded, "base64");
    if (signature.length === 0) return false;
  } catch {
    return false;
  }
  const verifier = createVerify("sha256");
  verifier.update(await readFile(filePath));
  verifier.end();
  try {
    return verifier.verify(publicKey.replace(/\\n/g, "\n"), signature);
  } catch {
    return false;
  }
}

export function assertTrustedGitHubAssetUrl(value: string, repo: string): URL {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("更新资产地址不是有效 URL");
  }
  if (url.protocol !== "https:") throw new Error("更新资产必须通过 HTTPS 下载");
  if (url.hostname !== "api.github.com" && url.hostname !== "github.com") {
    throw new Error("更新资产地址不是 GitHub 官方域名");
  }
  const encodedRepo = repo.split("/").map((part) => encodeURIComponent(part)).join("/");
  if (!url.pathname.includes(`/repos/${encodedRepo}/`) && !url.pathname.includes(`/${encodedRepo}/releases/`)) {
    throw new Error("更新资产地址与配置的 GitHub 仓库不匹配");
  }
  return url;
}
