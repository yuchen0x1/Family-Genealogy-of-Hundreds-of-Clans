import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";
import { ApiError } from "@/lib/api";

const { updateJob, lstatMock, readFileMock } = vi.hoisted(() => ({
  updateJob: { create: vi.fn(), findMany: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
  lstatMock: vi.fn(),
  readFileMock: vi.fn(),
}));
vi.mock("@/lib/db", () => ({ prisma: { updateJob } }));
vi.mock("node:fs/promises", async (importOriginal) => ({
  ...await importOriginal<typeof import("node:fs/promises")>(),
  lstat: lstatMock,
  readFile: readFileMock,
}));

import { createJob, healStaleJobs, patchJob, readLog } from "@/lib/updater/jobs";
import { __resetLocalVersionCache } from "@/lib/updater/version";

beforeEach(() => {
  vi.clearAllMocks();
});

/** 构造 healStaleJobs 读取的 RUNNING 任务行（Prisma 行一定带 updatedAt）。 */
function runningJob(overrides: Record<string, unknown>) {
  const createdAt = new Date();
  return { stage: "INSTALL", startedAt: createdAt, updatedAt: createdAt, createdAt, ...overrides };
}

describe("更新任务生命周期", () => {
  it("拒绝相同版本更新，避免创建无意义任务", async () => {
    await expect(createJob({
      instanceId: "instance-1",
      fromVersion: "1.0.0",
      targetVersion: "1.0.0",
      driver: "SOURCE",
      requestedById: "user-1",
    })).rejects.toMatchObject({ status: 409, code: "ALREADY_UP_TO_DATE" });
    expect(updateJob.create).not.toHaveBeenCalled();
  });

  it("把并发唯一约束转换为可理解的 409 错误", async () => {
    updateJob.create.mockRejectedValueOnce(new Prisma.PrismaClientKnownRequestError("duplicate", {
      code: "P2002",
      clientVersion: "test",
    }));
    const result = createJob({
      instanceId: "instance-1",
      fromVersion: "1.0.0",
      targetVersion: "1.1.0",
      driver: "SOURCE",
      requestedById: "user-1",
    });
    await expect(result).rejects.toBeInstanceOf(ApiError);
    await expect(result).rejects.toMatchObject({ status: 409, code: "UPDATE_IN_PROGRESS" });
  });

  it("patchJob 限制进度和消息长度，并追加日志", async () => {
    updateJob.findUnique.mockResolvedValueOnce({ log: [] });
    updateJob.update.mockResolvedValueOnce({ id: "job-1" });
    await patchJob(
      "job-1",
      { progress: 150, message: "x".repeat(700), clearLock: true },
      { level: "warn", text: "仍在等待重启" },
    );
    expect(updateJob.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "job-1" },
      data: expect.objectContaining({ progress: 100, message: "x".repeat(500), activeLock: null }),
    }));
    expect(updateJob.update.mock.calls[0]?.[0].data.log).toHaveLength(1);
  });

  it("sidecar 失败状态会立即结束匹配的 Docker 更新任务", async () => {
    lstatMock.mockResolvedValueOnce({ isFile: () => true, isSymbolicLink: () => false, size: 100 });
    readFileMock.mockResolvedValueOnce(JSON.stringify({ jobId: "11111111-1111-4111-8111-111111111111", status: "FAILED", reason: "compose-build" }));
    updateJob.findMany.mockResolvedValueOnce([runningJob({
      id: "11111111-1111-4111-8111-111111111111",
      driver: "DOCKER",
      targetVersion: "9.9.9",
    })]).mockResolvedValueOnce([]);
    updateJob.findUnique.mockResolvedValueOnce({ log: [] });
    updateJob.update.mockResolvedValueOnce({ id: "job-1" });

    await expect(healStaleJobs()).resolves.toBe(1);
    expect(updateJob.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "11111111-1111-4111-8111-111111111111" },
      data: expect.objectContaining({
        status: "FAILED",
        message: "Docker 镜像更新失败",
        error: expect.stringContaining("compose-build"),
        activeLock: null,
      }),
    }));
  });

  it("sidecar 成功只进入等待状态，不提前结束 Docker 更新任务", async () => {
    lstatMock.mockResolvedValueOnce({ isFile: () => true, isSymbolicLink: () => false, size: 100 });
    readFileMock.mockResolvedValueOnce(JSON.stringify({
      jobId: "22222222-2222-4222-8222-222222222222", status: "SUCCEEDED", reason: "", at: new Date().toISOString(),
    }));
    updateJob.findMany.mockResolvedValueOnce([runningJob({
      id: "22222222-2222-4222-8222-222222222222",
      driver: "DOCKER",
      targetVersion: "9.9.9",
    })]).mockResolvedValueOnce([]);
    updateJob.findUnique.mockResolvedValueOnce({ log: [] });
    updateJob.update.mockResolvedValueOnce({ id: "job-2" });

    await expect(healStaleJobs()).resolves.toBe(0);
    expect(updateJob.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "22222222-2222-4222-8222-222222222222" },
      data: expect.objectContaining({
        stage: "RESTART",
        progress: 98,
        message: expect.stringContaining("等待新应用确认目标版本"),
      }),
    }));
    expect(updateJob.update.mock.calls[0]?.[0].data).not.toHaveProperty("status");
    expect(updateJob.update.mock.calls[0]?.[0].data).not.toHaveProperty("activeLock");
  });

  it("已在等待确认的 Docker 任务重复轮询时不重复写库与追加日志", async () => {
    lstatMock.mockResolvedValueOnce({ isFile: () => true, isSymbolicLink: () => false, size: 100 });
    readFileMock.mockResolvedValueOnce(JSON.stringify({
      jobId: "66666666-6666-4666-8666-666666666666", status: "SUCCEEDED", reason: "", at: new Date().toISOString(),
    }));
    updateJob.findMany.mockResolvedValueOnce([runningJob({
      id: "66666666-6666-4666-8666-666666666666",
      driver: "DOCKER",
      targetVersion: "9.9.9",
      stage: "RESTART",
      progress: 98,
    })]).mockResolvedValueOnce([]);

    await expect(healStaleJobs()).resolves.toBe(0);
    expect(updateJob.update).not.toHaveBeenCalled();
  });

  it("sidecar 报告成功但新容器长期不生效时判失败并释放锁", async () => {
    lstatMock.mockResolvedValueOnce({ isFile: () => true, isSymbolicLink: () => false, size: 100 });
    readFileMock.mockResolvedValueOnce(JSON.stringify({
      jobId: "77777777-7777-4777-8777-777777777777",
      status: "SUCCEEDED",
      reason: "",
      at: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
    }));
    updateJob.findMany.mockResolvedValueOnce([runningJob({
      id: "77777777-7777-4777-8777-777777777777",
      driver: "DOCKER",
      targetVersion: "9.9.9",
      stage: "RESTART",
      progress: 98,
      startedAt: new Date(Date.now() - 60 * 60 * 1000),
      updatedAt: new Date(Date.now() - 60 * 60 * 1000),
    })]).mockResolvedValueOnce([]);
    updateJob.findUnique.mockResolvedValueOnce({ log: [] });
    updateJob.update.mockResolvedValueOnce({ id: "job-7" });

    await expect(healStaleJobs()).resolves.toBe(1);
    expect(updateJob.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "77777777-7777-4777-8777-777777777777" },
      data: expect.objectContaining({
        status: "FAILED",
        message: "Docker 更新未生效",
        activeLock: null,
      }),
    }));
  });

  it("安装阶段长时间无进度不因 10 分钟静默被误判失败", async () => {
    lstatMock.mockResolvedValue(null);
    updateJob.findMany.mockResolvedValueOnce([runningJob({
      id: "88888888-8888-4888-8888-888888888888",
      driver: "SOURCE",
      targetVersion: "9.9.9",
      stage: "INSTALL",
      progress: 91,
      // 30 分钟前写过库：旧阈值（10 分钟）会误杀，新阈值（45 分钟）不应触发
      updatedAt: new Date(Date.now() - 30 * 60 * 1000),
      startedAt: new Date(Date.now() - 30 * 60 * 1000),
    })]).mockResolvedValueOnce([]);

    await expect(healStaleJobs()).resolves.toBe(0);
    expect(updateJob.update).not.toHaveBeenCalled();
  });

  it("sidecar 成功后仅在当前应用版本匹配时完成 Docker 更新", async () => {
    lstatMock.mockResolvedValueOnce({ isFile: () => true, isSymbolicLink: () => false, size: 100 });
    readFileMock.mockResolvedValueOnce(JSON.stringify({
      jobId: "33333333-3333-4333-8333-333333333333", status: "SUCCEEDED", reason: "", at: new Date().toISOString(),
    }));
    updateJob.findMany.mockResolvedValueOnce([runningJob({
      id: "33333333-3333-4333-8333-333333333333",
      driver: "DOCKER",
      // 与 readLocalVersion() 读到的 package.json 版本一致，即「目标版本已生效」
      targetVersion: "0.1.0",
      stage: "RESTART",
      progress: 98,
    })]).mockResolvedValueOnce([]);
    updateJob.findUnique.mockResolvedValueOnce({ log: [] });
    updateJob.update.mockResolvedValueOnce({ id: "job-3" });

    await expect(healStaleJobs()).resolves.toBe(1);
    expect(updateJob.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "33333333-3333-4333-8333-333333333333" },
      data: expect.objectContaining({
        status: "SUCCEEDED",
        stage: "DONE",
        progress: 100,
        activeLock: null,
      }),
    }));
  });

  it("sidecar 仍在 processing 时不因构建耗时触发 stale 失败", async () => {
    lstatMock
      .mockResolvedValueOnce({ isFile: () => true, isSymbolicLink: () => false, size: 100 })
      .mockResolvedValueOnce({ isFile: () => true, isSymbolicLink: () => false, size: 100 });
    readFileMock
      .mockResolvedValueOnce(JSON.stringify({
        jobId: "55555555-5555-4555-8555-555555555555", status: "SUCCEEDED", reason: "", at: new Date().toISOString(),
      }))
      .mockResolvedValueOnce(JSON.stringify({ jobId: "44444444-4444-4444-8444-444444444444" }));
    updateJob.findMany.mockResolvedValueOnce([runningJob({
      id: "44444444-4444-4444-8444-444444444444",
      driver: "DOCKER",
      targetVersion: "9.9.9",
      stage: "INSTALL",
      startedAt: new Date(Date.now() - 60 * 60 * 1000),
      updatedAt: new Date(Date.now() - 60 * 60 * 1000),
    })]).mockResolvedValueOnce([]);

    await expect(healStaleJobs()).resolves.toBe(0);
    expect(updateJob.update).not.toHaveBeenCalled();
  });

  it("branch 通道的 12 位 SHA 前缀在重启后被识别为版本已生效", async () => {
    lstatMock.mockResolvedValue(null);
    const sha = "abcdef1234567890abcdef1234567890abcdef12";
    const previous = process.env.APP_BUILD_SHA;
    process.env.APP_BUILD_SHA = sha;
    // readLocalVersion 有进程内缓存，改 env 后必须重置才能读到新 commit
    __resetLocalVersionCache();
    try {
      updateJob.findMany.mockResolvedValueOnce([runningJob({
        id: "99999999-9999-4999-8999-999999999999",
        driver: "SOURCE",
        targetVersion: sha.slice(0, 12),
        stage: "RESTART",
        progress: 99,
      })]).mockResolvedValueOnce([]);
      updateJob.findUnique.mockResolvedValueOnce({ log: [] });
      updateJob.update.mockResolvedValueOnce({ id: "job-9" });

      await expect(healStaleJobs()).resolves.toBe(1);
      expect(updateJob.update).toHaveBeenCalledWith(expect.objectContaining({
        where: { id: "99999999-9999-4999-8999-999999999999" },
        data: expect.objectContaining({ status: "SUCCEEDED", stage: "DONE", activeLock: null }),
      }));
    } finally {
      if (previous === undefined) delete process.env.APP_BUILD_SHA;
      else process.env.APP_BUILD_SHA = previous;
    }
  });

  it("readLog 丢弃非法条目并为缺少 level/时间提供安全默认值", () => {
    expect(readLog({ log: [
      null,
      { text: "ok", level: "wat", at: 123 },
      { text: "" },
      { text: "error", level: "error", at: "2026-01-01T00:00:00Z" },
    ] } as never)).toEqual([
      { text: "ok", level: "info", at: "1970-01-01T00:00:00.000Z" },
      { text: "error", level: "error", at: "2026-01-01T00:00:00Z" },
    ]);
  });
});
