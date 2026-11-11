import { createReadStream } from "node:fs";
import { createGunzip } from "node:zlib";

export const MAX_ARCHIVE_ENTRIES = 50_000;
export const MAX_EXTRACTED_BYTES = 512 * 1024 * 1024;
const MAX_METADATA_BYTES = 1024 * 1024;
const MAX_INFLATED_BYTES = MAX_EXTRACTED_BYTES + MAX_ARCHIVE_ENTRIES * 1024 + 16 * 1024 * 1024;
const BLOCK_SIZE = 512;

function invalid(message: string): never {
  throw new Error(message);
}

function fieldText(field: Buffer): string {
  const end = field.indexOf(0);
  const bytes = end < 0 ? field : field.subarray(0, end);
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return invalid("归档包含无效的 UTF-8 文件名");
  }
}

function octal(field: Buffer, label: string): number {
  if (field[0] & 0x80) return invalid(`归档包含不支持的 ${label} 编码`);
  const text = field.toString("ascii").replace(/^ +/, "").replace(/[\0 ]+$/, "");
  if (!text) return 0;
  if (!/^[0-7]+$/.test(text)) return invalid(`归档包含无效的 ${label}`);
  const value = Number.parseInt(text, 8);
  if (!Number.isSafeInteger(value)) return invalid(`归档 ${label} 超出范围`);
  return value;
}

function parsePax(data: Buffer): Map<string, string> {
  const values = new Map<string, string>();
  let offset = 0;
  while (offset < data.length) {
    const space = data.indexOf(0x20, offset);
    if (space < 0) return invalid("归档包含无效的 PAX 元数据");
    const lengthText = data.toString("ascii", offset, space);
    if (!/^\d+$/.test(lengthText)) return invalid("归档包含无效的 PAX 元数据长度");
    const length = Number(lengthText);
    const end = offset + length;
    if (!Number.isSafeInteger(length) || length <= space - offset + 2 || end > data.length || data[end - 1] !== 0x0a) {
      return invalid("归档包含截断的 PAX 元数据");
    }
    const record = data.subarray(space + 1, end - 1);
    const equals = record.indexOf(0x3d);
    if (equals <= 0) return invalid("归档包含无效的 PAX 字段");
    let key: string;
    let value: string;
    try {
      const decoder = new TextDecoder("utf-8", { fatal: true });
      key = decoder.decode(record.subarray(0, equals));
      value = decoder.decode(record.subarray(equals + 1));
    } catch {
      return invalid("归档包含无效的 PAX 文本");
    }
    if (key === "linkpath") return invalid("归档不允许链接条目");
    if (key.startsWith("GNU.sparse")) return invalid("归档不允许稀疏文件");
    if (!["path", "mtime", "atime", "ctime", "uid", "gid", "uname", "gname", "comment", "charset", "hdrcharset"].includes(key)) {
      return invalid("归档包含不支持的 PAX 扩展字段");
    }
    values.set(key, value);
    offset = end;
  }
  return values;
}

function validatePath(name: string, isDirectory: boolean): string[] {
  if (!name || name.startsWith("/") || name.startsWith("\\") || /^[A-Za-z]:/.test(name) || name.includes("\\")) {
    return invalid("归档包含绝对路径或不安全路径");
  }
  if (/[\u0000-\u001f\u007f]/.test(name)) return invalid("归档文件名包含控制字符");
  const parts = name.split("/");
  if (isDirectory && parts.at(-1) === "") parts.pop();
  if (parts.some((part) => !part || part === "." || part === ".." || part.includes(":") || /[. ]$/.test(part) || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part))) {
    return invalid("归档包含路径穿越或异常路径段");
  }
  return parts;
}

/** 流式检查 tar.gz 内容，不将归档整体载入内存。 */
export async function inspectTarGz(archive: string): Promise<void> {
  const input = createReadStream(archive);
  const gunzip = createGunzip();
  input.on("error", (error) => gunzip.destroy(error));
  input.pipe(gunzip);
  const source = gunzip;
  let buffer = Buffer.alloc(0);
  let inflatedBytes = 0;
  let entries = 0;
  let extractedBytes = 0;
  let remainingData = 0;
  let remainingPadding = 0;
  let dataChunks: Buffer[] | undefined;
  let dataLength = 0;
  let finishData = false;
  let sawZeroBlock = false;
  let ended = false;
  let rootPrefix: string | undefined;
  let nextPath: string | undefined;
  let metadataKind: "pax" | "longname" | undefined;

  const finishEntryData = () => {
    if (!finishData) return;
    const data = dataChunks ? Buffer.concat(dataChunks, dataLength) : Buffer.alloc(0);
    if (dataChunks && dataLength > MAX_METADATA_BYTES) invalid("归档元数据超出大小上限");
    finishData = false;
    dataChunks = undefined;
    dataLength = 0;
    return data;
  };

  const parseMetadata = (kind: "pax" | "longname", data: Buffer) => {
    if (data.length > MAX_METADATA_BYTES) invalid("归档元数据超出大小上限");
    if (kind === "longname") {
      const value = fieldText(data);
      nextPath = value.replace(/\n$/, "");
      return;
    }
    const values = parsePax(data);
    if (values.has("path")) nextPath = values.get("path");
  };

  for await (const chunk of source) {
    const part = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    inflatedBytes += part.length;
    if (inflatedBytes > MAX_INFLATED_BYTES) invalid("归档展开数据超过安全上限");
    if (ended) {
      if (part.some((byte) => byte !== 0)) invalid("归档结束标记后包含额外数据");
      continue;
    }
    buffer = buffer.length ? Buffer.concat([buffer, part]) : part;

    while (true) {
      if (remainingData > 0) {
        const take = Math.min(remainingData, buffer.length);
        if (dataChunks && take > 0) {
          dataChunks.push(buffer.subarray(0, take));
          dataLength += take;
        }
        buffer = buffer.subarray(take);
        remainingData -= take;
        if (remainingData > 0) break;
        finishData = true;
      }
      if (remainingPadding > 0) {
        const take = Math.min(remainingPadding, buffer.length);
        buffer = buffer.subarray(take);
        remainingPadding -= take;
        if (remainingPadding > 0) break;
      }
      if (finishData) {
        const data = finishEntryData()!;
        if (metadataKind) parseMetadata(metadataKind, data);
        metadataKind = undefined;
      }
      if (buffer.length < BLOCK_SIZE) break;

      const header = buffer.subarray(0, BLOCK_SIZE);
      buffer = buffer.subarray(BLOCK_SIZE);
      if (header.every((byte) => byte === 0)) {
        if (sawZeroBlock) {
          ended = true;
          if (buffer.some((byte) => byte !== 0)) invalid("归档结束标记后包含额外数据");
        } else {
          sawZeroBlock = true;
        }
        continue;
      }
      if (sawZeroBlock) invalid("归档包含无效的结束标记");

      entries += 1;
      if (entries > MAX_ARCHIVE_ENTRIES) invalid("归档条目数量超过安全上限");
      const expectedChecksum = octal(header.subarray(148, 156), "校验和");
      let checksum = 0;
      for (let i = 0; i < BLOCK_SIZE; i += 1) checksum += i >= 148 && i < 156 ? 0x20 : header[i];
      if (checksum !== expectedChecksum) invalid("归档头校验失败");

      const name = fieldText(header.subarray(0, 100));
      const prefix = fieldText(header.subarray(345, 500));
      const headerPath = prefix ? `${prefix}/${name}` : name;
      const type = header[156] === 0 ? "0" : String.fromCharCode(header[156]);
      const headerSize = octal(header.subarray(124, 136), "文件大小");
      const isMetadata = type === "x" || type === "L";
      if (type === "g" || type === "K") invalid("归档包含不支持的全局元数据或链接");
      if (!isMetadata && type !== "0" && type !== "5") invalid("归档包含链接或特殊文件");

      const size = headerSize;
      if (isMetadata) {
        if (headerSize > MAX_METADATA_BYTES) invalid("归档元数据超出大小上限");
        metadataKind = type === "x" ? "pax" : "longname";
        dataChunks = [];
      } else {
        const path = nextPath ?? headerPath;
        const isDirectory = type === "5";
        nextPath = undefined;
        if (size > MAX_EXTRACTED_BYTES) invalid("归档单个文件超过展开大小上限");
        const parts = validatePath(path, isDirectory);
        if (!rootPrefix) rootPrefix = parts[0];
        if (parts[0] !== rootPrefix) invalid("归档包含多个顶层目录");
        if (isDirectory && size !== 0) invalid("归档目录包含文件数据");
        if (parts.length < 2 && !isDirectory) invalid("归档文件缺少顶层目录");
        if (!isDirectory) {
          extractedBytes += size;
          if (extractedBytes > MAX_EXTRACTED_BYTES) invalid("归档展开体积超过安全上限");
        }
      }

      if (size > MAX_INFLATED_BYTES) invalid("归档条目超出安全上限");
      remainingData = size;
      remainingPadding = (BLOCK_SIZE - (size % BLOCK_SIZE)) % BLOCK_SIZE;
      finishData = size === 0;
      if (size === 0 && !dataChunks) finishData = false;
    }
  }

  if (!ended || buffer.length !== 0 || remainingData !== 0 || remainingPadding !== 0 || finishData) {
    invalid("归档不完整或缺少结束标记");
  }
}

