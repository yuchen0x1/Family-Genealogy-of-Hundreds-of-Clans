import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { ok, route, parseBody, assertSameOrigin, ApiError } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth";
import { assertFamilyWrite } from "@/lib/permissions";
import { createVersionSnapshot } from "@/lib/genealogy";
import { audit } from "@/lib/audit";

type Ctx = { id: string; versionId: string };

const schema = z.object({
  confirm: z.literal("RESTORE", { error: "恢复操作需显式确认" }),
});

type SnapshotMember = {
  id: string; familyId: string; surnameText: string; givenName: string;
  courtesyName: string | null; alias: string | null; gender: string;
  birthDateText: string | null; birthYear: number | null; birthPrecision: string;
  deathDateText: string | null; deathYear: number | null; deathPrecision: string;
  isLiving: boolean; birthPlaceId: string | null; ancestralHomeId: string | null;
  biography: string | null; generationNumber: number | null; generationChar: string | null;
  generationConfirmed: boolean; branchId: string | null; avatarFileId: string | null;
  visibility: string; verification: string; version: number; createdById: string | null;
};
type SnapshotRelation = {
  id: string; familyId: string; fromPersonId: string; toPersonId: string;
  type: string; subtype: string; directional: boolean; verification: string;
  evidenceLevel: string; startDateText: string | null; endDateText: string | null;
  marriageOrder: number | null; notes: string | null; sourceId: string | null;
  documentId: string | null; createdById: string | null;
};

/**
 * 恢复版本：仅 OWNER 可执行，必须先创建「恢复前自动备份」，且需显式 confirm。
 * 恢复范围：人物 + 关系（字辈/分支/文档有独立版本机制，不被覆盖）。
 */
export const POST = route<Ctx>(async (req: NextRequest, ctx) => {
  assertSameOrigin(req);
  const { id, versionId } = await ctx.params;
  const user = await getCurrentUser();
  await assertFamilyWrite(user, id, "OWNER");
  await parseBody(schema, req);

  const version = await prisma.genealogyVersion.findFirst({ where: { id: versionId, familyId: id } });
  if (!version) throw new ApiError(404, "版本不存在", "NOT_FOUND");
  const snapshot = version.snapshot as unknown as { members?: SnapshotMember[]; relationships?: SnapshotRelation[] };
  const members = snapshot.members ?? [];
  const relationships = snapshot.relationships ?? [];

  // 先备份当前状态，保证恢复本身可撤销
  const backup = await createVersionSnapshot(id, `恢复版本 ${version.versionNumber} 前的自动备份`, user!.id);

  await prisma.$transaction(async (tx) => {
    const now = new Date();
    await tx.familyRelationship.updateMany({ where: { familyId: id, deletedAt: null }, data: { deletedAt: now } });
    await tx.familyMember.updateMany({ where: { familyId: id, deletedAt: null }, data: { deletedAt: now } });

    for (const m of members) {
      await tx.familyMember.upsert({
        where: { id: m.id },
        update: {
          deletedAt: null, surnameText: m.surnameText, givenName: m.givenName,
          courtesyName: m.courtesyName, alias: m.alias, gender: m.gender as never,
          birthDateText: m.birthDateText, birthYear: m.birthYear, birthPrecision: m.birthPrecision as never,
          deathDateText: m.deathDateText, deathYear: m.deathYear, deathPrecision: m.deathPrecision as never,
          isLiving: m.isLiving, birthPlaceId: m.birthPlaceId, ancestralHomeId: m.ancestralHomeId,
          biography: m.biography, generationNumber: m.generationNumber, generationChar: m.generationChar,
          generationConfirmed: m.generationConfirmed, branchId: m.branchId,
          visibility: m.visibility as never, verification: m.verification as never,
        },
        create: {
          id: m.id, familyId: id, surnameText: m.surnameText, givenName: m.givenName,
          courtesyName: m.courtesyName, alias: m.alias, gender: m.gender as never,
          birthDateText: m.birthDateText, birthYear: m.birthYear, birthPrecision: m.birthPrecision as never,
          deathDateText: m.deathDateText, deathYear: m.deathYear, deathPrecision: m.deathPrecision as never,
          isLiving: m.isLiving, birthPlaceId: m.birthPlaceId, ancestralHomeId: m.ancestralHomeId,
          biography: m.biography, generationNumber: m.generationNumber, generationChar: m.generationChar,
          generationConfirmed: m.generationConfirmed, branchId: m.branchId, avatarFileId: m.avatarFileId,
          visibility: m.visibility as never, verification: m.verification as never,
          createdById: m.createdById,
        },
      });
    }
    for (const r of relationships) {
      await tx.familyRelationship.upsert({
        where: { id: r.id },
        update: {
          deletedAt: null, type: r.type as never, subtype: r.subtype as never,
          directional: r.directional, verification: r.verification as never,
          evidenceLevel: r.evidenceLevel as never, startDateText: r.startDateText,
          endDateText: r.endDateText, marriageOrder: r.marriageOrder, notes: r.notes,
        },
        create: {
          id: r.id, familyId: id, fromPersonId: r.fromPersonId, toPersonId: r.toPersonId,
          type: r.type as never, subtype: r.subtype as never, directional: r.directional,
          verification: r.verification as never, evidenceLevel: r.evidenceLevel as never,
          startDateText: r.startDateText, endDateText: r.endDateText,
          marriageOrder: r.marriageOrder, notes: r.notes, sourceId: r.sourceId,
          documentId: r.documentId, createdById: r.createdById,
        },
      });
    }
  }, { timeout: 60_000 });

  await audit(req, user!.id, "version.restore", "genealogy_version", versionId, {
    after: { restoredVersion: version.versionNumber, backupVersion: backup.versionNumber, members: members.length, relationships: relationships.length },
  });
  return ok({
    restoredVersion: version.versionNumber,
    backupVersion: backup.versionNumber,
    membersRestored: members.length,
    relationshipsRestored: relationships.length,
  });
});
