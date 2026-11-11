import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { ApiError } from "@/lib/api";

const { requireAdmin, applyUpdate, audit, assertRateLimit, assertSameOrigin } = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  applyUpdate: vi.fn(),
  audit: vi.fn(),
  assertRateLimit: vi.fn(),
  assertSameOrigin: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ requireAdmin }));
vi.mock("@/lib/updater", () => ({ applyUpdate, getUpdateState: vi.fn() }));
vi.mock("@/lib/audit", () => ({ audit }));
vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return { ...actual, assertRateLimit, assertSameOrigin };
});

import { GET, POST } from "@/app/api/admin/system/update/route";

const admin = { id: "admin-1", isAdmin: true };
const routeContext = { params: Promise.resolve({}) };
const job = {
  id: "job-1",
  fromVersion: "1.0.0",
  targetVersion: "1.1.0",
  driver: "SOURCE",
};

function request(method: "GET" | "POST", body?: unknown): NextRequest {
  return new NextRequest("http://localhost/api/admin/system/update", {
    method,
    headers: { origin: "http://localhost:3000", "content-type": "application/json" },
    body: method === "POST" ? JSON.stringify(body) : undefined,
  });
}

afterEach(() => {
  vi.clearAllMocks();
  requireAdmin.mockResolvedValue(admin);
  assertRateLimit.mockResolvedValue(undefined);
  assertSameOrigin.mockReturnValue(undefined);
});

describe("管理员系统更新 API", () => {
  it("GET 需要管理员权限，未授权时返回 403", async () => {
    requireAdmin.mockRejectedValueOnce(new ApiError(403, "需要管理员权限", "FORBIDDEN"));
    const response = await GET(request("GET"), routeContext);
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ ok: false, error: { code: "FORBIDDEN" } });
  });

  it("POST 拒绝缺少或错误的 UPDATE 确认字面量", async () => {
    requireAdmin.mockResolvedValue(admin);
    const response = await POST(request("POST", { confirm: "update" }), routeContext);
    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({ ok: false, error: { code: "VALIDATION_ERROR" } });
    expect(applyUpdate).not.toHaveBeenCalled();
  });

  it("POST 先执行同源、管理员、独立限流与确认校验，再创建更新任务", async () => {
    applyUpdate.mockResolvedValueOnce(job);
    const response = await POST(request("POST", { confirm: "UPDATE" }), routeContext);
    expect(response.status).toBe(202);
    expect(await response.json()).toMatchObject({ ok: true, data: { id: "job-1" } });
    expect(assertSameOrigin).toHaveBeenCalledOnce();
    expect(requireAdmin).toHaveBeenCalledOnce();
    expect(assertRateLimit).toHaveBeenCalledWith(expect.stringContaining("update:apply:admin-1:"), 5, 600);
    expect(applyUpdate).toHaveBeenCalledWith("admin-1");
    expect(audit).toHaveBeenCalledWith(
      expect.anything(),
      "admin-1",
      "admin.system.update.apply",
      "update_job",
      "job-1",
      expect.objectContaining({ after: expect.objectContaining({ targetVersion: "1.1.0" }) }),
    );
  });

  it("POST 将 CSRF 失败或限流失败转换为结构化错误，不创建任务", async () => {
    assertSameOrigin.mockImplementationOnce(() => {
      throw new ApiError(403, "跨站请求被拒绝", "CSRF_REJECTED");
    });
    const csrf = await POST(request("POST", { confirm: "UPDATE" }), routeContext);
    expect(csrf.status).toBe(403);
    expect(applyUpdate).not.toHaveBeenCalled();

    assertSameOrigin.mockReturnValue(undefined);
    assertRateLimit.mockRejectedValueOnce(new ApiError(429, "操作过于频繁，请稍后再试", "RATE_LIMITED"));
    const limited = await POST(request("POST", { confirm: "UPDATE" }), routeContext);
    expect(limited.status).toBe(429);
    expect(await limited.json()).toMatchObject({ ok: false, error: { code: "RATE_LIMITED" } });
    expect(applyUpdate).not.toHaveBeenCalled();
  });
});
