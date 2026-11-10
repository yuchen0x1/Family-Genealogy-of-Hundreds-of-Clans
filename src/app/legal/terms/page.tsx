import Link from "next/link";
import { Card, CardBody, SectionTitle } from "@/components/ui/primitives";

export const metadata = { title: "用户协议 · 中华寻根" };

function Clause({ n, title, children }: { n: string; title: string; children: React.ReactNode }) {
  return (
    <Card className="mt-4"><CardBody>
      <h2 className="font-serif text-lg font-semibold text-ink">{n}　{title}</h2>
      <div className="mt-3 space-y-2 text-[13px] leading-7 text-ink-soft">{children}</div>
    </CardBody></Card>
  );
}

export default function TermsPage() {
  return (
    <div className="paper-bg min-h-screen">
      <div className="ink-bg border-b border-navy/40">
        <div className="mx-auto max-w-4xl px-4 py-10 md:px-6">
          <div className="text-[11px] font-semibold tracking-[0.3em] text-gold">TERMS OF SERVICE</div>
          <h1 className="mt-3 font-serif text-3xl font-semibold text-white">用户协议</h1>
          <p className="mt-3 text-sm text-white/70">注册即表示你已阅读并同意本协议。平台以资料严谨与家庭隐私为优先。</p>
        </div>
      </div>
      <div className="mx-auto max-w-4xl px-4 py-10 md:px-6">
        <SectionTitle eyebrow="TERMS" title="使用规则与责任边界" />

        <Clause n="一" title="账号">
          <p>你应使用可接收邮件的邮箱注册，并妥善保管密码。平台采用密码哈希、登录失败锁定、会话撤销与操作审计保护账号安全。请勿出借账号；发现异常登录可在个人中心撤销全部会话并修改密码。</p>
        </Clause>

        <Clause n="二" title="你发布与上传的内容">
          <p>你对自己录入的族谱、人物、档案、寻亲线索、帖子与评论负责，应确保已取得涉及人物（尤其在世者）与其他权利人的同意，且不侵犯他人隐私、名誉、著作权或个人信息权益。</p>
          <p>禁止上传恶意文件、他人身份证件与联系方式、未经授权的私密家族资料，禁止发布骚扰、歧视、虚假史料或违法信息。平台可依举报对内容下架，并保留审计记录。</p>
        </Clause>

        <Clause n="三" title="历史资料与可信程度">
          <p>平台内置史料条目标注出处、版本、卷次页码、审核状态与可信程度（有文献记载 / 传说 / 推断 / 未核实）。带「【演示】」标识的内容是功能演示数据，不代表真实家族关系或历史结论。</p>
          <p>用户提交的史料纠错需附出处，经审核前不作为定论展示。平台不凭空生成历史资料、人物世系或迁徙路线；规模化真实史料的录入需另行取得合法授权。</p>
        </Clause>

        <Clause n="四" title="同姓不等于同宗">
          <p>平台严格区分历史姓氏资料与用户真实家族关系，区分历史人物与用户家族成员。系统不会因姓氏相同、名字相同、字辈相同或堂号相同而自动认定血缘、合并家族或推断辈分。</p>
          <p>分支关联申请必须由双方确认并附证据说明；确认仅表示双方同意共同考证，不构成亲属关系结论。谱系关系需人工录入并逐条核实，未核实的关系不参与亲属称谓计算。</p>
        </Clause>

        <Clause n="五" title="导入、导出与 OCR">
          <p>导入前系统会生成预览与查重、冲突、缺失字段报告，需你显式确认后才写入；导入关系默认「未核实」。导出文件由你自行保管，请勿公开传播含他人信息的导出内容。</p>
          <p>OCR 识别文本（人工录入或外部服务）仅供人工校对，绝不自动创建或核实亲属关系。未配置外部 OCR 服务时平台会明确提示依赖，不会伪造识别结果。</p>
        </Clause>

        <Clause n="六" title="隐私与数据权利">
          <p>私有族谱默认不公开，在世人物默认严格保护。你可随时查看、导出本人数据，撤回隐私授权，或注销账号并删除个人信息。具体处理方式见<Link href="/legal/privacy" className="text-gold hover:underline">隐私政策</Link>。</p>
        </Clause>

        <Clause n="七" title="服务变更与免责">
          <p>平台会持续改进功能与安全策略，可能影响界面与接口；重大变更会尽量通过站内公告说明。因不可抗力、网络故障、第三方服务不可用或你自身操作失误造成的数据问题，平台在合理范围内协助恢复，但不承担超出技术能力范围的责任。</p>
          <p>用户发布的寻亲线索、讨论与上传资料由发布者负责，平台不对真实性、血缘结论或版权作担保。</p>
        </Clause>

        <Clause n="八" title="协议更新">
          <p>协议更新后在本页发布。继续使用平台视为接受更新后的条款；若不同意，可停止使用并注销账号。</p>
        </Clause>

        <div className="mt-8 flex flex-wrap gap-3 text-[12px]">
          <Link href="/legal/privacy" className="rounded border border-line bg-white px-3 py-2 hover:border-gold">隐私政策</Link>
          <Link href="/guide" className="rounded border border-line bg-white px-3 py-2 hover:border-gold">使用说明</Link>
        </div>
      </div>
    </div>
  );
}
