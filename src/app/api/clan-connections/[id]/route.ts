import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { ok, route, parseBody, assertSameOrigin, ApiError } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { notify } from "@/lib/community";
import { audit } from "@/lib/audit";

type Ctx = { id: string };

const schema = z.object({
  action: z.enum(["ACCEPT", "REJECT", "REVOKE"]),
  note: z.string().trim().max(1000).optional(),
});

/**
 * 双确认：发起方在申请时确认，收件方在此确认；两个时间戳都存在才转为 ACCEPTED。
 * 绝不因为同姓或关联成立而创建/推断任何 FamilyRelationship。
 */
export const PATCH = route<Ctx>(async (req: NextRequest, ctx) => {
  assertSameOrigin(req);
  const { id } = await ctx.params;
  const user = await requireUser();
  const data = await parseBody(schema, req);
  const conn = await prisma.clanConnection.findUnique({ where: { id } });
  if (!conn) throw new ApiError(404, "关联申请不存在", "NOT_FOUND");
  if (conn.requesterId !== user.id && conn.addresseeId !== user.id) {
    throw new ApiError(403, "无权处理该关联申请", "FORBIDDEN");
  }
  if (conn.status !== "PENDING") throw new ApiError(409, "该申请已处理，不能重复操作", "ALREADY_HANDLED");
  if ((data.action === "ACCEPT" || data.action === "REJECT") && conn.addresseeId !== user.id) {
    throw new ApiError(403, "只有被申请人可以接受或拒绝", "FORBIDDEN");
  }
  if (data.action === "REVOKE" && conn.requesterId !== user.id) {
    throw new ApiError(403, "只有申请人可以撤回", "FORBIDDEN");
  }
  if (data.action === "ACCEPT" && !conn.requesterConfirmedAt) {
    throw new ApiError(409, "发起方确认信息缺失，无法完成双确认", "CONFIRMATION_MISSING");
  }

  const now = new Date();
  const status = { ACCEPT: "ACCEPTED", REJECT: "REJECTED", REVOKE: "REVOKED" }[data.action];
  const updated = await prisma.clanConnection.update({
    where: { id },
    data: {
      status: status as never,
      ...(data.action === "ACCEPT" ? { addresseeConfirmedAt: now, reviewedById: user.id } : {}),
    },
  });
  const otherId = user.id === conn.requesterId ? conn.addresseeId : conn.requesterId;
  await notify(otherId, `clan.connection.${data.action.toLowerCase()}`, {
    connectionId: id, by: user.displayName, note: data.note ?? null,
  });
  await audit(req, user.id, `clan.connection.${data.action.toLowerCase()}`, "clan_connection", id, {
    before: { status: conn.status },
    after: { status: updated.status, bothConfirmed: Boolean(updated.requesterConfirmedAt && updated.addresseeConfirmedAt) },
  });
  return ok({
    id, status: updated.status,
    requesterConfirmedAt: updated.requesterConfirmedAt,
    addresseeConfirmedAt: updated.addresseeConfirmedAt,
    notice: status === "ACCEPTED"
      ? "双方已确认关联。此确认仅表示双方同意共同考证，平台不据此认定血缘关系，也不会自动创建任何亲属关系；如需记录谱系，请在族谱中人工录入并核实。"
      : "关联申请已结束，未产生任何亲属关系。",
  });
});
