/**
 * 管理后台权限边界。
 *
 * - requireAdmin：账号与系统设置、审计日志、用户管理等高权限操作。
 * - requireReviewer：内容审核（史料、帖子、举报），管理员或具备 content:review 的审核人员。
 * - 任何后台接口都不得返回私有族谱的人物明细、敏感字段或档案文件内容；
 *   管理员只处理元数据、审核状态与账号状态。
 */
import { ApiError } from "@/lib/api";
import { requireUser, type AuthUser } from "@/lib/auth";

export async function requireReviewer(): Promise<AuthUser> {
  const user = await requireUser();
  if (!user.isAdmin && !user.permissions.includes("content:review")) {
    throw new ApiError(403, "需要内容审核权限", "FORBIDDEN");
  }
  return user;
}

export const ADMIN_NOTE = "后台仅处理元数据与审核状态；私有族谱的人物明细、加密敏感字段与档案正文不会在此展示。";
