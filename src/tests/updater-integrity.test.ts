import { generateKeyPairSync, sign } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  assertTrustedGitHubAssetUrl,
  normalizeSha256,
  parseSha256Manifest,
  sha256File,
  verifyDetachedSignature,
} from "@/lib/updater/integrity";

const tempDirs: string[] = [];
afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("更新资产完整性校验", () => {
  it("解析 GitHub digest 与 sha256sum 清单", () => {
    expect(normalizeSha256("sha256:" + "A".repeat(64))).toBe("a".repeat(64));
    expect(parseSha256Manifest(`${"b".repeat(64)}  xungen-1.2.3.tar.gz`, "xungen-1.2.3.tar.gz")).toBe("b".repeat(64));
    expect(parseSha256Manifest(`${"c".repeat(64)}  one.tar.gz\n${"d".repeat(64)}  two.tar.gz`)).toBeNull();
  });

  it("指定资产时不借用其他资产的唯一摘要，并拒绝畸形 digest", () => {
    expect(parseSha256Manifest(`${"a".repeat(64)}  other.tar.gz`, "xungen-1.2.3.tar.gz")).toBeNull();
    expect(parseSha256Manifest("a".repeat(64), "xungen-1.2.3.tar.gz")).toBe("a".repeat(64));
    expect(parseSha256Manifest(`${"a".repeat(64)}  `, "xungen-1.2.3.tar.gz")).toBe("a".repeat(64));
    expect(normalizeSha256("a".repeat(65))).toBeNull();
    expect(normalizeSha256(`invalid:${"a".repeat(64)}`)).toBeNull();
  });

  it("只允许 HTTPS GitHub 仓库资产地址", () => {
    expect(assertTrustedGitHubAssetUrl("https://api.github.com/repos/o/r/releases/assets/1", "o/r").hostname).toBe("api.github.com");
    expect(() => assertTrustedGitHubAssetUrl("http://api.github.com/repos/o/r/releases/assets/1", "o/r")).toThrow();
    expect(() => assertTrustedGitHubAssetUrl("https://evil.example/a", "o/r")).toThrow();
  });

  it("计算 SHA-256 并验证 detached signature", async () => {
    const dir = await mkdtemp(join(tmpdir(), "xungen-integrity-"));
    tempDirs.push(dir);
    const file = join(dir, "asset.tar.gz");
    const data = Buffer.from("trusted release asset\n", "utf8");
    await writeFile(file, data);
    expect(await sha256File(file)).toBe("39ca2345c200a3fbedac9afbfd55077ff4316e453cef2514d179f8e23ca6d18d");

    const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
    const signature = sign("sha256", data, privateKey).toString("base64");
    expect(await verifyDetachedSignature(file, signature, publicKey.export({ type: "spki", format: "pem" }).toString())).toBe(true);
    expect(await verifyDetachedSignature(file, Buffer.from("bad").toString("base64"), publicKey.export({ type: "spki", format: "pem" }).toString())).toBe(false);
  });
});
