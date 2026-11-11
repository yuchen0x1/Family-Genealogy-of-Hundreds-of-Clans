import { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { ok, route, parseBody, assertSameOrigin, ApiError } from "@/lib/api";
import { requireAdmin } from "@/lib/auth";
import { audit } from "@/lib/audit";

/** 允许后台修改的设置键；安全相关开关只读，避免误操作放开隐私默认策略。 */
const EDITABLE: Record<string, z.ZodTypeAny> = {
  "site.name": z.string().trim().min(1).max(100),
  "search.provider": z.enum(["postgres_pgtrgm", "meilisearch", "opensearch"]),
  "history.review_required": z.boolean(),
};
const READ_ONLY_KEYS = [
  "privacy.family_default_visibility",
  "privacy.living_member_default_visibility",
  "clan.auto_merge_enabled",
  "kinship.require_verified_relations",
];

const patchSchema = z.object({
  key: z.string().min(1).max(100),
  value: z.union([z.string(), z.boolean(), z.number()]),
});

export const GET = route(async () => {
  await requireAdmin();
  const rows = await prisma.systemSetting.findMany({ orderBy: { key: "asc" } });
  return ok({
    items: rows.map((r) => ({ ...r, editable: r.key in EDITABLE })),
    readOnlyKeys: READ_ONLY_KEYS,
    notice: "隐私默认策略与同姓自动合并开关为只读：私有默认、在世人物保护、仅使用已核实关系，不允许从后台关闭。",
  });
});

/** 更新设置：白名单键 + 类型校验 + 审计留痕；只读安全键拒绝修改。 */
export const PATCH = route(async (req: NextRequest) => {
  assertSameOrigin(req);
  const admin = await requireAdmin();
  const data = await parseBody(patchSchema, req);
  if (READ_ONLY_KEYS.includes(data.key)) {
    throw new ApiError(403, "该设置属于平台安全基线，不允许从后台关闭或修改", "READ_ONLY_SETTING");
  }
  const schema = EDITABLE[data.key];
  if (!schema) throw new ApiError(400, `设置项 ${data.key} 不可修改或不存在`, "UNKNOWN_SETTING");
  const parsed = schema.safeParse(data.value);
  if (!parsed.success) throw new ApiError(422, "设置值校验失败", "VALIDATION_ERROR", parsed.error.flatten());
  const existing = await prisma.systemSetting.findUnique({ where: { key: data.key } });
  const value = { value: parsed.data } as Prisma.InputJsonValue;
  const row = await prisma.systemSetting.upsert({
    where: { key: data.key },
    create: { key: data.key, value, updatedBy: admin.id },
    update: { value, updatedBy: admin.id },
  });
  await audit(req, admin.id, "admin.setting.update", "system_setting", null, {
    before: { key: data.key, value: existing?.value ?? null }, after: { key: data.key, value: parsed.data },
  });
  return ok({ key: row.key, value: row.value });
});
