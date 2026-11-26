import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  db: {
    familyInvitation: { findUnique: vi.fn(), updateMany: vi.fn(), create: vi.fn() },
    familyCollaborator: { findFirst: vi.fn(), findUnique: vi.fn(), upsert: vi.fn(), update: vi.fn() },
    notification: { create: vi.fn() }, user: { findUnique: vi.fn() }, $transaction: vi.fn(),
  },
  user: vi.fn(),
}));
vi.mock("@/lib/db", () => ({ prisma: mocks.db }));
vi.mock("@/lib/auth", () => ({ requireUser: mocks.user, getCurrentUser: mocks.user }));
vi.mock("@/lib/permissions", () => ({ assertFamilyWrite: vi.fn().mockResolvedValue({ level: "OWNER" }) }));
vi.mock("@/lib/cache", () => ({ rateLimit: vi.fn().mockResolvedValue({ allowed: true }) }));
vi.mock("@/lib/audit", () => ({ audit: vi.fn() }));

import { GET as invitationPreview, POST as accept } from "@/app/api/invitations/[token]/route";
import { POST as invite } from "@/app/api/families/[id]/collaborators/route";
import { PATCH as edit, DELETE as revoke } from "@/app/api/families/[id]/collaborators/[userId]/route";

const familyId = "11111111-1111-4111-8111-111111111111";
const userId = "22222222-2222-4222-8222-222222222222";
const invitation = {
  id: "invitation", familyId, email: "invitee@example.invalid", permission: "ADMIN", invitedById: "owner",
  expiresAt: new Date(Date.now() + 86400_000), acceptedAt: null, revokedAt: null,
  family: { id: familyId, name: "family", surnameText: "陈", visibility: "PRIVATE", deletedAt: null },
};
const acceptContext = () => ({ params: Promise.resolve({ token: "test-token" }) });
const familyContext = () => ({ params: Promise.resolve({ id: familyId, userId }) });
const request = (method = "POST", body?: object) => new NextRequest("http://localhost/api/invitations/test-token", {
  method, ...(body ? { headers: { "content-type": "application/json" }, body: JSON.stringify(body) } : {}),
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.user.mockResolvedValue({ id: userId, email: invitation.email });
  mocks.db.familyInvitation.findUnique.mockResolvedValue({ ...invitation });
  mocks.db.familyInvitation.updateMany.mockResolvedValue({ count: 1 });
  mocks.db.familyCollaborator.findFirst.mockResolvedValue({ id: "collaborator", permission: "VIEWER", user: { email: invitation.email } });
  mocks.db.familyCollaborator.update.mockResolvedValue({ id: "collaborator" });
  mocks.db.$transaction.mockImplementation(async (callback: (tx: typeof mocks.db) => unknown) => callback(mocks.db));
});

describe("invitation grants and revocation", () => {
  it("a token that loses its atomic claim cannot grant collaborator permissions", async () => {
    mocks.db.familyInvitation.updateMany.mockResolvedValue({ count: 0 });
    const response = await accept(request(), acceptContext());
    expect(response.status).toBe(404);
    expect(mocks.db.familyCollaborator.upsert).not.toHaveBeenCalled();
    expect(mocks.db.notification.create).not.toHaveBeenCalled();
  });

  it("two concurrent accepts only grant once", async () => {
    let claimed = false;
    mocks.db.familyInvitation.updateMany.mockImplementation(async () => {
      if (claimed) return { count: 0 };
      claimed = true;
      return { count: 1 };
    });
    const results = await Promise.all([accept(request(), acceptContext()), accept(request(), acceptContext())]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 404]);
    expect(mocks.db.familyCollaborator.upsert).toHaveBeenCalledOnce();
    expect(mocks.db.notification.create).toHaveBeenCalledOnce();
    expect(mocks.db.familyInvitation.updateMany.mock.calls[0][0].where.family).toEqual({ deletedAt: null });
  });

  it("deleted families do not expose an invitation preview", async () => {
    mocks.db.familyInvitation.findUnique.mockResolvedValue({ ...invitation, family: { ...invitation.family, deletedAt: new Date() } });
    const response = await invitationPreview(request("GET"), acceptContext());
    expect(response.status).toBe(404);
  });

  it.each(["revoke", "permission", "status"])("%s invalidates all pending invitations for the collaborator", async (action) => {
    const response = action === "revoke"
      ? await revoke(request("DELETE"), familyContext())
      : await edit(request("PATCH", action === "permission" ? { permission: "VIEWER" } : { status: "DECLINED" }), familyContext());
    expect(response.status).toBe(200);
    expect(mocks.db.familyInvitation.updateMany).toHaveBeenCalledWith({
      where: { familyId, email: invitation.email, acceptedAt: null, revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });
  });

  it("a replacement invitation revokes older tokens before creating the new one", async () => {
    mocks.user.mockResolvedValue({ id: "owner", email: "owner@example.invalid" });
    mocks.db.user.findUnique.mockResolvedValue({ id: userId });
    mocks.db.familyCollaborator.findUnique.mockResolvedValue({ status: "REVOKED" });
    const response = await invite(request("POST", { email: invitation.email, permission: "VIEWER" }), familyContext());
    expect(response.status).toBe(201);
    expect(mocks.db.familyInvitation.updateMany).toHaveBeenCalledWith({
      where: { familyId, email: invitation.email, acceptedAt: null, revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });
    expect(mocks.db.familyInvitation.updateMany.mock.invocationCallOrder[0]).toBeLessThan(mocks.db.familyInvitation.create.mock.invocationCallOrder[0]);
  });
});
