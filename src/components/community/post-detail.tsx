"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import { ArrowLeft, Flag, Pencil, Trash2, MessageSquare, Send, Eye, Users, Lock, Loader2, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge, Card, CardBody, Input, Select, Textarea, EmptyState } from "@/components/ui/primitives";
import { Field, Modal, Notice, parseError, formatDate, type NoticeData } from "@/components/family/shared";
import { fetcher, apiRequest, type MeResponse } from "@/lib/client";

type Author = { id: string; displayName: string; surname: string | null; location: string | null };
type CommentItem = {
  id: string; postId: string; parentId: string | null; content: string; status: string;
  createdAt: string; author: Author; canDelete: boolean;
  children: CommentItem[];
};
type PostDetail = {
  id: string; title: string; content: string; type: string; typeLabel: string;
  tags: string[]; clues: Record<string, unknown>; visibility: string; status: string;
  viewCount: number; createdAt: string; updatedAt: string;
  familyId: string | null; familyName: string | null; surnameId: string | null; surnameName: string | null;
  author: Author; commentCount: number; canEdit: boolean; canModerate: boolean;
  comments: CommentItem[];
};

const REASONS = ["内容不实", "侵犯隐私", "骚扰或辱骂", "广告或垃圾信息", "史料来源存疑", "其他"];

export function PostDetailView({ postId }: { postId: string }) {
  const router = useRouter();
  const { data: me } = useSWR<MeResponse>("/api/auth/me", fetcher);
  const { data, error, isLoading, mutate } = useSWR<PostDetail>(`/api/posts/${postId}`, fetcher);
  const [notice, setNotice] = useState<NoticeData | null>(null);
  const [comment, setComment] = useState("");
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [edit, setEdit] = useState({ title: "", content: "", visibility: "PUBLIC" });
  const [report, setReport] = useState({ reason: REASONS[0], detail: "" });

  async function submitComment(parentId?: string) {
    if (!comment.trim()) { setNotice({ kind: "error", title: "请填写评论内容" }); return; }
    setBusy(true);
    try {
      await apiRequest(`/api/posts/${postId}/comments`, {
        method: "POST", body: { content: comment.trim(), ...(parentId ? { parentId } : {}) },
      });
      setComment(""); setReplyTo(null);
      await mutate();
    } catch (err) { setNotice(parseError(err)); }
    finally { setBusy(false); }
  }

  async function removeComment(id: string) {
    try {
      await apiRequest(`/api/comments/${id}`, { method: "DELETE" });
      await mutate();
    } catch (err) { setNotice(parseError(err)); }
  }

  function openEdit() {
    if (!data) return;
    setEdit({ title: data.title, content: data.content, visibility: data.visibility });
    setEditOpen(true);
  }

  async function saveEdit() {
    setBusy(true);
    try {
      await apiRequest(`/api/posts/${postId}`, { method: "PATCH", body: edit });
      setEditOpen(false); await mutate();
      setNotice({ kind: "success", title: "内容已更新" });
    } catch (err) { setNotice(parseError(err)); }
    finally { setBusy(false); }
  }

  async function removePost() {
    setBusy(true);
    try {
      await apiRequest(`/api/posts/${postId}`, { method: "DELETE" });
      router.push("/community");
    } catch (err) { setNotice(parseError(err)); setBusy(false); }
  }

  async function submitReport() {
    const reason = `${report.reason}${report.detail.trim() ? `：${report.detail.trim()}` : ""}`;
    setBusy(true);
    try {
      const result = await apiRequest<{ notice: string }>("/api/reports", {
        method: "POST", body: { targetType: "POST", targetId: postId, reason },
      });
      setReportOpen(false);
      setNotice({ kind: "success", title: "举报已提交", lines: [result.notice] });
    } catch (err) { setNotice(parseError(err)); }
    finally { setBusy(false); }
  }

  if (isLoading) return <div className="flex items-center gap-2 rounded-xl border border-line bg-white p-8 text-sm text-graphite"><Loader2 className="h-4 w-4 animate-spin" />正在读取内容…</div>;
  if (error || !data) return <EmptyState title="内容不存在或无权查看" description="该内容可能已被删除，或仅对作者与家族协作者可见。" action={<Link href="/community"><Button size="sm" variant="outline">返回社区</Button></Link>} />;

  const clues = Object.entries(data.clues ?? {}).filter(([, v]) => v !== null && v !== "" && v !== undefined);
  const isMine = data.canEdit;

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_280px]">
      <div className="min-w-0 space-y-4">
        <Link href="/community" className="inline-flex items-center gap-1.5 text-[12px] text-graphite hover:text-gold"><ArrowLeft className="h-3.5 w-3.5" />返回社区</Link>
        {notice && <Notice data={notice} onClose={() => setNotice(null)} />}

        <Card>
          <CardBody className="p-6">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <Badge tone={data.type === "SEEK_RELATIVE" ? "red" : "navy"}>{data.typeLabel}</Badge>
              {data.surnameName && <span className="text-[11px] text-graphite">{data.surnameName}姓</span>}
              <span className="inline-flex items-center gap-1 text-[11px] text-graphite">
                {data.visibility === "PUBLIC" ? <Eye className="h-3 w-3" /> : data.visibility === "FAMILY" ? <Users className="h-3 w-3" /> : <Lock className="h-3 w-3" />}
                {data.visibility === "PUBLIC" ? "公开" : data.visibility === "FAMILY" ? "家族可见" : "仅自己"}
              </span>
              {data.status !== "PUBLISHED" && <Badge tone="neutral">{data.status === "DRAFT" ? "草稿" : "已下架"}</Badge>}
            </div>
            <h1 className="font-serif text-2xl font-semibold leading-snug text-ink md:text-3xl">{data.title}</h1>
            <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-graphite">
              <span>{data.author.displayName}</span>
              <span>{formatDate(data.createdAt)}</span>
              <span className="inline-flex items-center gap-1"><Eye className="h-3 w-3" />{data.viewCount}</span>
              <span className="inline-flex items-center gap-1"><MessageSquare className="h-3 w-3" />{data.commentCount}</span>
            </div>
            <div className="gold-rule my-5" />
            <div className="whitespace-pre-wrap text-[14px] leading-8 text-ink-soft">{data.content}</div>
            {clues.length > 0 && (
              <div className="mt-5 rounded-lg border border-line bg-cream/60 p-4">
                <div className="mb-2 text-[11px] font-semibold tracking-wide text-ink">寻亲线索</div>
                <div className="grid gap-2 sm:grid-cols-2">
                  {clues.map(([k, v]) => (
                    <div key={k} className="text-[12px] text-ink-soft">
                      <span className="text-graphite">{k === "ancestralHome" ? "祖籍" : k === "generationPoem" ? "字辈" : k === "surname" ? "姓氏" : k}：</span>{String(v)}
                    </div>
                  ))}
                </div>
              </div>
            )}
            {data.tags?.length > 0 && (
              <div className="mt-5 flex flex-wrap gap-2">{data.tags.map((t) => <span key={t} className="rounded bg-cream px-2 py-1 text-[11px] text-graphite">#{t}</span>)}</div>
            )}
            <div className="mt-6 flex flex-wrap gap-2 border-t border-line pt-4">
              {me?.authenticated && data.author.id !== me.user?.id && (
                <Link href={`/me/messages?with=${data.author.id}`}><Button size="sm" variant="outline"><Send className="h-3.5 w-3.5" />私信作者</Button></Link>
              )}
              {me?.authenticated && <Button size="sm" variant="ghost" onClick={() => setReportOpen(true)}><Flag className="h-3.5 w-3.5" />举报 / 纠错</Button>}
              {(isMine || data.canModerate) && <Button size="sm" variant="outline" onClick={openEdit}><Pencil className="h-3.5 w-3.5" />编辑</Button>}
              {(isMine || data.canModerate) && <Button size="sm" variant="ghost" onClick={() => setDeleteOpen(true)}><Trash2 className="h-3.5 w-3.5" />删除</Button>}
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardBody className="p-5">
            <h2 className="mb-4 font-serif text-base font-semibold text-ink">评论与回复（{data.commentCount}）</h2>
            {me?.authenticated ? (
              <div className="mb-5 rounded-lg border border-line bg-cream/40 p-3">
                <Textarea value={comment} onChange={(e) => setComment(e.target.value)} rows={3} placeholder={replyTo ? "写下你的回复…" : "写下你的看法或线索（请勿公布他人隐私信息）"} />
                <div className="mt-2 flex items-center justify-between gap-2">
                  <span className="text-[11px] text-graphite">{replyTo ? "正在回复一条评论" : "评论发布后作者会收到站内通知"}</span>
                  <div className="flex gap-2">
                    {replyTo && <Button size="sm" variant="ghost" onClick={() => setReplyTo(null)}>取消回复</Button>}
                    <Button size="sm" variant="gold" loading={busy} onClick={() => void submitComment(replyTo ?? undefined)}>发表</Button>
                  </div>
                </div>
              </div>
            ) : (
              <p className="mb-5 rounded-lg border border-line bg-cream/40 p-3 text-[12px] text-graphite"><Link href="/login" className="text-gold underline">登录</Link>后可参与讨论。</p>
            )}

            {data.comments.length === 0 && <p className="py-6 text-center text-[12px] text-graphite">还没有评论。</p>}
            <div className="space-y-4">
              {data.comments.map((c) => (
                <div key={c.id} className="rounded-lg border border-line p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="text-[12px] font-medium text-ink">{c.author.displayName}</span>
                      <span className="text-[11px] text-graphite">{formatDate(c.createdAt)}</span>
                    </div>
                    <div className="flex gap-1">
                      {me?.authenticated && <button type="button" onClick={() => { setReplyTo(c.id); window.scrollTo({ top: 0, behavior: "smooth" }); }} className="text-[11px] text-gold hover:underline">回复</button>}
                      {c.canDelete && <button type="button" onClick={() => void removeComment(c.id)} className="text-[11px] text-graphite hover:text-cinnabar">删除</button>}
                    </div>
                  </div>
                  <p className="mt-2 whitespace-pre-wrap text-[13px] leading-6 text-ink-soft">{c.content}</p>
                  {c.children?.length > 0 && (
                    <div className="mt-3 space-y-2 border-l-2 border-line pl-3">
                      {c.children.map((r) => (
                        <div key={r.id}>
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2"><span className="text-[12px] font-medium text-ink">{r.author.displayName}</span><span className="text-[11px] text-graphite">{formatDate(r.createdAt)}</span></div>
                            {r.canDelete && <button type="button" onClick={() => void removeComment(r.id)} className="text-[11px] text-graphite hover:text-cinnabar">删除</button>}
                          </div>
                          <p className="mt-1 whitespace-pre-wrap text-[12px] leading-6 text-ink-soft">{r.content}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </CardBody>
        </Card>
      </div>

      <aside className="space-y-4">
        <Card>
          <CardBody>
            <div className="mb-2 text-[11px] tracking-[0.2em] text-gold">ABOUT THE AUTHOR</div>
            <div className="font-serif text-base text-ink">{data.author.displayName}</div>
            {data.author.surname && <div className="mt-1 text-[12px] text-graphite">{data.author.surname}姓</div>}
            {data.author.location && <div className="mt-1 text-[12px] text-graphite">{data.author.location}</div>}
            <p className="mt-3 text-[11px] leading-5 text-graphite">作者资料依其隐私设置展示；平台不公开邮箱、真实姓名等身份信息。</p>
          </CardBody>
        </Card>
        <Card className="border-gold/40 bg-[#fbf7ee]">
          <CardBody>
            <div className="mb-2 flex items-center gap-2 font-serif text-sm font-semibold text-ink"><ShieldCheck className="h-4 w-4 text-gold" />阅读提示</div>
            <ul className="space-y-1.5 text-[11px] leading-5 text-graphite">
              <li>· 用户发布的寻亲线索未经平台核实。</li>
              <li>· 同姓、同字辈、同堂号均不能证明血缘关系。</li>
              <li>· 建立分支关联须双方确认并附证据说明。</li>
              <li>· 发现侵权或虚假信息，请使用举报入口。</li>
            </ul>
          </CardBody>
        </Card>
      </aside>

      <Modal open={editOpen} onClose={() => setEditOpen(false)} title="编辑内容" description="修改后立即生效；状态变更仅审核人员可操作。" wide
        footer={<><Button size="sm" variant="outline" onClick={() => setEditOpen(false)}>取消</Button><Button size="sm" variant="gold" loading={busy} onClick={() => void saveEdit()}>保存修改</Button></>}>
        <div className="space-y-4">
          <Field label="标题"><Input value={edit.title} onChange={(e) => setEdit({ ...edit, title: e.target.value })} /></Field>
          <Field label="正文"><Textarea rows={8} value={edit.content} onChange={(e) => setEdit({ ...edit, content: e.target.value })} /></Field>
          <Field label="可见性"><Select value={edit.visibility} onChange={(e) => setEdit({ ...edit, visibility: e.target.value })}><option value="PUBLIC">公开</option><option value="FAMILY">家族可见</option><option value="PRIVATE">仅自己</option></Select></Field>
        </div>
      </Modal>

      <Modal open={deleteOpen} onClose={() => setDeleteOpen(false)} title="删除内容" description="删除为软删除，数据库保留记录可供审计；前端不再展示。"
        footer={<><Button size="sm" variant="outline" onClick={() => setDeleteOpen(false)}>取消</Button><Button size="sm" variant="danger" loading={busy} onClick={() => void removePost()}>确认删除</Button></>}>
        <p className="text-sm text-ink-soft">确定删除「{data.title}」吗？此操作不会删除其他用户已发布的评论内容。</p>
      </Modal>

      <Modal open={reportOpen} onClose={() => setReportOpen(false)} title="举报 / 内容纠错" description="举报由内容审核人员处理，不会自动删除内容或改变史料结论。"
        footer={<><Button size="sm" variant="outline" onClick={() => setReportOpen(false)}>取消</Button><Button size="sm" variant="danger" loading={busy} onClick={() => void submitReport()}>提交举报</Button></>}>
        <div className="space-y-4">
          <Field label="原因"><Select value={report.reason} onChange={(e) => setReport({ ...report, reason: e.target.value })}>{REASONS.map((r) => <option key={r} value={r}>{r}</option>)}</Select></Field>
          <Field label="补充说明" hint="史料纠错请尽量注明出处（书名、卷次、页码或链接）"><Textarea rows={4} value={report.detail} onChange={(e) => setReport({ ...report, detail: e.target.value })} placeholder="可选" /></Field>
        </div>
      </Modal>
    </div>
  );
}
