import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gzipSync } from "node:zlib";
import { afterEach, describe, expect, it } from "vitest";
import { inspectTarGz } from "@/lib/updater/archive";

let tempDir = "";

afterEach(async () => {
  if (tempDir) await rm(tempDir, { recursive: true, force: true });
  tempDir = "";
});

function tarHeader(name: string, type: string, size = 0, linkName = ""): Buffer {
  const block = Buffer.alloc(512);
  block.write(name, 0, 100, "utf8");
  block.write("0000644\0", 100, 8, "ascii");
  block.write("0000000\0", 108, 8, "ascii");
  block.write("0000000\0", 116, 8, "ascii");
  block.write(size.toString(8).padStart(11, "0") + "\0", 124, 12, "ascii");
  block.write("00000000000\0", 136, 12, "ascii");
  block.fill(0x20, 148, 156);
  block[156] = type.charCodeAt(0);
  block.write(linkName, 157, 100, "utf8");
  block.write("ustar\0", 257, 6, "ascii");
  block.write("00", 263, 2, "ascii");
  let checksum = 0;
  for (const byte of block) checksum += byte;
  block.write(checksum.toString(8).padStart(6, "0") + "\0 ", 148, 8, "ascii");
  return block;
}

function archiveFile(entries: Buffer[]): Buffer {
  return gzipSync(Buffer.concat([...entries, Buffer.alloc(1024)]));
}

function paxRecord(key: string, value: string): Buffer {
  const body = `${key}=${value}\n`;
  let length = Buffer.byteLength(body) + 2;
  while (true) {
    const record = `${length} ${body}`;
    const actualLength = Buffer.byteLength(record);
    if (actualLength === length) return Buffer.from(record);
    length = actualLength;
  }
}

function padded(data: Buffer): Buffer {
  return Buffer.concat([data, Buffer.alloc((512 - (data.length % 512)) % 512)]);
}

async function inspect(tarball: Buffer): Promise<void> {
  tempDir = await mkdtemp(join(tmpdir(), "updater-archive-"));
  const archive = join(tempDir, "source.tar.gz");
  await writeFile(archive, tarball);
  await inspectTarGz(archive);
}

describe("更新归档安全检查", () => {
  it("接受包含单一顶层目录的普通归档", async () => {
    await inspect(archiveFile([tarHeader("release/", "5"), tarHeader("release/package.json", "0", 2), Buffer.from("{}"), Buffer.alloc(510)]));
  });

  it.each(["../outside", "/etc/passwd", "C:/outside", "release/../outside"]) ("拒绝不安全路径 %s", async (name) => {
    await expect(inspect(archiveFile([tarHeader(name, "0")]))).rejects.toThrow();
  });

  it.each(["1", "2", "3", "4", "6", "7", "S"]) ("拒绝链接或特殊文件类型 %s", async (type) => {
    await expect(inspect(archiveFile([tarHeader("release/item", type, 0, "release/target")]))).rejects.toThrow();
  });

  it("拒绝 PAX 路径覆盖造成的路径穿越", async () => {
    const metadata = paxRecord("path", "../outside");
    const entry = [tarHeader("PaxHeader", "x", metadata.length), padded(metadata), tarHeader("release/safe", "0")];
    await expect(inspect(archiveFile(entry))).rejects.toThrow("路径穿越");
  });

  it("拒绝超过展开体积上限的条目", async () => {
    const size = 512 * 1024 * 1024 + 1;
    await expect(inspect(archiveFile([tarHeader("release/large.bin", "0", size)]))).rejects.toThrow("展开大小上限");
  });
});
