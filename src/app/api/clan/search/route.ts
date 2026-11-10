import { NextRequest } from "next/server";
import { ok, route, ApiError } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { searchClanMembers } from "@/lib/community";

/**
 * 同姓宗亲检索：需登录；只返回主动开启 allowClanSearch 的用户；不返回邮箱、真实姓名与私有族谱。
 * 结果仅用于联系与考证，绝不作为血缘或同宗判断依据。
 */
export const GET = route(async (req: NextRequest) => {
  const user = await requireUser();
  const surname = (req.nextUrl.searchParams.get("surname") || "").trim().slice(0, 20);
  if (!surname) throw new ApiError(400, "请填写要检索的姓氏", "SURNAME_REQUIRED");
  if (!/^[\u4e00-\u9fa5]{1,10}$/.test(surname)) {
    throw new ApiError(400, "请输入 1–10 个汉字的中文姓氏", "INVALID_SURNAME");
  }
  const items = await searchClanMembers(surname, user.id);
  return ok({
    items,
    total: items.length,
    notice: "同姓不等于同宗。仅展示主动允许被检索的宗亲；发起关联申请需双方确认与证据核验。",
    privacyNote: "可在「个人中心 → 隐私设置」随时开启或关闭被检索权限，关闭后立即生效。",
  });
});
