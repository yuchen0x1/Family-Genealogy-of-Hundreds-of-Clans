import { NextRequest } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { ok, route, parseBody, assertSameOrigin, ApiError } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth";
import { assertFamilyWrite } from "@/lib/permissions";
import { createVersionSnapshot } from "@/lib/genealogy";
import { detectBloodCycle, type KinshipRelation } from "@/lib/kinship";
import { audit } from "@/lib/audit";
import type { ParsedPerson, ParsedRelation } from "@/lib/genealogy-io";

type Ctx = { id: string; jobId: string };

const schema = z.object({
  confirm: z.literal("IMPORT", { error: "导入需显式确认" }),
  /** 报告中标注为重复/需跳过的人物行号（1-based），由用户勾选 */
  skipRows: z.array(z.number().int().min(1)).max(5000).optional(),
});

const ALLOWED_TYPES = new Set(["PARENT_CHILD", "SPOUSE", "SIBLING", "ADOPTION", "SUCCESSION", "GUARDIANSHIP"]);

/**
 * 用户确认后写入。单个事务内完成人物 + 关系，任一步失败整体回滚。
 * 写入前在内存中结合现有关系做重复、生物学父母数量、血缘环与跨家族引用检查。
 * 所有导入关系默认 UNVERIFIED，不参与称谓计算；不会自动合并同名/同姓人物。
 */
export const POST = route<Ctx>(async (req: NextRequest, ctx) => {
  assertSameOrigin(req);
  const { id, jobId } = await ctx.params;
  const user = await getCurrentUser();
  const access = await assertFamilyWrite(user, id);
  const body = await parseBody(schema, req);

  const job = await prisma.importJob.findFirst({ where: { id: jobId, familyId: id } });
  if (!job) throw new ApiError(404, "导入任务不存在", "NOT_FOUND");
  if (job.status !== "QUEUED") throw new ApiError(409, "该导入任务已执行或已失效", "JOB_ALREADY_DONE");
  if (job.userId !== user!.id && !["OWNER", "ADMIN"].includes(access.level ?? "")) {
    throw new ApiError(403, "只能提交本人创建的导入任务", "FORBIDDEN");
  }
  const payload = job.payload as unknown as { persons?: ParsedPerson[]; relations?: ParsedRelation[] } | null;
  const persons = payload?.persons ?? [];
  const candidateRelations = payload?.relations ?? [];
  if (!persons.length) throw new ApiError(400, "导入任务中没有人物数据", "EMPTY_PAYLOAD");
  if (new Set(persons.map((p) => p.externalId)).size !== persons.length)
    throw new ApiError(409, "文件内人物标识重复，请修正后重新预览", "DUPLICATE_ID");

  const skip = new Set(body.skipRows ?? []);
  const existingRelations = await prisma.familyRelationship.findMany({
    where: { familyId: id, deletedAt: null },
    select: { fromPersonId: true, toPersonId: true, type: true, subtype: true, verification: true },
  });
  const relationKeys = new Set<string>();
  const parentMap = new Map<string, Set<string>>();
  const blood: KinshipRelation[] = [];
  for (const r of existingRelations) {
    const symmetric = r.type === "SPOUSE" || r.type === "SIBLING";
    const key = symmetric
      ? `${r.type}|${[r.fromPersonId, r.toPersonId].sort().join("|")}`
      : `${r.type}|${r.subtype}|${r.fromPersonId}|${r.toPersonId}`;
    relationKeys.add(key);
    if (r.type === "PARENT_CHILD" && r.subtype === "BIOLOGICAL") {
      const set = parentMap.get(r.toPersonId) ?? new Set<string>();
      set.add(r.fromPersonId);
      parentMap.set(r.toPersonId, set);
      blood.push({
        fromPersonId: r.fromPersonId, toPersonId: r.toPersonId,
        type: "PARENT_CHILD", subtype: "BIOLOGICAL", verification: "VERIFIED",
      });
    }
  }

  const skipped: Array<{ index: number; reason: string }> = [];
  const result = await prisma.$transaction(async (tx) => {
    // 条件更新取得任务行锁；并发请求等待后会重新判断 QUEUED，只有一个能写入。
    // 与人物/关系处于同一事务，失败时状态也回滚，仍可重试。
    const claimed = await tx.importJob.updateMany({
      where: { id: jobId, familyId: id, status: "QUEUED" },
      data: { status: "PROCESSING" },
    });
    if (claimed.count !== 1) throw new ApiError(409, "该导入任务已执行或正在处理中", "JOB_ALREADY_DONE");
    const idMap = new Map<string, string>();
    let createdPersons = 0;
    for (let i = 0; i < persons.length; i++) {
      if (skip.has(i + 1)) { skipped.push({ index: i + 1, reason: "用户选择跳过" }); continue; }
      const p = persons[i];
      const created = await tx.familyMember.create({
        data: {
          familyId: id,
          surnameText: (p.surnameText || "未知").slice(0, 20),
          givenName: (p.givenName || "未填写").slice(0, 100),
          gender: (["MALE", "FEMALE", "UNKNOWN"].includes(p.gender) ? p.gender : "UNKNOWN") as never,
          birthDateText: p.birthDateText ?? null,
          birthYear: p.birthYear ?? null,
          deathDateText: p.deathDateText ?? null,
          deathYear: p.deathYear ?? null,
          isLiving: p.isLiving !== false,
          biography: p.biography ?? null,
          generationNumber: p.generationNumber ?? null,
          generationConfirmed: false, // 字辈/世代一律不自动确认
          visibility: "PRIVATE",      // 导入人物默认私有
          verification: "UNVERIFIED",
          createdById: user!.id,
        },
        select: { id: true },
      });
      idMap.set(p.externalId, created.id);
      createdPersons++;
    }

    let createdRelations = 0;
    for (let i = 0; i < candidateRelations.length; i++) {
      const r = candidateRelations[i];
      const from = idMap.get(r.fromExternalId);
      const to = idMap.get(r.toExternalId);
      if (!from || !to) { skipped.push({ index: i + 1, reason: "引用人物不存在或已被跳过" }); continue; }
      if (from === to) { skipped.push({ index: i + 1, reason: "自反关系" }); continue; }
      if (!ALLOWED_TYPES.has(r.type)) { skipped.push({ index: i + 1, reason: `不支持的关系类型 ${r.type}` }); continue; }
      const symmetric = r.type === "SPOUSE" || r.type === "SIBLING";
      const key = symmetric ? `${r.type}|${[from, to].sort().join("|")}` : `${r.type}|${r.subtype}|${from}|${to}`;
      if (relationKeys.has(key)) { skipped.push({ index: i + 1, reason: "重复关系" }); continue; }
      const subtype = r.subtype || "BIOLOGICAL";

      if (r.type === "PARENT_CHILD" && subtype === "BIOLOGICAL") {
        const parents = new Set(parentMap.get(to) ?? []);
        parents.add(from);
        if (parents.size > 2) { skipped.push({ index: i + 1, reason: "生物学父母超过两位" }); continue; }
        const trial: KinshipRelation = { fromPersonId: from, toPersonId: to, type: "PARENT_CHILD", subtype: "BIOLOGICAL", verification: "VERIFIED" };
        const cycle = detectBloodCycle([...blood, trial]);
        if (cycle) { skipped.push({ index: i + 1, reason: `血缘循环 ${cycle.slice(0, 3).join("→")}…` }); continue; }
        blood.push(trial);
        parentMap.set(to, parents);
      }

      await tx.familyRelationship.create({
        data: {
          familyId: id, fromPersonId: from, toPersonId: to,
          type: r.type as never, subtype: subtype as never,
          directional: !symmetric,
          verification: "UNVERIFIED",
          evidenceLevel: "UNVERIFIED",
          notes: `${r.notes ?? "文件导入"}；由导入生成，需人工核实`,
          createdById: user!.id,
        },
      });
      relationKeys.add(key);
      createdRelations++;
    }

    await tx.importJob.update({
      where: { id: jobId },
      data: {
        status: "COMPLETED", completedAt: new Date(),
        report: {
          ...((job.report ?? {}) as Record<string, unknown>),
          committed: true,
          createdPersons, createdRelations, skippedCount: skipped.length,
        } as unknown as Prisma.InputJsonValue,
      },
    });
    return { createdPersons, createdRelations };
  }, { timeout: 60_000 });

  await createVersionSnapshot(id, `导入完成：${job.fileName ?? job.format}（${result.createdPersons} 人 / ${result.createdRelations} 关系）`, user!.id);
  await audit(req, user!.id, "family.import.commit", "import_job", jobId, {
    after: { ...result, skipped: skipped.length },
  });

  return ok({
    ...result,
    skipped,
    notice: "导入关系均为「未核实」，不会参与亲属称谓计算；同名与同姓人物不会自动合并，请人工逐条核对。",
  });
});
