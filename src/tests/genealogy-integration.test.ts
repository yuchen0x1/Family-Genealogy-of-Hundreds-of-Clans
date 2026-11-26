import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { parseJSON } from "@/lib/genealogy-io";
import { hashToken } from "@/lib/crypto";
const auth = vi.hoisted(() => ({ getCurrentUser: vi.fn() }));
vi.mock("@/lib/auth", () => ({ ...auth, requireUser: async () => auth.getCurrentUser() }));
import { POST as commit } from "@/app/api/families/[id]/import/[jobId]/commit/route";
import { GET as quality } from "@/app/api/families/[id]/quality/route";
import { GET as members } from "@/app/api/families/[id]/members/route";
import { GET as relationships } from "@/app/api/families/[id]/relationships/route";
import { POST as restoreMember } from "@/app/api/families/[id]/members/[memberId]/restore/route";
import { POST as acceptInvitation } from "@/app/api/invitations/[token]/route";
import { POST as inviteCollaborator } from "@/app/api/families/[id]/collaborators/route";
import { DELETE as revokeCollaborator } from "@/app/api/families/[id]/collaborators/[userId]/route";

// 只允许指定的一次性本机库；默认测试不会访问数据库。
const enabled = process.env.EVOLUTION_ISOLATED_TEST === "1" && process.env.DATABASE_URL === "postgresql://evolution@127.0.0.1:55439/evolution?schema=public";
describe.skipIf(!enabled)("独立 PostgreSQL：真实事务与权限集成（会话身份为测试注入）", () => {
  let ownerId: string, viewerId: string, familyId: string, ownerEmail: string, viewerEmail: string;
  beforeAll(async () => {
    const owner = await prisma.user.create({ data: { email: `evolution-owner-${Date.now()}@example.invalid`, passwordHash: "disabled-test-login" } });
    const viewer = await prisma.user.create({ data: { email: `evolution-viewer-${Date.now()}@example.invalid`, passwordHash: "disabled-test-login" } });
    ownerId = owner.id; viewerId = viewer.id;
    ownerEmail = owner.email; viewerEmail = viewer.email;
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

  it("恢复人物仅恢复同批次且两端仍在的关系，不产生指向已删除人物的悬挂关系", async () => {
    auth.getCurrentUser.mockResolvedValue({ id: ownerId });
    const family = await prisma.family.create({ data: { name: "恢复关系边界测试", surnameText: "陈", ownerId } });
    try {
      const deletedAt = new Date("2026-11-26T00:00:00Z");
      const people = await Promise.all(["甲", "乙", "丙", "丁"].map((givenName, i) => prisma.familyMember.create({
        data: {
          familyId: family.id, surnameText: "陈", givenName,
          deletedAt: i === 0 ? deletedAt : i === 2 ? new Date(deletedAt.getTime() + 1000) : null,
        },
      })));
      const relations = await Promise.all([1, 2, 3].map((i) => prisma.familyRelationship.create({
        data: {
          familyId: family.id, fromPersonId: people[0].id, toPersonId: people[i].id,
          type: "SIBLING", directional: false,
          deletedAt: i === 3 ? new Date(deletedAt.getTime() - 1000) : deletedAt,
        },
      })));
      const response = await restoreMember(new NextRequest(`http://localhost/api/families/${family.id}/members/${people[0].id}/restore`, { method: "POST" }), {
        params: Promise.resolve({ id: family.id, memberId: people[0].id }),
      });
      expect(response.status).toBe(200);
      const restored = await prisma.familyRelationship.findMany({ where: { familyId: family.id, deletedAt: null } });
      expect(restored.map((r) => r.id)).toEqual([relations[0].id]);
    } finally {
      await prisma.family.delete({ where: { id: family.id } });
    }
  });

  it("邀请并发只授予一次，撤销和降低重邀权限后旧链接均失效", async () => {
    const family = await prisma.family.create({ data: { name: "邀请授权边界测试", surnameText: "陈", ownerId } });
    const accept = (token: string) => acceptInvitation(new NextRequest(`http://localhost/api/invitations/${token}`, { method: "POST" }), {
      params: Promise.resolve({ token }),
    });
    const createInvitation = (token: string) => prisma.familyInvitation.create({
      data: {
        familyId: family.id, email: viewerEmail, tokenHash: hashToken(token), permission: "ADMIN",
        invitedById: ownerId, expiresAt: new Date(Date.now() + 60_000),
      },
    });
    try {
      const token = `concurrent-${family.id}`;
      await createInvitation(token);
      auth.getCurrentUser.mockResolvedValue({ id: viewerId, email: viewerEmail });
      const responses = await Promise.all([accept(token), accept(token)]);
      expect(responses.map((r) => r.status).sort()).toEqual([200, 404]);
      expect(await prisma.familyCollaborator.count({ where: { familyId: family.id, status: "ACTIVE" } })).toBe(1);
      expect(await prisma.notification.count({
        where: { userId: ownerId, type: "invitation_accepted", payload: { path: ["familyId"], equals: family.id } },
      })).toBe(1);

      const revokedToken = `revoked-${family.id}`;
      await createInvitation(revokedToken);
      auth.getCurrentUser.mockResolvedValue({ id: ownerId, email: ownerEmail });
      const revoked = await revokeCollaborator(new NextRequest(`http://localhost/api/families/${family.id}/collaborators/${viewerId}`, { method: "DELETE" }), {
        params: Promise.resolve({ id: family.id, userId: viewerId }),
      });
      expect(revoked.status).toBe(200);
      auth.getCurrentUser.mockResolvedValue({ id: viewerId, email: viewerEmail });
      expect((await accept(revokedToken)).status).toBe(404);
      expect((await prisma.familyCollaborator.findUniqueOrThrow({ where: { familyId_userId: { familyId: family.id, userId: viewerId } } })).status).toBe("REVOKED");

      const oldToken = `superseded-${family.id}`;
      await createInvitation(oldToken);
      auth.getCurrentUser.mockResolvedValue({ id: ownerId, email: ownerEmail });
      const replacement = await inviteCollaborator(new NextRequest(`http://localhost/api/families/${family.id}/collaborators`, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: viewerEmail, permission: "VIEWER" }),
      }), { params: Promise.resolve({ id: family.id }) });
      expect(replacement.status).toBe(201);
      const replacementToken = new URL((await replacement.json()).data.invitationUrl).pathname.split("/").at(-1)!;
      auth.getCurrentUser.mockResolvedValue({ id: viewerId, email: viewerEmail });
      expect((await accept(oldToken)).status).toBe(404);
      expect((await accept(replacementToken)).status).toBe(200);
      expect((await prisma.familyCollaborator.findUniqueOrThrow({ where: { familyId_userId: { familyId: family.id, userId: viewerId } } })).permission).toBe("VIEWER");

      const deletedToken = `deleted-${family.id}`;
      await createInvitation(deletedToken);
      await prisma.family.update({ where: { id: family.id }, data: { deletedAt: new Date() } });
      expect((await accept(deletedToken)).status).toBe(404);
    } finally {
      await prisma.notification.deleteMany({ where: { userId: ownerId, type: "invitation_accepted", payload: { path: ["familyId"], equals: family.id } } });
      await prisma.family.delete({ where: { id: family.id } });
    }
  });
});
