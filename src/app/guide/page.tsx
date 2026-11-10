import Link from "next/link";
import { BookOpen, Network, FileArchive, ShieldCheck, Scale, MapPin, Users } from "lucide-react";
import { Card, CardBody, SectionTitle } from "@/components/ui/primitives";

export const metadata = {
  title: "使用说明 · 中华寻根",
  description: "姓氏查询、历史寻根、族谱创建、图谱、档案、导入导出与隐私授权的完整使用说明。",
};

const NAV = [
  { id: "surnames", label: "姓氏与寻根" },
  { id: "family", label: "创建族谱" },
  { id: "graph", label: "关系图谱" },
  { id: "gedcom", label: "导入与导出" },
  { id: "archive", label: "家族档案" },
  { id: "clan", label: "宗亲关联" },
  { id: "privacy", label: "隐私与授权" },
  { id: "sources", label: "资料来源说明" },
];

function H({ id, children }: { id?: string; children: React.ReactNode }) {
  return <h2 id={id} className="mt-8 scroll-mt-24 font-serif text-xl font-semibold text-ink">{children}</h2>;
}
function P({ children }: { children: React.ReactNode }) {
  return <p className="mt-3 text-[13px] leading-7 text-ink-soft">{children}</p>;
}

export default function GuidePage() {
  return (
    <div className="paper-bg min-h-screen">
      <div className="ink-bg border-b border-navy/40">
        <div className="mx-auto max-w-6xl px-4 py-10 md:px-6">
          <div className="text-[11px] font-semibold tracking-[0.3em] text-gold">USER GUIDE</div>
          <h1 className="mt-3 font-serif text-3xl font-semibold text-white md:text-4xl">使用说明</h1>
          <p className="mt-3 max-w-2xl text-sm leading-7 text-white/70">从姓氏知识库到个人族谱，从史料引用到隐私保护，了解平台每一项功能的边界与使用方式。</p>
        </div>
      </div>

      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 md:grid-cols-[210px_minmax(0,1fr)] md:px-6">
        <aside className="h-fit rounded-xl border border-line bg-white p-4 lg:sticky lg:top-24">
          <div className="mb-3 text-[11px] font-semibold tracking-wider text-gold">目录</div>
          <nav className="space-y-1">
            {NAV.map((n) => <a key={n.id} href={`#${n.id}`} className="block rounded px-2 py-1.5 text-[12px] text-ink-soft hover:bg-cream hover:text-gold">{n.label}</a>)}
          </nav>
        </aside>

        <article className="min-w-0">
          <SectionTitle eyebrow="HOW IT WORKS" title="开始使用" description="平台把「可核验的历史姓氏知识」与「用户自行录入的家族关系」分开存储、分开展示，二者永不自动合并。" />

          <Card><CardBody>
            <div className="flex items-start gap-3"><BookOpen className="mt-0.5 h-5 w-5 shrink-0 text-gold" /><div>
              <H id="surnames">姓氏与历史寻根</H>
              <P>在「中华百家姓」中可按中文、拼音、首字母、繁体字、异体字检索单姓与复姓，查看起源、得姓历史、郡望堂号、历史人物、迁徙与古籍出处。每条史料都标注资料名称、版本、卷次页码、原始引用、录入人、审核状态与可信程度。</P>
              <P>「历史寻根」展示姓氏发源地、古今地名对照与有文献支撑的宏观迁徙路线。没有来源的迁徙不会被绘制成路线；传说性内容明确标注为传说，待审核内容不作为定论展示。</P>
              <P><Link href="/surnames" className="text-gold hover:underline">前往姓氏库</Link> · <Link href="/roots" className="text-gold hover:underline">前往历史寻根</Link></P>
            </div></div>
          </CardBody></Card>

          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <Card><CardBody>
              <Network className="h-5 w-5 text-gold" />
              <H id="family">创建与维护族谱</H>
              <P>注册登录后在「族谱中心 → 创建族谱」建立自己的家族空间。新建族谱默认为私有，创建者自动成为所有者。可添加人物（支持多次婚姻、收养、过继、父母信息缺失、不确定关系、同名人物），逐条录入并核实关系。</P>
              <P>系统不会因同姓、同名或字辈相同自动合并人物或推断辈分；字辈与世代必须由人工确认。每次人物与关系变更都会生成版本快照，可查看并恢复。</P>
            </CardBody></Card>
            <Card><CardBody>
              <MapPin className="h-5 w-5 text-gold" />
              <H id="graph">四种关系图谱</H>
              <P>传统纵向家族树、横向世系图、人物关系网络图与家族历史时间轴。图谱按需加载焦点人物上下若干代，支持缩放、拖动、节点搜索、分支折叠、祖先/后代展开与关系路径高亮，不会一次把所有节点塞进浏览器。</P>
              <P>亲属称谓只依据「已核实」的关系计算，并区分血缘、婚姻、收养与过继；信息不足时返回「无法确定」，不会编造结论。</P>
            </CardBody></Card>
          </div>

          <Card className="mt-4"><CardBody>
            <div className="flex items-start gap-3"><FileArchive className="mt-0.5 h-5 w-5 shrink-0 text-gold" /><div>
              <H id="gedcom">导入与导出</H>
              <P>在族谱工作区的「导入导出」面板可导出 JSON、CSV、GEDCOM 5.5.1、GEDCOM 7.0、SVG、PNG 与 PDF。导出内容不含人物加密敏感字段，只有家族协作者可以导出。</P>
              <P>导入支持 GEDCOM、CSV、JSON。系统会先生成预览报告：统计人物与关系、列出缺失字段、文件内重复、与现有人物疑似匹配、悬空引用与冲突项。<strong>预览阶段不写入任何数据</strong>，需人工查看报告、勾选要跳过的行，并显式确认后才会落库。导入的关系一律标记为「未核实」，不参与亲属称谓计算。</P>
            </div></div>
          </CardBody></Card>

          <Card className="mt-4"><CardBody>
            <div className="flex items-start gap-3"><ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-gold" /><div>
              <H id="archive">家族档案与文献</H>
              <P>可上传老族谱、照片、PDF、文本、音频与视频。上传会校验扩展名、MIME 声明与文件头魔数，文件写入非公开目录，只能通过带鉴权的下载接口访问；每次上传生成校验和与版本记录，可下载历史版本。</P>
              <P>OCR 文本可由人工录入或由已配置的外部服务识别；未配置服务时接口明确返回依赖错误，绝不伪造识别结果。识别文本一律标记为待人工校对，不会自动创建或核实任何亲属关系。档案可关联人物，但关联只是引用，不构成血缘结论。</P>
            </div></div>
          </CardBody></Card>

          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <Card><CardBody>
              <Users className="h-5 w-5 text-gold" />
              <H id="clan">宗亲交流与关联</H>
              <P>社区提供寻亲大厅、讨论、动态、活动、公告与史料纠错；可发私信、收通知、提交举报与纠错、检索主动公开的同姓宗亲。</P>
              <P><strong>同姓不代表同宗。</strong>分支关联申请必须由发起方与被申请方双方确认，并附证据说明；确认后平台仍不会自动创建任何亲属关系，谱系需人工录入并逐条核实。</P>
            </CardBody></Card>
            <Card><CardBody>
              <Scale className="h-5 w-5 text-gold" />
              <H id="privacy">隐私与授权</H>
              <P>私有族谱默认不公开；在世人物默认严格保护，即使前端要求公开也会自动降级。搜索接口会过滤无权访问的族谱与人物，绝不泄露私密家庭信息。</P>
              <P>在「个人中心 → 资料与隐私」可随时开启或撤回同姓检索、姓氏与地区展示等授权，撤回立即生效。可导出个人数据、查看与撤销登录设备，或注销账号并删除个人信息。</P>
              <P><Link href="/legal/privacy" className="text-gold hover:underline">阅读完整隐私政策</Link></P>
            </CardBody></Card>
          </div>

          <Card className="mt-4 border-gold/40 bg-[#fbf7ee]"><CardBody>
            <H id="sources">资料来源说明</H>
            <P>平台内置的基础史料为可核验的公开典籍条目（如《元和姓纂》《通志·氏族略》《史记》《新唐书·宰相世系表》《百家姓》等），每条记录保留出处与可信程度。平台不会凭空生成历史资料、人物世系或迁徙路线。</P>
            <P>带「【演示】」标识的族谱、人物、社区帖子与档案均为功能演示数据，不代表真实家族关系或史料结论。真实历史数据的规模化录入与授权属于外部依赖，需取得合法授权后由编辑人员逐条录入、审核并标注来源。</P>
            <P>用户自行发布的寻亲线索、讨论与上传资料由发布者负责；平台不对其真实性、血缘结论或版权作担保，发现侵权可通过举报入口提交。</P>
          </CardBody></Card>

          <div className="mt-8 flex flex-wrap gap-3 text-[12px]">
            <Link href="/families/new" className="rounded border border-line bg-white px-3 py-2 hover:border-gold">创建族谱</Link>
            <Link href="/community" className="rounded border border-line bg-white px-3 py-2 hover:border-gold">前往社区</Link>
            <Link href="/me" className="rounded border border-line bg-white px-3 py-2 hover:border-gold">个人中心</Link>
            <Link href="/legal/terms" className="rounded border border-line bg-white px-3 py-2 hover:border-gold">用户协议</Link>
          </div>
        </article>
      </div>
    </div>
  );
}
