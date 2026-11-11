"use client";

import { useState } from "react";
import useSWR from "swr";
import { UploadCloud, Search, Download, Eye, Trash2, FileText, FileImage, FileAudio, FileVideo, ScanText, Link2, History, ShieldCheck, Info } from "lucide-react";
import { apiRequest, fetcher } from "@/lib/client";
import { Button } from "@/components/ui/button";
import { Badge, Card, EmptyState, Input, Select, Textarea } from "@/components/ui/primitives";
import {
  Field, Modal, Notice, Pager, parseError, VISIBILITY_LABELS,
  DOCUMENT_CATEGORY_LABELS, formatDate, formatBytesSafe,
  type NoticeData,
} from "@/components/family/shared";

type DocRow = {
  id: string; title: string; category: string; fileName: string; mimeType: string;
  sizeBytes: number; sizeText: string; visibility: string; description: string | null;
  reviewStatus: string; ocrStatus: string; ocrText: string | null; currentVersion: number; createdAt: string;
};
type DocDetail = DocRow & {
  checksum: string | null; uploadedById: string | null;
  versions: Array<{ id: string; versionNumber: number; sizeBytes: number; checksum: string; changeNote: string | null; createdAt: string }>;
  personLinks: Array<{ id: string; personId: string; name: string; linkType: string; verification: string }>;
  sources: Array<{ id: string; citationText: string | null; verification: string }>;
};
type Paged<T> = { items: T[]; total: number; page: number; pageSize: number; totalPages: number };
type PersonOption = { id: string; name: string };

const CATEGORIES = Object.entries(DOCUMENT_CATEGORY_LABELS);
const REVIEW_LABELS: Record<string, string> = { DRAFT: "草稿", PENDING: "待审核", APPROVED: "已审核", REJECTED: "已驳回", DISPUTED: "存疑" };

function iconOf(mime: string) {
  if (mime.startsWith("image/")) return FileImage;
  if (mime.startsWith("audio/")) return FileAudio;
  if (mime.startsWith("video/")) return FileVideo;
  if (mime === "application/pdf") return FileText;
  return ScanText;
}

export function ArchivePanel({ familyId, canWrite, canAdmin }: {
  familyId: string; canWrite: boolean; canAdmin: boolean;
}) {
  const [page, setPage] = useState(1);
  const [keyword, setKeyword] = useState("");
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const [uploadOpen, setUploadOpen] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<DocRow | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<NoticeData | null>(null);
  const [form, setForm] = useState({ title: "", category: "OTHER", description: "", visibility: "PRIVATE", sourceText: "" });
  const [file, setFile] = useState<File | null>(null);

  const url = `/api/families/${familyId}/documents?page=${page}&keyword=${encodeURIComponent(query)}${category ? `&category=${category}` : ""}`;
  const { data, error, isLoading, mutate } = useSWR<Paged<DocRow>>(url, fetcher, { keepPreviousData: true });

  const downloadUrl = (docId: string, version?: number) =>
    `/api/families/${familyId}/documents/${docId}/download${version ? `?version=${version}` : ""}`;

  const upload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) { setNotice({ kind: "error", title: "请选择文件" }); return; }
    if (!form.title.trim()) { setNotice({ kind: "error", title: "请填写档案标题" }); return; }
    setBusy(true); setNotice(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("title", form.title.trim());
      fd.append("category", form.category);
      fd.append("description", form.description.trim());
      fd.append("visibility", form.visibility);
      fd.append("sourceText", form.sourceText.trim());
      await apiRequest(`/api/families/${familyId}/documents`, { method: "POST", formData: fd });
      setNotice({ kind: "success", title: "档案已上传，状态为待审核", lines: ["文件保存在非公开目录，只能通过鉴权后的下载接口读取。"] });
      setUploadOpen(false);
      setFile(null);
      setForm({ title: "", category: "OTHER", description: "", visibility: "PRIVATE", sourceText: "" });
      await mutate();
    } catch (err) { setNotice(parseError(err)); }
    finally { setBusy(false); }
  };

  const remove = async () => {
    if (!deleting) return;
    setBusy(true); setNotice(null);
    try {
      await apiRequest(`/api/families/${familyId}/documents/${deleting.id}`, { method: "DELETE" });
      setNotice({ kind: "success", title: "档案已移入回收状态（软删除），文件与版本仍保留" });
      setDeleting(null);
      await mutate();
    } catch (err) { setNotice(parseError(err)); }
    finally { setBusy(false); }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-serif text-lg font-semibold text-ink">家族档案与文献</h2>
          <p className="mt-1 text-xs text-graphite">老族谱、照片、PDF、音视频与文本资料。上传文件不公开存放，下载前逐次鉴权；OCR 文本不会自动转为亲属关系。</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <form onSubmit={(e) => { e.preventDefault(); setQuery(keyword.trim()); setPage(1); }} className="relative">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-graphite" />
            <Input value={keyword} onChange={(e) => setKeyword(e.target.value)} placeholder="检索标题/文件名" className="h-9 w-40 pl-8 text-xs" />
          </form>
          <Select value={category} onChange={(e) => { setCategory(e.target.value); setPage(1); }} className="h-9 w-32 text-xs">
            <option value="">全部分类</option>
            {CATEGORIES.map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </Select>
          {canWrite && <Button size="sm" variant="gold" onClick={() => { setNotice(null); setUploadOpen(true); }}><UploadCloud className="h-3.5 w-3.5" />上传档案</Button>}
        </div>
      </div>

      {notice && <Notice data={notice} onClose={() => setNotice(null)} />}
      {error && <Notice data={{ kind: "error", title: error instanceof Error ? error.message : "档案列表加载失败" }} />}

      {!canWrite && <Notice data={{ kind: "warning", title: "公开访客仅能看到已审核且主动公开的档案", lines: ["私有档案、待审核档案与 OCR 文本不会通过列表、搜索或详情接口泄露。"] }} />}

      {isLoading && !data && <div className="skeleton h-48 rounded-xl" />}
      {!isLoading && data && data.items.length === 0 && (
        <EmptyState title={query || category ? "没有匹配的档案" : "尚无家族档案"} description="上传老族谱扫描件、照片、PDF 或文本资料，并标注来源与可信程度。" action={canWrite && !query ? <Button size="sm" variant="gold" onClick={() => setUploadOpen(true)}><UploadCloud className="h-3.5 w-3.5" />上传档案</Button> : undefined} />
      )}

      {data && data.items.length > 0 && (
        <Card className="overflow-hidden">
          <div className="grid gap-3 p-3 sm:grid-cols-2 xl:grid-cols-3">
            {data.items.map((d) => {
              const Icon = iconOf(d.mimeType);
              const preview = d.mimeType.startsWith("image/") ? `${downloadUrl(d.id)}?disposition=inline` : null;
              return (
                <div key={d.id} className="flex flex-col rounded-lg border border-line bg-white p-3">
                  <div className="flex items-start gap-3">
                    {preview ? (
                      <div className="h-14 w-14 shrink-0 rounded-md border border-line bg-cream bg-cover bg-center" style={{ backgroundImage: `url("${preview}")` }} aria-label="图片预览" />
                    ) : (
                      <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-md border border-line bg-cream"><Icon className="h-6 w-6 text-gold" /></div>
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium text-ink" title={d.title}>{d.title}</div>
                      <div className="mt-1 flex flex-wrap gap-1">
                        <Badge tone="navy">{DOCUMENT_CATEGORY_LABELS[d.category] ?? d.category}</Badge>
                        <Badge tone={d.reviewStatus === "APPROVED" ? "jade" : "gold"}>{REVIEW_LABELS[d.reviewStatus] ?? d.reviewStatus}</Badge>
                        {d.visibility !== "PRIVATE" && <Badge tone="neutral">{VISIBILITY_LABELS[d.visibility]}</Badge>}
                      </div>
                    </div>
                  </div>
                  <div className="mt-2 truncate text-[11px] text-graphite" title={d.fileName}>{d.fileName} · {formatBytesSafe(d.sizeBytes)} · v{d.currentVersion}</div>
                  {d.description && <p className="mt-1.5 line-clamp-2 text-[11px] leading-5 text-graphite">{d.description}</p>}
                  <div className="mt-auto flex flex-wrap items-center gap-1 border-t border-line/70 pt-2 text-[11px] text-graphite">
                    <span className="mr-auto">{formatDate(d.createdAt)}</span>
                    <Button size="icon" variant="ghost" title="查看详情" onClick={() => setDetailId(d.id)}><Eye className="h-3.5 w-3.5" /></Button>
                    <a href={downloadUrl(d.id)} download className="inline-flex h-8 w-8 items-center justify-center rounded text-ink-soft hover:bg-cream" title="下载"><Download className="h-3.5 w-3.5" /></a>
                    {canWrite && <Button size="icon" variant="ghost" title="移除" onClick={() => setDeleting(d)}><Trash2 className="h-3.5 w-3.5 text-cinnabar" /></Button>}
                  </div>
                </div>
              );
            })}
          </div>
          <Pager page={data.page} totalPages={data.totalPages} total={data.total} onPage={setPage} />
        </Card>
      )}

      <div className="flex items-start gap-2 rounded-lg border border-line bg-white/60 px-4 py-3 text-[11px] leading-5 text-graphite">
        <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-jade" />
        所有上传都会校验扩展名、MIME 与实际文件头，计算 SHA-256 校验和并生成版本记录。私有档案默认不公开；即使公开档案，也只有已审核内容对访客可见。
      </div>

      <Modal open={uploadOpen} onClose={() => setUploadOpen(false)} title="上传家族档案" wide
        description="支持 JPG / PNG / WebP / GIF / PDF / TXT / CSV / JSON / GED / MD / MP3 / WAV / MP4，单文件上限见服务端配置。"
        footer={<><Button variant="outline" size="sm" onClick={() => setUploadOpen(false)}>取消</Button><Button variant="gold" size="sm" type="submit" form="upload-form" loading={busy}>上传并校验</Button></>}>
        <form id="upload-form" onSubmit={upload} className="space-y-3">
          <Field label="选择文件 *" hint="文件名会被清洗；服务端按文件头校验真实类型，伪装扩展名的文件会被拒绝。">
            <Input type="file" accept=".jpg,.jpeg,.png,.webp,.gif,.pdf,.txt,.csv,.json,.ged,.md,.mp3,.wav,.mp4" onChange={(e) => setFile(e.target.files?.[0] ?? null)} required className="h-auto py-2 text-xs" />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="档案标题 *"><Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="例如：光绪版《陈氏族谱》卷一" required maxLength={300} /></Field>
            <Field label="分类"><Select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>{CATEGORIES.map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select></Field>
          </div>
          <Field label="可见范围" hint="新建档案默认为私有，且需管理员审核后才会对公开访客可见。">
            <Select value={form.visibility} onChange={(e) => setForm({ ...form, visibility: e.target.value })}>{Object.entries(VISIBILITY_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select>
          </Field>
          <Field label="内容说明"><Textarea rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} maxLength={10000} /></Field>
          <Field label="来源 / 引用说明" hint="例如：1998 年重修族谱卷二，第 15 页；无可靠来源请写「口述待考」。">
            <Input value={form.sourceText} onChange={(e) => setForm({ ...form, sourceText: e.target.value })} maxLength={1000} />
          </Field>
          <div className="flex items-start gap-1.5 text-[11px] leading-5 text-graphite"><Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-gold" />上传后档案状态为「待审核」；OCR 识别结果仅作人工校对参考，不会被当成已核实史实或亲属关系。</div>
        </form>
      </Modal>

      <Modal open={Boolean(deleting)} onClose={() => setDeleting(null)} title="确认移除档案"
        footer={<><Button variant="outline" size="sm" onClick={() => setDeleting(null)}>取消</Button><Button variant="danger" size="sm" loading={busy} onClick={() => void remove()}>确认移除</Button></>}>
        {deleting && <p className="text-xs text-ink-soft">即将移除：<strong>{deleting.title}</strong>。此为软删除，文件与所有版本记录仍保留在存储中。</p>}
      </Modal>

      {detailId && <DocumentDetail
        familyId={familyId} docId={detailId} canWrite={canWrite} canAdmin={canAdmin}
        onClose={() => setDetailId(null)} onChanged={() => void mutate()} downloadUrl={downloadUrl}
      />}
    </div>
  );
}

function DocumentDetail({ familyId, docId, canWrite, canAdmin, onClose, onChanged, downloadUrl }: {
  familyId: string; docId: string; canWrite: boolean; canAdmin: boolean;
  onClose: () => void; onChanged: () => void; downloadUrl: (id: string, version?: number) => string;
}) {
  const { data: doc, mutate, isLoading } = useSWR<DocDetail>(`/api/families/${familyId}/documents/${docId}`, fetcher);
  const { data: people } = useSWR<Paged<PersonOption>>(canWrite ? `/api/families/${familyId}/members?pageSize=100` : null, fetcher);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<NoticeData | null>(null);
  const [ocrText, setOcrText] = useState("");
  const [linkPersonId, setLinkPersonId] = useState("");
  const [linkType, setLinkType] = useState("MENTION");
  const [newVersion, setNewVersion] = useState<File | null>(null);
  const [changeNote, setChangeNote] = useState("");

  const action = async (fn: () => Promise<unknown>, success: string) => {
    setBusy(true); setNotice(null);
    try { await fn(); setNotice({ kind: "success", title: success }); await mutate(); onChanged(); }
    catch (err) { setNotice(parseError(err)); }
    finally { setBusy(false); }
  };

  const saveOcr = (e: React.FormEvent) => {
    e.preventDefault();
    if (!ocrText.trim()) { setNotice({ kind: "error", title: "请填写识别文本" }); return; }
    void action(() => apiRequest(`/api/families/${familyId}/documents/${docId}/ocr`, { method: "POST", body: { text: ocrText } }), "识别文本已保存，仍需人工校对");
  };

  const setReview = (reviewStatus: string) => void action(
    () => apiRequest(`/api/families/${familyId}/documents/${docId}`, { method: "PATCH", body: { reviewStatus } }),
    `审核状态已更新为${REVIEW_LABELS[reviewStatus]}`,
  );

  const addLink = (e: React.FormEvent) => {
    e.preventDefault();
    if (!linkPersonId) { setNotice({ kind: "error", title: "请选择人物" }); return; }
    void action(() => apiRequest(`/api/families/${familyId}/documents/${docId}/links`, {
      method: "POST", body: { personId: linkPersonId, linkType, verification: "UNVERIFIED" },
    }), "人物关联已建立（不会推断亲属关系）");
  };

  const removeLink = (linkId: string) => void action(
    () => apiRequest(`/api/families/${familyId}/documents/${docId}/links?linkId=${linkId}`, { method: "DELETE" }),
    "关联已移除",
  );

  const uploadVersion = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newVersion) { setNotice({ kind: "error", title: "请选择新版本文件" }); return; }
    const fd = new FormData();
    fd.append("file", newVersion);
    fd.append("changeNote", changeNote);
    void action(() => apiRequest(`/api/families/${familyId}/documents/${docId}/versions`, { method: "POST", formData: fd }), "新版本已上传");
  };

  return (
    <Modal open onClose={onClose} wide title={doc?.title || "档案详情"}
      description="版本、人物关联、OCR 文本与审核状态均在此管理。"
      footer={<><a href={downloadUrl(docId)} download><Button variant="outline" size="sm"><Download className="h-3.5 w-3.5" />下载当前版本</Button></a><Button variant="outline" size="sm" onClick={onClose}>关闭</Button></>}>
      {isLoading && <div className="skeleton h-40 rounded-lg" />}
      {notice && <div className="mb-3"><Notice data={notice} onClose={() => setNotice(null)} /></div>}
      {doc && <div className="space-y-5 text-xs">
        <div className="grid gap-2 rounded-lg border border-line bg-cream/50 p-3 sm:grid-cols-2">
          <div>文件名：{doc.fileName}</div><div>大小：{formatBytesSafe(doc.sizeBytes)}</div>
          <div>类型：{doc.mimeType}</div><div>当前版本：v{doc.currentVersion}</div>
          <div>可见范围：{VISIBILITY_LABELS[doc.visibility]}</div><div>审核状态：{REVIEW_LABELS[doc.reviewStatus] ?? doc.reviewStatus}</div>
          <div>校验和：{doc.checksum ? `${doc.checksum.slice(0, 20)}…` : "—"}</div><div>上传时间：{formatDate(doc.createdAt)}</div>
        </div>
        {doc.description && <p className="leading-6 text-ink-soft">{doc.description}</p>}
        {doc.sources.length > 0 && <div className="rounded-lg border border-line p-3"><div className="mb-1 font-medium text-ink">来源标注</div><ul className="space-y-1 text-graphite">{doc.sources.map((s) => <li key={s.id}>· {s.citationText || "未填写引用"}（{s.verification}）</li>)}</ul></div>}

        {canAdmin && <div className="flex flex-wrap items-center gap-2 rounded-lg border border-[#e5d3ae] bg-[#faf4e6] p-3">
          <span className="text-[11px] text-[#8a6a35]">管理员审核：</span>
          <Button size="sm" variant="outline" disabled={busy} onClick={() => setReview("APPROVED")}>通过</Button>
          <Button size="sm" variant="outline" disabled={busy} onClick={() => setReview("REJECTED")}>驳回</Button>
          <Button size="sm" variant="outline" disabled={busy} onClick={() => setReview("DISPUTED")}>标记存疑</Button>
        </div>}

        <div>
          <h4 className="mb-2 flex items-center gap-1.5 font-medium text-ink"><History className="h-3.5 w-3.5 text-gold" />版本记录（{doc.versions.length}）</h4>
          <ul className="space-y-1.5">
            {doc.versions.map((v) => (
              <li key={v.id} className="flex flex-wrap items-center gap-2 rounded border border-line px-2.5 py-1.5">
                <Badge tone="navy">v{v.versionNumber}</Badge>
                <span className="text-graphite">{formatBytesSafe(v.sizeBytes)} · {formatDate(v.createdAt)}</span>
                {v.changeNote && <span className="text-graphite">· {v.changeNote}</span>}
                <a href={downloadUrl(docId, v.versionNumber)} download className="ml-auto text-navy underline underline-offset-2">下载此版本</a>
              </li>
            ))}
          </ul>
          {canWrite && <form onSubmit={uploadVersion} className="mt-2 flex flex-wrap items-center gap-2">
            <Input type="file" onChange={(e) => setNewVersion(e.target.files?.[0] ?? null)} className="h-8 w-auto max-w-[190px] py-1 text-[11px]" />
            <Input value={changeNote} onChange={(e) => setChangeNote(e.target.value)} placeholder="版本变更说明" className="h-8 w-40 text-[11px]" maxLength={500} />
            <Button size="sm" variant="outline" type="submit" loading={busy}>上传新版本</Button>
          </form>}
        </div>

        <div>
          <h4 className="mb-2 flex items-center gap-1.5 font-medium text-ink"><Link2 className="h-3.5 w-3.5 text-gold" />关联人物（{doc.personLinks.length}）</h4>
          {doc.personLinks.length > 0 && <ul className="mb-2 space-y-1.5">{doc.personLinks.map((l) => (
            <li key={l.id} className="flex flex-wrap items-center gap-2 rounded border border-line px-2.5 py-1.5">
              <span className="text-ink">{l.name}</span><Badge tone="neutral">{l.linkType}</Badge><Badge tone="gold">{l.verification}</Badge>
              {canWrite && <button onClick={() => removeLink(l.id)} className="ml-auto text-[11px] text-cinnabar hover:underline">移除关联</button>}
            </li>
          ))}</ul>}
          {canWrite && <form onSubmit={addLink} className="flex flex-wrap items-center gap-2">
            <Select value={linkPersonId} onChange={(e) => setLinkPersonId(e.target.value)} className="h-8 w-44 text-[11px]"><option value="">选择人物…</option>{(people?.items ?? []).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select>
            <Select value={linkType} onChange={(e) => setLinkType(e.target.value)} className="h-8 w-32 text-[11px]"><option value="MENTION">提及</option><option value="PORTRAIT">肖像</option><option value="AUTHOR">作者</option><option value="SOURCE_SUBJECT">记载对象</option><option value="WITNESS">见证人</option><option value="OTHER">其他</option></Select>
            <Button size="sm" variant="outline" type="submit" loading={busy}>添加关联</Button>
          </form>}
        </div>

        <div>
          <h4 className="mb-2 flex items-center gap-1.5 font-medium text-ink"><ScanText className="h-3.5 w-3.5 text-gold" />OCR 识别文本（{doc.ocrStatus}）</h4>
          {doc.ocrText && <div className="max-h-32 overflow-y-auto rounded-lg border border-line bg-white p-3 leading-6 text-ink-soft whitespace-pre-wrap">{doc.ocrText}</div>}
          {canWrite && <form onSubmit={saveOcr} className="mt-2 space-y-2">
            <Textarea rows={2} value={ocrText} onChange={(e) => setOcrText(e.target.value)} placeholder="人工录入或粘贴外部 OCR 结果，保存后仍需人工校对" maxLength={200000} />
            <Button size="sm" variant="outline" type="submit" loading={busy}>保存识别文本</Button>
          </form>}
          <p className="mt-2 flex items-start gap-1.5 text-[11px] leading-5 text-graphite"><Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-gold" />识别文本只作为校对资料，不会自动创建人物、关系或世代；自动 OCR 需服务端配置外部服务。</p>
        </div>
      </div>}
    </Modal>
  );
}
