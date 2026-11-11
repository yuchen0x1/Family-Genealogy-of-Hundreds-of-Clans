import { z } from "zod";

export const emailSchema = z.string().trim().toLowerCase().email("邮箱格式不正确").max(255);
export const passwordSchema = z
  .string()
  .min(8, "密码至少 8 位")
  .max(128)
  .regex(/[A-Za-z]/, "密码需包含字母")
  .regex(/[0-9]/, "密码需包含数字");

export const registerSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  displayName: z.string().trim().min(1, "请填写昵称").max(100),
  agreeTerms: z.literal(true, { error: "需同意用户协议与隐私政策" }),
});

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1).max(128),
});

export const profileUpdateSchema = z.object({
  displayName: z.string().trim().min(1).max(100).optional(),
  bio: z.string().max(1000).optional().nullable(),
  surname: z.string().max(20).optional().nullable(),
  location: z.string().max(200).optional().nullable(),
  privacySettings: z.record(z.string(), z.union([z.boolean(), z.string(), z.number()])).optional(),
});

export const familyCreateSchema = z.object({
  name: z.string().trim().min(1, "请填写家族名称").max(200),
  surnameText: z.string().trim().min(1, "请填写姓氏").max(20),
  founderName: z.string().trim().max(100).optional().nullable(),
  ancestralHome: z.string().trim().max(300).optional().nullable(),
  description: z.string().max(10000).optional().nullable(),
  hallName: z.string().trim().max(100).optional().nullable(),
  visibility: z.enum(["PRIVATE", "FAMILY", "PUBLIC"]).default("PRIVATE"),
});

export const familyUpdateSchema = familyCreateSchema.partial().extend({
  visibility: z.enum(["PRIVATE", "FAMILY", "PUBLIC"]).optional(),
});

const datePrecision = z.enum(["EXACT", "YEAR", "MONTH", "RANGE", "APPROXIMATE", "TEXT_ONLY", "UNKNOWN"]);

export const memberCreateSchema = z.object({
  surnameText: z.string().trim().min(1).max(20),
  givenName: z.string().trim().min(1, "请填写名字").max(100),
  courtesyName: z.string().trim().max(100).optional().nullable(),
  alias: z.string().trim().max(200).optional().nullable(),
  gender: z.enum(["MALE", "FEMALE", "UNKNOWN"]).default("UNKNOWN"),
  birthDateText: z.string().max(100).optional().nullable(),
  birthYear: z.number().int().min(-3000).max(3000).optional().nullable(),
  birthPrecision: datePrecision.optional(),
  deathDateText: z.string().max(100).optional().nullable(),
  deathYear: z.number().int().min(-3000).max(3000).optional().nullable(),
  deathPrecision: datePrecision.optional(),
  isLiving: z.boolean().default(true),
  birthPlaceId: z.string().uuid().optional().nullable(),
  ancestralHomeId: z.string().uuid().optional().nullable(),
  biography: z.string().max(20000).optional().nullable(),
  generationNumber: z.number().int().min(1).max(500).optional().nullable(),
  generationChar: z.string().max(10).optional().nullable(),
  generationConfirmed: z.boolean().optional(),
  branchId: z.string().uuid().optional().nullable(),
  visibility: z.enum(["PRIVATE", "FAMILY", "PUBLIC"]).default("PRIVATE"),
  sensitiveData: z.string().max(4000).optional().nullable(),
});

export const memberUpdateSchema = memberCreateSchema.partial();

export const relationshipCreateSchema = z.object({
  fromPersonId: z.string().uuid(),
  toPersonId: z.string().uuid(),
  type: z.enum([
    "PARENT_CHILD", "SPOUSE", "SIBLING", "ADOPTION",
    "SUCCESSION", "GUARDIANSHIP", "CROSS_FAMILY_LINK",
  ]),
  subtype: z.enum([
    "BIOLOGICAL", "ADOPTIVE", "STEP", "FOSTER", "FULL",
    "HALF_PATERNAL", "HALF_MATERNAL", "MARRIAGE", "CONCUBINAGE", "UNKNOWN",
  ]).default("BIOLOGICAL"),
  verification: z.enum(["UNVERIFIED", "PENDING", "VERIFIED", "DISPUTED", "REJECTED"]).default("UNVERIFIED"),
  evidenceLevel: z.enum(["DOCUMENTED", "TRADITION", "INFERRED", "UNVERIFIED"]).default("UNVERIFIED"),
  startDateText: z.string().max(100).optional().nullable(),
  endDateText: z.string().max(100).optional().nullable(),
  marriageOrder: z.number().int().min(1).max(50).optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
  sourceId: z.string().uuid().optional().nullable(),
  documentId: z.string().uuid().optional().nullable(),
});

export const postCreateSchema = z.object({
  title: z.string().trim().min(2).max(300),
  content: z.string().trim().min(2).max(20000),
  type: z.enum(["SEEK_RELATIVE", "DISCUSSION", "ANNOUNCEMENT", "EVENT", "FAMILY_NEWS", "CORRECTION"]).default("DISCUSSION"),
  familyId: z.string().uuid().optional().nullable(),
  surnameId: z.string().uuid().optional().nullable(),
  clues: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])).optional(),
  visibility: z.enum(["PRIVATE", "FAMILY", "PUBLIC"]).default("PUBLIC"),
  tags: z.array(z.string().max(30)).max(10).optional(),
});

export const commentCreateSchema = z.object({
  content: z.string().trim().min(1).max(5000),
  parentId: z.string().uuid().optional().nullable(),
});

export const messageCreateSchema = z.object({
  recipientId: z.string().uuid(),
  content: z.string().trim().min(1).max(5000),
});
