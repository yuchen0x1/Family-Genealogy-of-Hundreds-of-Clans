import { describe, expect, it } from "vitest";
import { validateUpload } from "@/lib/upload";

function uploadFile(content: string, name: string, type: string) {
  return new File([content], name, { type });
}

describe("上传文件校验", () => {
  it("浏览器声明 text/markdown 的 .md 文件可以上传", async () => {
    const result = await validateUpload(uploadFile("# 家族笔记\n正文", "notes.md", "text/markdown"));
    expect(result.ext).toBe(".md");
    expect(result.mimeType).toBe("text/markdown");
  });

  it("伪装成 PNG 的文本仍按 magic bytes 拒绝", async () => {
    await expect(validateUpload(uploadFile("not an image", "fake.png", "image/png"))).rejects.toThrow();
  });
});
