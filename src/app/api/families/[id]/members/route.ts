import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { ok, route, parseBody, getQuery, paginate, assertSameOrigin, ApiError } from "@/lib/api";
import { memberCreateSchema } from "@/lib/validation";
import { getCurrentUser } from "@/lib/auth";
import { assertFamilyRead, assertFamilyWrite } from "@/lib/permissions";
import { encryptSensitive } from "@/lib/crypto";
import { publicPersonView, createVersionSnapshot } from "@/lib/genealogy";
import { audit } from "@/lib/audit";

type Ctx = { id: string };

export const GET = route<Ctx>(async (req: NextRequest, ctx) => {
  const { id } = await ctx.params;
  const user = await getCurrentUser();
  const access = await assertFamilyRead(user, id);
  const { page, pageSize, params } = getQuery(req);
  const keyword = (params.get("keyword") || "").trim();
  const personId = params.get("personId") ? z.string().uuid().parse(params.get("personId")) : null;
  /**
   * 关键词同时匹配姓、名、字号与别名。
   *
   * 旧实现只查 `givenName`，导致「按姓氏搜」（如输入「陈」）和「按字号搜」
   * 都搜不到人——而这些正是族谱检索最常见的入口。这里用 OR 组合四个字段，
   * 并统一 `mode: "insensitive"`，让拼音/拉丁字母的大小写不敏感。
   *
   * 性能：`given_name` 有 pg_trgm GIN 索引；新增迁移为 `surname_text`
   * 也建同样的索引，避免按姓氏搜索退化为全表扫描。
   */
  const where = {
    familyId: id,
    deletedAt: null,
    ...(personId ? { id: personId } : {}),
    ...(keyword
      ? {
          OR: [
            { givenName: { contains: keyword, mode: "insensitive" as const } },
            { surnameText: { contains: keyword, mode: "insensitive" as const } },
            { courtesyName: { contains: keyword, mode: "insensitive" as const } },
            { alias: { contains: keyword, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };
  const [rows, total] = await Promise.all([
    prisma.familyMember.findMany({
      where,
      orderBy: [{ generationNumber: "asc" }, { birthYear: "asc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.familyMember.count({ where }),
  ]);
  return ok(paginate(rows.map((r) => publicPersonView(r, access)), total, page, pageSize));
});

export const POST = route<Ctx>(async (req: NextRequest, ctx) => {
  assertSameOrigin(req);
  const { id } = await ctx.params;
  const user = await getCurrentUser();
  const access = await assertFamilyWrite(user, id);
  const data = await parseBody(memberCreateSchema, req);

  if (data.branchId) {
    const branch = await prisma.familyBranch.findFirst({ where: { id: data.branchId, familyId: id }, select: { id: true } });
    if (!branch) throw new ApiError(400, "分支不属于该家族", "INVALID_BRANCH");
  }
  // 在世人物默认严格保护，忽略前端要求的 PUBLIC，除非明确由家族管理者设置为 FAMILY
  const visibility = data.isLiving && data.visibility === "PUBLIC" ? "FAMILY" : data.visibility;

  const member = await prisma.familyMember.create({
    data: {
      familyId: id,
      surnameText: data.surnameText,
      givenName: data.givenName,
      courtesyName: data.courtesyName ?? null,
      alias: data.alias ?? null,
      gender: data.gender,
      birthDateText: data.birthDateText ?? null,
      birthYear: data.birthYear ?? null,
      birthPrecision: data.birthPrecision ?? "UNKNOWN",
      deathDateText: data.deathDateText ?? null,
      deathYear: data.deathYear ?? null,
      deathPrecision: data.deathPrecision ?? "UNKNOWN",
      isLiving: data.isLiving,
      birthPlaceId: data.birthPlaceId ?? null,
      ancestralHomeId: data.ancestralHomeId ?? null,
      biography: data.biography ?? null,
      generationNumber: data.generationNumber ?? null,
      generationChar: data.generationChar ?? null,
      generationConfirmed: data.generationConfirmed ?? false,
      branchId: data.branchId ?? null,
      visibility,
      sensitiveDataEncrypted: data.sensitiveData ? encryptSensitive(data.sensitiveData) : null,
      createdById: user!.id,
    },
  });
  await createVersionSnapshot(id, `新增人物：${member.surnameText}${member.givenName}`, user!.id);
  await audit(req, user!.id, "member.create", "family_member", member.id, { after: { name: `${member.surnameText}${member.givenName}` } });
  return ok(publicPersonView(member, access), 201);
});
