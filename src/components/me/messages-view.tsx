"use client";

import { useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import { ArrowLeft, Send, Trash2, MessageSquare, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader, Input, Textarea, EmptyState } from "@/components/ui/primitives";
import { Notice, parseError, formatDate, type NoticeData } from "@/components/family/shared";
import { fetcher, apiRequest, type MeResponse } from "@/lib/client";

type Conversation = {
  partnerId: string; partnerName: string; unread: number;
  last: { id: string; content: string; createdAt: string; outgoing: boolean };
};
type MessageItem = {
  id: string; senderId: string; recipientId: string; senderName: string; recipientName: string;
  content: string; readAt: string | null; createdAt: string; outgoing: boolean;
};

export function MessagesView({ initialWith }: { initialWith?: string }) {
  const [partner, setPartner] = useState(initialWith ?? "");
  const [inputId, setInputId] = useState("");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<NoticeData | null>(null);
  const { data: me } = useSWR<MeResponse>("/api/auth/me", fetcher);
  const { data: conversations, mutate: refreshConversations } = useSWR<{ items: Conversation[] }>("/api/messages?conversations=1", fetcher);
  const url = partner ? `/api/messages?with=${encodeURIComponent(partner)}&pageSize=50` : null;
  const { data: thread, isLoading, mutate: refreshThread } = useSWR<{ items: MessageItem[]; total: number }>(url, fetcher);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!partner.trim() || !text.trim()) { setNotice({ kind: "error", title: "请选择会话并填写内容" }); return; }
    setBusy(true);
    try {
      await apiRequest("/api/messages", { method: "POST", body: { recipientId: partner.trim(), content: text.trim() } });
      setText("");
      await Promise.all([refreshThread(), refreshConversations()]);
    } catch (err) { setNotice(parseError(err)); }
    finally { setBusy(false); }
  }

  async function remove(id: string) {
    try {
      await apiRequest(`/api/messages/${id}`, { method: "DELETE" });
      await Promise.all([refreshThread(), refreshConversations()]);
    } catch (err) { setNotice(parseError(err)); }
  }

  if (me && !me.authenticated) {
    return <EmptyState title="请先登录" description="私信功能需要登录后使用。" action={<Link href="/login"><Button size="sm" variant="gold">前往登录</Button></Link>} />;
  }

  const current = conversations?.items.find((c) => c.partnerId === partner);

  return (
    <div className="grid gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
      <Card className="h-fit">
        <CardHeader><h2 className="flex items-center gap-2 font-serif text-sm font-semibold text-ink"><MessageSquare className="h-4 w-4 text-gold" />会话</h2></CardHeader>
        <CardBody className="space-y-2">
          <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); if (inputId.trim()) { setPartner(inputId.trim()); setInputId(""); } }}>
            <Input value={inputId} onChange={(e) => setInputId(e.target.value)} placeholder="输入对方用户 ID 开启会话" aria-label="对方用户 ID" />
            <Button type="submit" size="sm" variant="outline">开始</Button>
          </form>
          <p className="text-[11px] leading-5 text-graphite">可从「宗亲检索」结果点击「发私信」自动带入对方 ID。</p>
          {(conversations?.items ?? []).length === 0 && <p className="py-4 text-center text-[12px] text-graphite">暂无会话。</p>}
          {conversations?.items.map((c) => (
            <button key={c.partnerId} type="button" onClick={() => setPartner(c.partnerId)}
              className={`w-full rounded-lg border p-2.5 text-left transition-colors ${partner === c.partnerId ? "border-gold bg-[#fbf7ee]" : "border-line hover:border-gold/60"}`}>
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-[13px] font-medium text-ink">{c.partnerName}</span>
                {c.unread > 0 && <span className="rounded-full bg-cinnabar px-1.5 py-0.5 text-[10px] text-white">{c.unread}</span>}
              </div>
              <div className="mt-1 truncate text-[11px] text-graphite">{c.last.outgoing ? "我：" : ""}{c.last.content}</div>
              <div className="mt-1 text-[10px] text-graphite">{formatDate(c.last.createdAt)}</div>
            </button>
          ))}
        </CardBody>
      </Card>

      <Card className="flex min-h-[520px] flex-col">
        <CardHeader>
          <div className="flex items-center justify-between gap-2">
            <Link href="/me?tab=notices" className="inline-flex items-center gap-1 text-[12px] text-graphite hover:text-gold"><ArrowLeft className="h-3.5 w-3.5" />返回个人中心</Link>
            <span className="text-[12px] text-ink">{current?.partnerName ?? (partner ? "会话" : "未选择会话")}</span>
          </div>
        </CardHeader>
        <CardBody className="flex flex-1 flex-col">
          {notice && <div className="mb-3"><Notice data={notice} onClose={() => setNotice(null)} /></div>}
          {!partner && <EmptyState title="选择一个会话" description="从左侧选择已有会话，或输入对方用户 ID 开启新会话。" />}
          {partner && isLoading && <div className="flex items-center gap-2 py-8 text-[12px] text-graphite"><Loader2 className="h-4 w-4 animate-spin" />正在读取消息…</div>}
          {partner && !isLoading && (
            <div className="flex-1 space-y-3 overflow-y-auto pb-4">
              {(thread?.items ?? []).length === 0 && <p className="py-8 text-center text-[12px] text-graphite">还没有消息，发送第一条吧。</p>}
              {(thread?.items ?? []).slice().reverse().map((m) => (
                <div key={m.id} className={`flex ${m.outgoing ? "justify-end" : "justify-start"}`}>
                  <div className={`max-w-[80%] rounded-lg border p-3 ${m.outgoing ? "border-navy/20 bg-navy/5" : "border-line bg-cream/70"}`}>
                    <div className="mb-1 flex items-center gap-2 text-[11px] text-graphite">
                      <span>{m.outgoing ? "我" : m.senderName}</span><span>{formatDate(m.createdAt)}</span>
                      {m.outgoing && m.readAt && <span>已读</span>}
                    </div>
                    <p className="whitespace-pre-wrap text-[13px] leading-6 text-ink-soft">{m.content}</p>
                    <div className="mt-1 text-right">
                      <button type="button" onClick={() => void remove(m.id)} className="text-[10px] text-graphite hover:text-cinnabar" title="删除这条消息"><Trash2 className="inline h-3 w-3" /> 删除</button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
          {partner && (
            <form onSubmit={(e) => void send(e)} className="mt-auto border-t border-line pt-3">
              <Textarea value={text} onChange={(e) => setText(e.target.value)} rows={2} maxLength={5000} placeholder="写点什么…（请勿发送他人隐私信息）" />
              <div className="mt-2 flex items-center justify-between gap-2">
                <span className="text-[11px] text-graphite">私信仅收发双方可见；平台不会据此建立亲属关系。</span>
                <Button type="submit" size="sm" variant="gold" loading={busy}><Send className="h-3.5 w-3.5" />发送</Button>
              </div>
            </form>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
