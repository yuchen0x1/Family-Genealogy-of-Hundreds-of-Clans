import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { parseJSON } from "@/lib/genealogy-io";
const auth = vi.hoisted(() => ({ getCurrentUser: vi.fn() }));
vi.mock("@/lib/auth", () => auth);
import { POST as commit } from "@/app/api/families/[id]/import/[jobId]/commit/route";
import { GET as quality } from "@/app/api/families/[id]/quality/route";
import { GET as members } from "@/app/api/families/[id]/members/route";
import { GET as relationships } from "@/app/api/families/[id]/relationships/route";

// 只允许指定的一次性本机库；默认测试不会访问数据库。
const enabled = process.env.EVOLUTION_ISOLATED_TEST === "1" && process.env.DATABASE_URL === "postgresql://evolution@127.0.0.1:55439/evolution?schema=public";
describe.skipIf(!enabled)("独立 PostgreSQL：真实事务与权限集成（会话身份为测试注入）", () => {
  let ownerId: string, viewerId: string, familyId: string;
  beforeAll(async () => {
    const owner = await prisma.user.create({ data: { email: `evolution-owner-${Date.now()}@example.invalid`, passwordHash: "disabled-test-login" } });
    const viewer = await prisma.user.create({ data: { email: `evolution-viewer-${Date.now()}@example.invalid`, passwordHash: "disabled-test-login" } });
    ownerId = owner.id; viewerId = viewer.id;
    const family = await prisma.family.create({ data: { name: "独立数据库体检集成测试", surnameText: "陈", ownerId, visibility: "PUBLIC" } });
    familyId = family.id;
    await prisma.familyCollaborator.create({ data: { familyId, userId: viewerId, permission: "VIEWER", status: "ACTIVE" } });
    auth.getCurrentUser.mockResolvedValue({ id: ownerId });
  });
  afterAll(async () => { await prisma.$disconnect(); });
  const request = (suffix = "quality") => new NextRequest(`http://localhost/api/families/${familyId}/${suffix}`);
  const context = () => ({ params: Promise.resolve({ id: familyId }) });
  const commitJob = (jobId: string) => commit(new NextRequest(`http://localhost/api/families/${familyId}/import/${jobId}/commit`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ confirm: "IMPORT" }) }), { params: Promise.resolve({ id: familyId, jobId }) });
  it("同一任务并发提交只成功一次，真实行数不翻倍", async () => {
    const parsed = parseJSON(JSON.stringify({ members: [
      { id: "p1", surnameText: "陈", givenName: "甲", birthYear: 1980, deathYear: 1970, isLiving: true },
      { id: "p2", surnameText: "陈", givenName: "乙", birthYear: 1950, isLiving: true },
    ], relationships: [{ fromPersonId: "p1", toPersonId: "p2", type: "PARENT_CHILD", subtype: "BIOLOGICAL" }] }));
    const job = await prisma.importJob.create({ data: { familyId, userId: ownerId, format: "JSON", status: "QUEUED", payload: { persons: parsed.persons, relations: parsed.relations } } });
    const responses = await Promise.all([commitJob(job.id), commitJob(job.id)]);
    expect(responses.map((r) => r.status).sort()).toEqual([200, 409]);
    expect(await prisma.familyMember.count({ where: { familyId } })).toBe(2);
    expect(await prisma.familyRelationship.count({ where: { familyId } })).toBe(1);
    expect((await prisma.importJob.findUniqueOrThrow({ where: { id: job.id } })).status).toBe("COMPLETED");
    expect((await commitJob(job.id)).status).toBe(409);
    const report = (await (await quality(request(), context())).json()).data;
    expect(report.counts).toEqual({ ERROR: 0, WARNING: 3, INFO: 1 });
  });
  it("中途写入失败时，任务状态与已写人物一并回滚", async () => {
    const job = await prisma.importJob.create({ data: { familyId, userId: ownerId, format: "JSON", status: "QUEUED", payload: { persons: [
      { externalId: "rollback1", surnameText: "陈", givenName: "回滚甲", gender: "UNKNOWN" },
      { externalId: "rollback2", surnameText: "陈", givenName: "回滚乙", birthYear: "invalid-integer", gender: "UNKNOWN" },
    ], relations: [] } } });
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try { expect((await commitJob(job.id)).status).toBe(500); } finally { log.mockRestore(); }
    expect((await prisma.importJob.findUniqueOrThrow({ where: { id: job.id } })).status).toBe("QUEUED");
    expect(await prisma.familyMember.count({ where: { familyId } })).toBe(2);
  });
  it("VIEWER 可读体检，撤销协作后即被拒绝", async () => {
    auth.getCurrentUser.mockResolvedValue({ id: viewerId });
    expect((await quality(request(), context())).status).toBe(200);
    await prisma.familyCollaborator.updateMany({ where: { familyId, userId: viewerId }, data: { status: "REVOKED" } });
    expect((await quality(request(), context())).status).toBe(403);
    auth.getCurrentUser.mockResolvedValue(null);
    expect((await quality(request(), context())).status).toBe(403);
    auth.getCurrentUser.mockResolvedValue({ id: ownerId });
  });
  it("核对深链精确定位人物与关系，跨族谱 ID 不返回记录", async () => {
    const person = await prisma.familyMember.findFirstOrThrow({ where: { familyId } });
    const relation = await prisma.familyRelationship.findFirstOrThrow({ where: { familyId } });
    const people = (await (await members(request(`members?personId=${person.id}`), context())).json()).data;
    expect(people.total).toBe(1); expect(people.items[0].id).toBe(person.id);
    const rels = (await (await relationships(request(`relationships?relationId=${relation.id}`), context())).json()).data;
    expect(rels.total).toBe(1); expect(rels.items[0].id).toBe(relation.id);
    const other = await prisma.family.create({ data: { name: "隔离边界测试", surnameText: "陈", ownerId } });
    const result = await members(request(`members?personId=${person.id}`), { params: Promise.resolve({ id: other.id }) });
    expect((await result.json()).data.total).toBe(0);
    expect((await members(request("members?personId=invalid"), context())).status).toBe(422);
    expect((await relationships(request("relationships?relationId=invalid"), context())).status).toBe(422);
  });
});
