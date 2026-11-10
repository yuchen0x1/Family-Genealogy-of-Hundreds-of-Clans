/**
 * 宗亲社区服务层。
 *
 * 隐私原则：
 * - 帖子按 visibility 分级：PUBLIC 所有人可读，FAMILY 仅所属家族协作者可读，PRIVATE 仅作者可读。
 * - 管理员也不通过此过滤器绕过家族隐私；内容审核走独立的管理后台接口并留审计。
 * - 对外一律不返回作者邮箱、真实姓名等；用户可通过隐私设置自行决定是否展示姓氏/地区。
 * - 同姓宗亲搜索只允许检索主动开启 allowClanSearch 的用户，且只返回公开字段。
 */
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { visibleFamilyIds } from "@/lib/permissions";
import type { AuthUser } from "@/lib/auth";

export const POST_TYPE_LABELS: Record<string, string> = {
  SEEK_RELATIVE: "寻亲", DISCUSSION: "讨论", ANNOUNCEMENT: "公告",
  EVENT: "活动", FAMILY_NEWS: "家族动态", CORRECTION: "资料纠错",
};

export const REPORT_REASONS = ["内容不实", "侵犯隐私", "骚扰或辱骂", "广告或垃圾信息", "史料来源存疑", "其他"] as const;

/** 当前用户可读帖子的 where 条件。匿名访客仅能读取已发布的公开帖。 */
export async function postReadWhere(user: AuthUser | null) {
  const familyIds = user ? await visibleFamilyIds(user.id) : [];
  const or: Record<string, unknown>[] = [{ visibility: "PUBLIC", status: "PUBLISHED" }];
  if (user) {
    or.push({ authorId: user.id });
    if (familyIds.length) or.push({ visibility: "FAMILY", status: "PUBLISHED", familyId: { in: familyIds } });
  }
  return { deletedAt: null, OR: or };
}

export type PostRow = {
  id: string; authorId: string; familyId: string | null; surnameId: string | null;
  type: string; title: string; content: string; tags: string[]; clues: unknown;
  visibility: string; status: string; viewCount: number;
  createdAt: Date; updatedAt: Date;
  author?: {
    id: string;
    profile: { displayName: string; surname: string | null; location: string | null; privacySettings: unknown } | null;
  } | null;
  surname?: { id: string; name: string } | null;
  family?: { id: string; name: string; visibility: string } | null;
  _count?: { comments: number };
};

function privacy(p: PostRow["author"]): Record<string, unknown> {
  const raw = p?.profile?.privacySettings;
  return raw && typeof raw === "object" && !Array.isArray(raw) ? raw as Record<string, unknown> : {};
}

/** 作者视图：默认只给昵称；姓氏与地区需用户主动授权展示。 */
export function authorView(author: PostRow["author"]) {
  const p = privacy(author);
  return {
    id: author?.id ?? null,
    displayName: author?.profile?.displayName ?? "已注销用户",
    surname: p.showSurname === true ? author?.profile?.surname ?? null : null,
    location: p.showLocation === true ? author?.profile?.location ?? null : null,
  };
}

export function postView(p: PostRow, viewerId?: string) {
  return {
    id: p.id,
    title: p.title,
    content: p.content,
    type: p.type,
    typeLabel: POST_TYPE_LABELS[p.type] ?? p.type,
    tags: p.tags ?? [],
    clues: p.clues ?? {},
    visibility: p.visibility,
    status: p.status,
    viewCount: p.viewCount,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
    familyId: p.familyId,
    familyName: p.family?.visibility === "PUBLIC" ? p.family.name : null,
    surnameId: p.surnameId,
    surnameName: p.surname?.name ?? null,
    author: authorView(p.author),
    commentCount: p._count?.comments ?? 0,
    canEdit: Boolean(viewerId && viewerId === p.authorId),
  };
}

export type CommentRow = {
  id: string; postId: string; authorId: string; parentId: string | null;
  content: string; status: string; createdAt: Date; updatedAt: Date;
  author?: PostRow["author"];
};

export function commentView(c: CommentRow, viewerId?: string, isModerator = false) {
  return {
    id: c.id, postId: c.postId, parentId: c.parentId,
    content: c.status === "REMOVED" ? "[该评论已被移除]" : c.content,
    status: c.status, createdAt: c.createdAt,
    author: authorView(c.author),
    canDelete: Boolean(viewerId && (viewerId === c.authorId || isModerator)),
  };
}

/** 创建站内通知。失败不阻断主业务。 */
export async function notify(userId: string, type: string, payload: Record<string, unknown>) {
  if (!userId) return;
  try {
    await prisma.notification.create({ data: { userId, type, payload: payload as Prisma.InputJsonValue } });
  } catch (e) {
    console.error("[notify] 写入失败:", e);
  }
}

/** 把评论平铺列表组装为两级树（回复只挂在根评论下，避免深层递归）。 */
export function buildCommentTree(rows: CommentRow[], viewerId?: string, isModerator = false) {
  const mapped = rows.map((r) => ({ ...commentView(r, viewerId, isModerator), children: [] as ReturnType<typeof commentView>[] }));
  const byId = new Map(mapped.map((m) => [m.id, m]));
  const roots: typeof mapped = [];
  for (const m of mapped) {
    const parent = m.parentId ? byId.get(m.parentId) : null;
    if (parent && parent !== m) parent.children.push(m);
    else roots.push(m);
  }
  return roots;
}

/** 同姓宗亲搜索：只返回主动开启 allowClanSearch 且账号正常的用户，绝不返回邮箱。 */
export async function searchClanMembers(surname: string, excludeUserId?: string, take = 24) {
  const profiles = await prisma.userProfile.findMany({
    where: {
      // 中文姓氏不涉及大小写，直接精确匹配即可（避免依赖 QueryMode 枚举）
      surname: { equals: surname },
      ...(excludeUserId ? { userId: { not: excludeUserId } } : {}),
      user: { status: "ACTIVE", deletedAt: null },
    },
    select: {
      userId: true, displayName: true, surname: true, location: true, bio: true, privacySettings: true,
    },
    take: Math.min(take * 3, 200),
  });
  return profiles
    .filter((p) => {
      const settings = p.privacySettings;
      const s = settings && typeof settings === "object" && !Array.isArray(settings) ? settings as Record<string, unknown> : {};
      return s.allowClanSearch === true;
    })
    .slice(0, take)
    .map((p) => ({
      id: p.userId,
      displayName: p.displayName,
      surname: p.surname,
      location: (p.privacySettings as Record<string, unknown> | null)?.showLocation === true ? p.location : null,
      bio: p.bio,
      notice: "同姓不代表同宗，平台不据此认定任何血缘关系；建立关联需双方确认与证据核验。",
    }));
}
