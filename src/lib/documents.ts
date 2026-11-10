/**
 * 家族档案视图裁剪：BigInt 序列化、隐私字段过滤、存储键不外泄。
 * 下载一律通过 /documents/[docId]/download 鉴权，前端不需要也不应拿到 storageKey。
 */
export type DocumentRow = {
  id: string; familyId: string; title: string; category: string; fileName: string;
  storageKey: string; mimeType: string; sizeBytes: bigint; checksum: string;
  visibility: string; description: string | null; ocrText: string | null; ocrStatus: string;
  reviewStatus: string; currentVersion: number; uploadedById: string | null;
  createdAt: Date; updatedAt: Date; deletedAt: Date | null;
};

export function documentView(d: DocumentRow, hasAccess: boolean) {
  return {
    id: d.id,
    familyId: d.familyId,
    title: d.title,
    category: d.category,
    fileName: d.fileName,
    mimeType: d.mimeType,
    sizeBytes: Number(d.sizeBytes),
    sizeText: formatBytes(Number(d.sizeBytes)),
    visibility: d.visibility,
    description: d.description,
    reviewStatus: d.reviewStatus,
    ocrStatus: d.ocrStatus,
    // OCR 文本可能是未校对的原始识别结果，仅协作者可见；绝不自动写入关系
    ocrText: hasAccess ? d.ocrText : null,
    currentVersion: d.currentVersion,
    checksum: hasAccess ? d.checksum : null,
    uploadedById: hasAccess ? d.uploadedById : null,
    createdAt: d.createdAt,
    updatedAt: d.updatedAt,
  };
}

export function formatBytes(n: number): string {
  if (!Number.isFinite(n) || n < 0) return "—";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}

export const DOCUMENT_CATEGORY_LABELS: Record<string, string> = {
  OLD_GENEALOGY: "老族谱", PHOTO: "照片", HISTORICAL_DOCUMENT: "历史文书",
  PDF: "PDF 文档", TEXT: "文本资料", AUDIO: "音频", VIDEO: "视频", OTHER: "其他",
};
