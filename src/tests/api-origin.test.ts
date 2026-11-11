import { describe, expect, it, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { ApiError, assertSameOrigin } from "@/lib/api";

const originalSiteUrl = process.env.NEXT_PUBLIC_SITE_URL;

afterEach(() => {
  if (originalSiteUrl === undefined) delete process.env.NEXT_PUBLIC_SITE_URL;
  else process.env.NEXT_PUBLIC_SITE_URL = originalSiteUrl;
});

function request(origin: string) {
  return new NextRequest("https://genealogy.example/families", {
    method: "POST",
    headers: { origin, host: "genealogy.example" },
  });
}

describe("assertSameOrigin", () => {
  it("允许配置的完整 origin", () => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://genealogy.example";
    expect(() => assertSameOrigin(request("https://genealogy.example"))).not.toThrow();
  });

  it("拒绝同主机但不同协议或端口的 origin", () => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://genealogy.example";
    expect(() => assertSameOrigin(request("http://genealogy.example"))).toThrow(ApiError);
    expect(() => assertSameOrigin(request("https://genealogy.example:8443"))).toThrow(ApiError);
  });

  it("拒绝 malformed 或跨站 origin", () => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://genealogy.example";
    expect(() => assertSameOrigin(request("null"))).toThrow(ApiError);
    expect(() => assertSameOrigin(request("https://attacker.example"))).toThrow(ApiError);
  });
});
