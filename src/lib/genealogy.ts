import { Prisma, RelationType, RelationSubtype, Visibility } from "@prisma/client";
import { prisma } from "./db";
import { ApiError } from "./api";
import { detectBloodCycle, getAncestors, getDescendants, buildKinshipGraph, type KinshipPerson, type KinshipRelation } from "./kinship";
import { sha256 } from "./crypto";
import { canViewPersonDetails, type FamilyAccess } from "./permissions";

export interface RelationInput {
  fromPersonId: string;
  toPersonId: string;
  type: RelationType;
  subtype: RelationSubtype;
  verification?: string;
  marriageOrder?: number | null;
}

export interface ValidationReport {
  errors: string[];
  warnings: string[];
}

/**
 * 关系写入前的完整校验。
 * 关键：防止血缘循环、超过两位生物学父母、自反关系、重复关系、
 * 同名人物误合并、父母年龄倒挂、跨家族自动关联。
 */
export async function validateRelationship(
  familyId: string,
  input: RelationInput,
  excludeId?: string,
): Promise<ValidationReport> {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (input.fromPersonId === input.toPersonId) errors.push("不能把人物与自身建立关系");

  const [from, to] = await Promise.all([
    prisma.familyMember.findFirst({ where: { id: input.fromPersonId, familyId, deletedAt: null } }),
    prisma.familyMember.findFirst({ where: { id: input.toPersonId, familyId, deletedAt: null } }),
  ]);
  if (!from || !to) errors.push("关系两端的人物必须存在且属于同一家族（不允许跨家族自动建立血缘关系）");
  if (!from || !to) return { errors, warnings };

  const existing = await prisma.familyRelationship.findMany({
    where: { familyId, deletedAt: null, id: excludeId ? { not: excludeId } : undefined },
    select: {
      id: true, fromPersonId: true, toPersonId: true, type: true, subtype: true, verification: true,
    },
  });

  // 重复关系（含对称关系的反向写法）
  const symmetric = input.type === RelationType.SPOUSE || input.type === RelationType.SIBLING;
  const duplicate = existing.find((r) =>
    r.type === input.type &&
    r.subtype === input.subtype &&
    (r.fromPersonId === input.fromPersonId && r.toPersonId === input.toPersonId ||
      (symmetric && r.fromPersonId === input.toPersonId && r.toPersonId === input.fromPersonId)),
  );
  if (duplicate) errors.push("该关系已存在（对称关系会检查反向写法）");

  if (input.type === RelationType.PARENT_CHILD && input.subtype === RelationSubtype.BIOLOGICAL) {
    const parentCount = new Set(
      existing
        .filter((r) => r.toPersonId === input.toPersonId && r.type === RelationType.PARENT_CHILD && r.subtype === RelationSubtype.BIOLOGICAL)
        .map((r) => r.fromPersonId),
    ).add(input.fromPersonId);
    if (parentCount.size > 2) errors.push("一位人物最多只能有两位生物学父母");

    const parents = await prisma.familyMember.findMany({
      where: { id: { in: Array.from(parentCount) } },
      select: { id: true, gender: true },
    });
    if (parents.length === 2) {
      const genders = parents.map((x) => x.gender);
      if (genders.every((g) => g === "MALE")) warnings.push("两位生物学父母均登记为男性，请核对资料");
      if (genders.every((g) => g === "FEMALE")) warnings.push("两位生物学父母均登记为女性，请核对资料");
    }

    if (from.birthYear && to.birthYear && from.birthYear >= to.birthYear) {
      warnings.push("父母的出生年份晚于或等于子女，请核对年代");
    }
    if (input.verification !== "VERIFIED") {
      warnings.push("此关系尚未核实，不会参与亲属称谓计算与血缘追溯");
    }
  }

  if (input.type === RelationType.SPOUSE) {
    if (from.id === to.id) errors.push("不能与自身建立婚姻关系");
    const previous = existing.filter((r) => r.type === RelationType.SPOUSE && (r.fromPersonId === from.id || r.toPersonId === from.id));
    if (previous.length > 0 && !input.marriageOrder) {
      warnings.push("该人物已有婚姻关系；如需记录多次婚姻，请填写婚姻序号与起止时间");
    }
  }

  if (input.type === RelationType.CROSS_FAMILY_LINK) {
    errors.push("跨家族关联必须通过「分支关联申请」由双方确认并核验证据，不能在此直接创建");
  }

  // 血缘环检测（包含本次将写入的关系）
  const bloodRelations: KinshipRelation[] = existing
    .filter((r) => r.type === RelationType.PARENT_CHILD && r.subtype === RelationSubtype.BIOLOGICAL)
    .map((r) => ({
      fromPersonId: r.fromPersonId,
      toPersonId: r.toPersonId,
      type: "PARENT_CHILD",
      subtype: "BIOLOGICAL",
      verification: r.verification === "REJECTED" ? "REJECTED" : "VERIFIED",
    }));
  if (input.type === RelationType.PARENT_CHILD && input.subtype === RelationSubtype.BIOLOGICAL) {
    bloodRelations.push({
      fromPersonId: input.fromPersonId,
      toPersonId: input.toPersonId,
      type: "PARENT_CHILD",
      subtype: "BIOLOGICAL",
      verification: "VERIFIED",
    });
  }
  const cycle = detectBloodCycle(bloodRelations);
  if (cycle) errors.push(`检测到血缘循环：${cycle.join(" → ")}，请核对关系方向`);

  if (from.surnameText + from.givenName === to.surnameText + to.givenName) {
    warnings.push("关系两端人物姓名相同，请确认不是同名人物误合并");
  }

  return { errors, warnings };
}

/** 公开可见的人物字段裁剪：不泄露在世人物的敏感信息与私有详情。 */
export function publicPersonView<T extends {
  id: string; surnameText: string; givenName: string; gender: string;
  isLiving: boolean; visibility: Visibility; birthDateText?: string | null;
  birthYear?: number | null; deathYear?: number | null; biography?: string | null;
  sensitiveDataEncrypted?: string | null;
}>(person: T, access: FamilyAccess) {
  const hasAccess = Boolean(access.level);
  // 详情判定统一走 permissions.canViewPersonDetails，避免各调用点口径漂移：
  // 公开族谱中已故 PRIVATE 人物只展示姓名与世代，生平与日期仅协作者可见
  const detailed = canViewPersonDetails(access, person);
  const base = {
    id: person.id,
    name: `${person.surnameText}${person.givenName}`,
    surnameText: person.surnameText,
    givenName: person.givenName,
    gender: person.gender,
    isLiving: person.isLiving,
    visibility: person.visibility,
  };
  // 家族协作者可读取完整的可编辑字段；非协作者仅在人物详情判定通过时看到年代与生平资料。
  // 无论哪种情况，加密后的敏感字段都永不返回给客户端。
  const editable = hasAccess ? (() => {
    const p = person as unknown as Record<string, unknown>;
    return {
      courtesyName: p.courtesyName ?? null,
      alias: p.alias ?? null,
      birthPrecision: p.birthPrecision ?? null,
      deathDateText: p.deathDateText ?? null,
      deathPrecision: p.deathPrecision ?? null,
      birthPlaceId: p.birthPlaceId ?? null,
      ancestralHomeId: p.ancestralHomeId ?? null,
      generationNumber: p.generationNumber ?? null,
      generationChar: p.generationChar ?? null,
      generationConfirmed: p.generationConfirmed ?? false,
      branchId: p.branchId ?? null,
      verification: p.verification ?? null,
      version: p.version ?? null,
      createdAt: p.createdAt ?? null,
      updatedAt: p.updatedAt ?? null,
    };
  })() : {};
  return {
    ...base,
    birthDateText: detailed ? person.birthDateText ?? null : null,
    birthYear: detailed ? person.birthYear ?? null : null,
    deathYear: detailed ? person.deathYear ?? null : null,
    biography: detailed ? person.biography ?? null : null,
    ...editable,
    sensitiveDataEncrypted: undefined,
  };
}

export interface GraphNode {
  id: string;
  name: string;
  gender: string;
  birthYear: number | null;
  deathYear: number | null;
  isLiving: boolean;
  generationNumber: number | null;
  generationChar: string | null;
  branchId: string | null;
  visibility: string;
  isFocus: boolean;
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  type: string;
  subtype: string;
  verification: string;
  label: string;
}

/**
 * 图谱按需加载：以 focus 人物为中心，向上取 ancestors 代、向下取 descendants 代，
 * 单次最多返回 MAX_NODES 个节点，超出部分标记 hasMore，由前端继续按视口请求。
 */
export const MAX_GRAPH_NODES = 200;

export async function buildPartialGraph(
  familyId: string,
  focusId?: string | null,
  up = 2,
  down = 2,
  hasAccess = true,
) {
  const members = await prisma.familyMember.findMany({
    where: { familyId, deletedAt: null },
    select: {
      id: true, surnameText: true, givenName: true, gender: true,
      birthYear: true, deathYear: true, isLiving: true, generationNumber: true,
      generationChar: true, branchId: true, visibility: true,
    },
    orderBy: [{ generationNumber: "asc" }, { birthYear: "asc" }],
  });
  const relations = await prisma.familyRelationship.findMany({
    where: { familyId, deletedAt: null },
    select: { id: true, fromPersonId: true, toPersonId: true, type: true, subtype: true, verification: true },
  });

  const personById = new Map(members.map((m) => [m.id, m]));
  let focus = focusId && personById.has(focusId) ? focusId : null;
  if (!focus) {
    // 默认从世代最早（或出生最早）的人物开始
    focus = members[0]?.id ?? null;
  }

  const kinshipPeople: KinshipPerson[] = members.map((m) => ({
    id: m.id,
    gender: m.gender as KinshipPerson["gender"],
    birthYear: m.birthYear,
    generationNumber: m.generationNumber,
  }));
  const kinshipRelations: KinshipRelation[] = relations.map((r) => ({
    fromPersonId: r.fromPersonId,
    toPersonId: r.toPersonId,
    type: r.type as KinshipRelation["type"],
    subtype: r.subtype as KinshipRelation["subtype"],
    verification: r.verification as KinshipRelation["verification"],
  }));
  const kg = buildKinshipGraph(kinshipPeople, kinshipRelations, { requireVerified: true });

  const selected = new Set<string>();
  if (focus) {
    selected.add(focus);
    for (const a of getAncestors(kg, focus, Math.min(5, up))) {
      for (const id of a.ids) {
        if (selected.size >= MAX_GRAPH_NODES) break;
        selected.add(id);
      }
    }
    for (const d of getDescendants(kg, focus, Math.min(5, down))) {
      for (const id of d.ids) {
        if (selected.size >= MAX_GRAPH_NODES) break;
        selected.add(id);
      }
    }
    // 配偶与兄弟姐妹也算入当前视野（便于展示家庭单元）
    for (const e of kg.edges.get(focus) ?? []) {
      if (selected.size >= MAX_GRAPH_NODES) break;
      if (!e.blood || ["OB", "LB", "B", "OS", "LS", "Z"].includes(e.code)) selected.add(e.to);
    }
  } else {
    for (const m of members.slice(0, MAX_GRAPH_NODES)) selected.add(m.id);
  }

  const nodes: GraphNode[] = Array.from(selected)
    .map((id) => personById.get(id))
    .filter((m): m is NonNullable<typeof m> => Boolean(m))
    .map((m) => ({
      id: m.id,
      name: `${m.surnameText}${m.givenName}`,
      gender: m.gender,
      birthYear: m.birthYear,
      deathYear: m.deathYear,
      isLiving: m.isLiving,
      generationNumber: m.generationNumber,
      generationChar: m.generationChar,
      branchId: m.branchId,
      visibility: m.visibility,
      isFocus: m.id === focus,
    }));

  const labelMap: Record<string, string> = {
    PARENT_CHILD: "亲子", SPOUSE: "配偶", SIBLING: "手足", ADOPTION: "收养",
    SUCCESSION: "过继", GUARDIANSHIP: "监护", CROSS_FAMILY_LINK: "跨家族关联",
  };
  const edges: GraphEdge[] = relations
    .filter((r) => selected.has(r.fromPersonId) && selected.has(r.toPersonId))
    .map((r) => ({
      id: r.id,
      source: r.fromPersonId,
      target: r.toPersonId,
      type: r.type,
      subtype: r.subtype,
      verification: r.verification,
      label: labelMap[r.type] ?? r.type,
    }));

  return {
    nodes,
    edges,
    focusId: focus,
    totalMembers: members.length,
    totalRelations: relations.length,
    hasMore: members.length > selected.size,
    hasAccess,
    ignoredRelations: kg.ignored.length,
  };
}

/** 生成族谱版本快照（成员 + 关系 + 字辈 + 分支），用于版本对比与恢复。 */
export async function createVersionSnapshot(familyId: string, label: string, userId: string, changeSummary?: string) {
  const [members, relationships, poems, branches, generations, last] = await Promise.all([
    prisma.familyMember.findMany({ where: { familyId, deletedAt: null } }),
    prisma.familyRelationship.findMany({ where: { familyId, deletedAt: null } }),
    prisma.generationPoem.findMany({ where: { familyId, deletedAt: null } }),
    prisma.familyBranch.findMany({ where: { familyId, deletedAt: null } }),
    prisma.familyGeneration.findMany({ where: { familyId } }),
    prisma.genealogyVersion.findFirst({ where: { familyId }, orderBy: { versionNumber: "desc" } }),
  ]);
  const snapshot = {
    createdAt: new Date().toISOString(),
    // 敏感字段永不进入版本快照，避免历史版本成为泄露通道
    members: members.map((m) => ({
      id: m.id, familyId: m.familyId, surnameText: m.surnameText, givenName: m.givenName,
      courtesyName: m.courtesyName, alias: m.alias, gender: m.gender,
      birthDateText: m.birthDateText, birthYear: m.birthYear, birthPrecision: m.birthPrecision,
      deathDateText: m.deathDateText, deathYear: m.deathYear, deathPrecision: m.deathPrecision,
      isLiving: m.isLiving, birthPlaceId: m.birthPlaceId, ancestralHomeId: m.ancestralHomeId,
      biography: m.biography, generationNumber: m.generationNumber, generationChar: m.generationChar,
      generationConfirmed: m.generationConfirmed, branchId: m.branchId, avatarFileId: m.avatarFileId,
      visibility: m.visibility, verification: m.verification, version: m.version, createdById: m.createdById,
      createdAt: m.createdAt.toISOString(), updatedAt: m.updatedAt.toISOString(), deletedAt: null,
    })),
    relationships: relationships.map((r) => ({ ...r, createdAt: r.createdAt.toISOString(), updatedAt: r.updatedAt.toISOString(), deletedAt: null })),
    poems, branches, generations,
  };
  const versionNumber = (last?.versionNumber ?? 0) + 1;
  const version = await prisma.genealogyVersion.create({
    data: {
      familyId,
      versionNumber,
      label,
      changeSummary: changeSummary ?? null,
      snapshot: snapshot as unknown as Prisma.InputJsonObject,
      checksum: sha256(JSON.stringify(snapshot)),
      createdById: userId,
    },
  });
  return version;
}

export async function ensureFamilyExists(familyId: string) {
  const family = await prisma.family.findFirst({ where: { id: familyId, deletedAt: null } });
  if (!family) throw new ApiError(404, "家族不存在或已删除", "NOT_FOUND");
  return family;
}
