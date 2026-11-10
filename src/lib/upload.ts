/**
 * 上传文件安全校验：扩展名 + MIME 白名单 + 文件头 magic bytes + 体积限制 + 文件名清洗。
 * 仅凭客户端声明的 Content-Type 是不可信的，必须结合实际字节判断。
 */
import path from "node:path";
import { ApiError } from "@/lib/api";

const MAX_MB = Math.max(1, Math.min(200, Number(process.env.MAX_UPLOAD_MB) || 20));
export const MAX_UPLOAD_BYTES = MAX_MB * 1024 * 1024;

type Rule = { mimes: string[]; exts: string[]; magic?: (b: Buffer) => boolean };

const startsWith = (s: string) => (b: Buffer) => b.subarray(0, s.length).toString("latin1") === s;

const RULES: Record<string, Rule> = {
  jpeg: { mimes: ["image/jpeg"], exts: [".jpg", ".jpeg"], magic: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  png: { mimes: ["image/png"], exts: [".png"], magic: startsWith("\x89PNG\r\n\x1a\n") },
  gif: { mimes: ["image/gif"], exts: [".gif"], magic: (b) => ["GIF87a", "GIF89a"].includes(b.subarray(0, 6).toString("latin1")) },
  webp: { mimes: ["image/webp"], exts: [".webp"], magic: (b) => b.subarray(0, 4).toString("latin1") === "RIFF" && b.subarray(8, 12).toString("latin1") === "WEBP" },
  pdf: { mimes: ["application/pdf", "application/x-pdf"], exts: [".pdf"], magic: startsWith("%PDF-") },
  mp4: { mimes: ["video/mp4"], exts: [".mp4"], magic: (b) => b.subarray(4, 8).toString("latin1") === "ftyp" },
  mp3: { mimes: ["audio/mpeg", "audio/mp3"], exts: [".mp3"], magic: (b) => b[0] === 0xff && (b[1] & 0xe0) === 0xe0 || startsWith("ID3")(b) },
  wav: { mimes: ["audio/wav", "audio/x-wav", "audio/wave"], exts: [".wav"], magic: (b) => b.subarray(0, 4).toString("latin1") === "RIFF" && b.subarray(8, 12).toString("latin1") === "WAVE" },
  text: { mimes: ["text/plain", "text/csv", "application/json", "application/octet-stream", ""], exts: [".txt", ".csv", ".json", ".ged", ".md"], magic: isProbablyText },
};

function isProbablyText(b: Buffer): boolean {
  const sample = b.subarray(0, Math.min(4096, b.length));
  // 文本文件不应包含 NUL 字节；UTF-8 BOM 允许
  return !sample.includes(0);
}

export function cleanFileName(raw: string): string {
  const base = path.basename(String(raw || "upload.bin").replace(/\\/g, "/"));
  const cleaned = base.replace(/[\x00-\x1f\x7f]/g, "").replace(/[^\w.\-\u4e00-\u9fa5 ()（）]/g, "_").trim();
  const name = cleaned || "upload.bin";
  return name.length > 200 ? name.slice(-200) : name;
}

export type ValidUpload = {
  bytes: Buffer; fileName: string; mimeType: string; size: number; ext: string;
};

/** 校验失败抛 ApiError（400/413），供 route 统一转结构化响应。 */
export async function validateUpload(file: File): Promise<ValidUpload> {
  if (!file || typeof file.arrayBuffer !== "function") throw new ApiError(400, "未收到上传文件", "NO_FILE");
  const size = file.size;
  if (size <= 0) throw new ApiError(400, "文件为空", "EMPTY_FILE");
  if (size > MAX_UPLOAD_BYTES) {
    throw new ApiError(413, `文件超过 ${MAX_MB} MB 限制`, "FILE_TOO_LARGE");
  }
  const bytes = Buffer.from(await file.arrayBuffer());
  if (bytes.byteLength > MAX_UPLOAD_BYTES) throw new ApiError(413, `文件超过 ${MAX_MB} MB 限制`, "FILE_TOO_LARGE");

  const fileName = cleanFileName(file.name);
  const ext = (fileName.match(/\.[A-Za-z0-9]{1,10}$/)?.[0] || "").toLowerCase();
  if (!ext) throw new ApiError(400, "文件缺少扩展名，无法判断类型", "UNKNOWN_FILE_TYPE");

  const declared = (file.type || "").toLowerCase();
  const rule = Object.values(RULES).find((r) => r.exts.includes(ext));
  if (!rule) throw new ApiError(400, `不支持的文件类型：${ext}`, "UNSUPPORTED_FILE_TYPE");
  if (declared && !rule.mimes.includes(declared) && !(ext === ".ged" && declared === "application/octet-stream")) {
    throw new ApiError(400, `文件类型与内容声明不一致（${declared} / ${ext}）`, "MIME_MISMATCH");
  }
  if (rule.magic && !rule.magic(bytes)) {
    throw new ApiError(400, "文件内容与扩展名不符，可能被篡改或伪装", "MAGIC_MISMATCH");
  }

  // 规范化 MIME：不信任客户端声明，按实际扩展名给出服务端判定
  const mimeType = ({
    ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".gif": "image/gif", ".webp": "image/webp",
    ".pdf": "application/pdf", ".mp4": "video/mp4", ".mp3": "audio/mpeg", ".wav": "audio/wav",
    ".txt": "text/plain", ".csv": "text/csv", ".json": "application/json", ".ged": "text/plain", ".md": "text/markdown",
  } as Record<string, string>)[ext] || "application/octet-stream";

  return { bytes, fileName, mimeType, size: bytes.byteLength, ext };
}

export const UPLOAD_LIMIT_MB = MAX_MB;

/** 允许的图片 MIME（用于前端 accept 提示与文档展示）。 */
export const ACCEPTED_EXTENSIONS = ".jpg,.jpeg,.png,.webp,.gif,.pdf,.txt,.csv,.json,.ged,.md,.mp3,.wav,.mp4";
