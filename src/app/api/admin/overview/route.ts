import { prisma } from "@/lib/db";
import { ok, route } from "@/lib/api";
import { requireAdmin } from "@/lib/auth";
import { cacheHealth } from "@/lib/cache";
import { storageInfo } from "@/lib/storage";
import { ADMIN_NOTE } from "@/lib/admin";

/** 后台概览：仅聚合计数与服务健康状态，不下发任何私有族谱人物明细。 */
export const GET = route(async () => {
  await requireAdmin();
  const alive = { deletedAt: null };
  const [
    users, activeUsers, families, publicFamilies, members, relations,
    surnames, pendingSurnames, sources, pendingSources, places, migrations,
    posts, publishedPosts, hiddenPosts, comments, documents, pendingDocuments,
    openReports, inReviewReports, auditLogs, importJobs, exportJobs,
    recentAudit, settingRow,
  ] = await Promise.all([
    prisma.user.count({ where: alive }),
    prisma.user.count({ where: { ...alive, status: "ACTIVE" } }),
    prisma.family.count({ where: alive }),
    prisma.family.count({ where: { ...alive, visibility: "PUBLIC" } }),
    prisma.familyMember.count({ where: alive }),
    prisma.familyRelationship.count({ where: alive }),
    prisma.surname.count({ where: alive }),
    prisma.surname.count({ where: { ...alive, reviewStatus: { in: ["PENDING", "DRAFT"] } } }),
    prisma.historicalSource.count({ where: alive }),
    prisma.historicalSource.count({ where: { ...alive, reviewStatus: "PENDING" } }),
    prisma.historicalPlace.count({ where: alive }),
    prisma.migrationRecord.count({ where: alive }),
    prisma.post.count({ where: alive }),
    prisma.post.count({ where: { ...alive, status: "PUBLISHED" } }),
    prisma.post.count({ where: { ...alive, status: { in: ["HIDDEN", "PENDING_REVIEW"] } } }),
    prisma.comment.count({ where: alive }),
    prisma.familyDocument.count({ where: alive }),
    prisma.familyDocument.count({ where: { ...alive, reviewStatus: "PENDING" } }),
    prisma.report.count({ where: { status: "OPEN" } }),
    prisma.report.count({ where: { status: "IN_REVIEW" } }),
    prisma.auditLog.count(),
    prisma.importJob.count(),
    prisma.exportJob.count(),
    prisma.auditLog.findMany({
      orderBy: { createdAt: "desc" }, take: 8,
      select: { id: true, action: true, entityType: true, actorId: true, createdAt: true },
    }),
    prisma.systemSetting.findUnique({ where: { key: "search.provider" } }),
  ]);

  let database: "connected" | "error" = "connected";
  try { await prisma.$queryRaw`SELECT 1`; } catch { database = "error"; }
  const storage = storageInfo();

  return ok({
    counts: {
      users, activeUsers, families, publicFamilies, members, relations,
      surnames, pendingSurnames, sources, pendingSources, places, migrations,
      posts, publishedPosts, hiddenPosts, comments, documents, pendingDocuments,
      openReports, inReviewReports, auditLogs, importJobs, exportJobs,
    },
    pending: {
      surnames: pendingSurnames, sources: pendingSources,
      posts: hiddenPosts, documents: pendingDocuments,
      reports: openReports + inReviewReports,
    },
    services: {
      database,
      cache: await cacheHealth(),
      storageDriver: storage.driver,
      s3Configured: storage.s3Configured,
      ocrConfigured: Boolean(process.env.OCR_API_URL && process.env.OCR_API_KEY),
      searchProvider: String((settingRow?.value as { value?: unknown } | null)?.value ?? "postgres_pgtrgm"),
    },
    recentAudit,
    notice: ADMIN_NOTE,
  });
});
