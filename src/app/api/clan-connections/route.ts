import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { ok, route, parseBody, assertSameOrigin, ApiError, assertRateLimit } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { visibleFamilyIds } from "@/lib/permissions";
import { notify } from "@/lib/community";
import { audit } from "@/lib/audit";

const schema = z.object({
  addresseeId: z.string().uuid(),
  familyAId: z.string().uuid().optional().nullable(),
  familyBId: z.string().uuid().optional().nullable(),
  evidenceDocumentId: z.string().uuid().optional().nullable(),
  evidenceNote: z.string().trim().max(2000).optional().nullable(),
});

const PARTNER = {
  select: { id: true, profile: { select: { displayName: true, surname: true } } },
} as const;

function view(c: {
  id: string; requesterId: string; addresseeId: string;
  familyAId: string | null; familyBId: string | null;
  status: string; evidenceNote: string | null;
  requesterConfirmedAt: Date | null; addresseeConfirmedAt: Date | null;
  createdAt: Date; updatedAt: Date;
  requester?: { profile: { displayName: string } | null } | null;
  addressee?: { profile: { displayName: string } | null } | null;
  familyA?: { name: string } | null; familyB?: { name: string } | null;
}, viewerId: string) {
  return {
    id: c.id,
    requesterId: c.requesterId,
    addresseeId: c.addresseeId,
    requesterName: c.requester?.profile?.displayName ?? "用户",
    addresseeName: c.addressee?.profile?.displayName ?? "用户",
    familyAId: c.familyAId, familyBId: c.familyBId,
    familyAName: c.familyA?.name ?? null, familyBName: c.familyB?.name ?? null,
    status: c.status,
    evidenceNote: c.evidenceNote,
    requesterConfirmedAt: c.requesterConfirmedAt,
    addresseeConfirmedAt: c.addresseeConfirmedAt,
    createdAt: c.createdAt,
    direction: c.requesterId === viewerId ? "OUTGOING" : "INCOMING",
    canRespond: c.addresseeId === viewerId && c.status === "PENDING",
    canRevoke: c.requesterId === viewerId && c.status === "PENDING",
    notice: "同姓不代表同宗。关联申请必须由双方确认并附证据说明，确认后也不会自动创建或推断任何亲属关系。",
  };
}

/** 我发起的 + 我收到的关联申请。 */
export const GET = route(async () => {
  const user = await requireUser();
  const rows = await prisma.clanConnection.findMany({
    where: { OR: [{ requesterId: user.id }, { addresseeId: user.id }] },
    orderBy: { createdAt: "desc" }, take: 100,
    include: {
      requester: PARTNER, addressee: PARTNER,
      familyA: { select: { name: true } }, familyB: { select: { name: true } },
    },
  });
  return ok(rows.map((r) => view(r, user.id)));
});

/** 发起申请：发起即视为发起方确认；对方确认前状态始终 PENDING。 */
export const POST = route(async (req: NextRequest) => {
  assertSameOrigin(req);
  const user = await requireUser();
  await assertRateLimit(`clan.connection:${user.id}`, 10, 3600);
  const data = await parseBody(schema, req);
  if (data.addresseeId === user.id) throw new ApiError(400, "不能向自己发起关联申请", "SELF_CONNECTION");
  const target = await prisma.user.findFirst({
    where: { id: data.addresseeId, status: "ACTIVE", deletedAt: null }, select: { id: true },
  });
  if (!target) throw new ApiError(404, "对方账号不存在或不可用", "ADDRESSEE_NOT_FOUND");

  const familyIds = await visibleFamilyIds(user.id);
  for (const fid of [data.familyAId, data.familyBId]) {
    if (fid && !familyIds.includes(fid)) throw new ApiError(403, "只能关联自己参与的家族", "FORBIDDEN");
  }
  if (!data.familyAId && !data.evidenceNote?.trim()) {
    throw new ApiError(400, "请填写关联依据说明（家族谱系、字辈、祖籍或文献线索）", "EVIDENCE_REQUIRED");
  }
  if (data.evidenceDocumentId) {
    const docs = await prisma.familyDocument.findMany({
      where: { familyId: { in: familyIds }, deletedAt: null }, select: { id: true },
    });
    if (!docs.some((d) => d.id === data.evidenceDocumentId)) {
      throw new ApiError(400, "证据档案不存在或无权引用", "INVALID_EVIDENCE");
    }
  }

  const exists = await prisma.clanConnection.findFirst({
    where: {
      OR: [
        { requesterId: user.id, addresseeId: data.addresseeId },
        { requesterId: data.addresseeId, addresseeId: user.id },
      ],
      status: { in: ["PENDING", "ACCEPTED"] },
    },
    select: { id: true },
  });
  if (exists) throw new ApiError(409, "双方已存在待处理或已确认的关联申请", "ALREADY_EXISTS");

  const now = new Date();
  const conn = await prisma.clanConnection.create({
    data: {
      requesterId: user.id,
      addresseeId: data.addresseeId,
      familyAId: data.familyAId ?? null,
      familyBId: data.familyBId ?? null,
      evidenceDocumentId: data.evidenceDocumentId ?? null,
      evidenceNote: data.evidenceNote ?? null,
      requesterConfirmedAt: now,
      status: "PENDING",
    },
    include: {
      requester: PARTNER, addressee: PARTNER,
      familyA: { select: { name: true } }, familyB: { select: { name: true } },
    },
  });
  await notify(data.addresseeId, "clan.connection.request", {
    connectionId: conn.id, from: user.displayName,
    notice: "请核对证据后再确认；同姓不代表同宗。",
  });
  await audit(req, user.id, "clan.connection.create", "clan_connection", conn.id, {
    after: { addresseeId: data.addresseeId, familyAId: data.familyAId, familyBId: data.familyBId },
  });
  return ok(view(conn, user.id), 201);
});
