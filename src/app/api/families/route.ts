import { NextRequest } from "next/server";
import { FamilyPermissionCode, CollaboratorStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { ok, route, parseBody, getQuery, paginate, assertSameOrigin } from "@/lib/api";
import { familyCreateSchema } from "@/lib/validation";
import { requireUser } from "@/lib/auth";
import { visibleFamilyIds } from "@/lib/permissions";
import { audit } from "@/lib/audit";
import { cacheInvalidate } from "@/lib/cache";

/** GET：公开族谱列表；?mine=1 时返回当前用户拥有/参与的族谱（含私有）。 */
export const GET = route(async (req: NextRequest) => {
  const { page, pageSize, params } = getQuery(req);
  const mine = params.get("mine") === "1";
  const keyword = (params.get("keyword") || "").trim();

  if (mine) {
    const user = await requireUser();
    const ids = await visibleFamilyIds(user.id);
    const where = {
      id: { in: ids },
      deletedAt: null,
      ...(keyword ? { name: { contains: keyword } } : {}),
    };
    const [items, total] = await Promise.all([
      prisma.family.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: { _count: { select: { members: true, relationships: true } } },
      }),
      prisma.family.count({ where }),
    ]);
    return ok(paginate(items, total, page, pageSize));
  }

  const where = {
    visibility: "PUBLIC" as const,
    deletedAt: null,
    ...(keyword ? { name: { contains: keyword } } : {}),
  };
  const [items, total] = await Promise.all([
    prisma.family.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true, name: true, surnameText: true, ancestralHome: true, hallName: true,
        description: true, visibility: true, isDemo: true, createdAt: true,
        _count: { select: { members: true, relationships: true } },
      },
    }),
    prisma.family.count({ where }),
  ]);
  return ok(paginate(items, total, page, pageSize));
});

/** POST：创建家族族谱。默认 PRIVATE，创建者自动成为 OWNER。 */
export const POST = route(async (req: NextRequest) => {
  assertSameOrigin(req);
  const user = await requireUser();
  const data = await parseBody(familyCreateSchema, req);

  const surname = await prisma.surname.findUnique({ where: { name: data.surnameText }, select: { id: true } });
  const family = await prisma.$transaction(async (tx) => {
    const created = await tx.family.create({
      data: {
        name: data.name,
        surnameText: data.surnameText,
        surnameId: surname?.id ?? null,
        founderName: data.founderName ?? null,
        ancestralHome: data.ancestralHome ?? null,
        description: data.description ?? null,
        hallName: data.hallName ?? null,
        visibility: data.visibility,
        ownerId: user.id,
      },
    });
    await tx.familyCollaborator.create({
      data: {
        familyId: created.id,
        userId: user.id,
        permission: FamilyPermissionCode.OWNER,
        status: CollaboratorStatus.ACTIVE,
        acceptedAt: new Date(),
      },
    });
    return created;
  });

  await audit(req, user.id, "family.create", "family", family.id, { after: { name: family.name, visibility: family.visibility } });
  await cacheInvalidate("families:");
  return ok(family, 201);
});
