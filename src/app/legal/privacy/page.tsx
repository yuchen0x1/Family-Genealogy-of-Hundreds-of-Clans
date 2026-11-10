import Link from "next/link";
import { Card, CardBody, SectionTitle } from "@/components/ui/primitives";

export const metadata = { title: "隐私政策 · 中华寻根" };

function Clause({ n, title, children }: { n: string; title: string; children: React.ReactNode }) {
  return (
    <Card className="mt-4" id={n}><CardBody>
      <h2 className="font-serif text-lg font-semibold text-ink">{n}　{title}</h2>
      <div className="mt-3 space-y-2 text-[13px] leading-7 text-ink-soft">{children}</div>
    </CardBody></Card>
  );
}

export default function PrivacyPage() {
  return (
    <div className="paper-bg min-h-screen">
      <div className="ink-bg border-b border-navy/40">
        <div className="mx-auto max-w-4xl px-4 py-10 md:px-6">
          <div className="text-[11px] font-semibold tracking-[0.3em] text-gold">PRIVACY POLICY</div>
          <h1 className="mt-3 font-serif text-3xl font-semibold text-white">隐私政策</h1>
          <p className="mt-3 text-sm text-white/70">本说明描述平台实际实现的数据处理方式。功能变更时以最新版本为准。</p>
        </div>
      </div>
      <div className="mx-auto max-w-4xl px-4 py-10 md:px-6">
        <SectionTitle eyebrow="HOW WE HANDLE DATA" title="你的数据如何被处理" description="族谱承载家庭信息，平台按最小必要、默认私有与可撤回原则设计。" />

        <Clause n="一" title="我们收集哪些信息">
          <p>· 账号信息：邮箱、密码哈希、登录时间、失败登录次数与锁定状态。密码使用 scrypt 加盐哈希，系统不保存明文密码。</p>
          <p>· 会话信息：HttpOnly / SameSite Cookie 中的随机令牌；数据库只保存该令牌的 SHA-256 摘要，以及脱敏后的 IP 摘要、浏览器标识与到期时间。</p>
          <p>· 你主动录入的资料：昵称、姓氏、地区、简介、族谱、人物、关系、档案、帖子、评论、私信与寻亲线索。</p>
          <p>· 操作记录：关键写操作的审计日志（动作、实体、时间、脱敏 IP），以及仅包含查询词与结果数量的搜索记录。</p>
        </Clause>

        <Clause n="二" title="敏感信息的保护">
          <p>· 人物敏感字段使用 AES-256-GCM 加密后入库，解密仅在有权限的详情接口进行，列表、导出与版本快照一律不包含该字段。</p>
          <p>· 新建族谱默认「私有」；在世人物默认严格保护，前端请求公开时会自动降级为家族可见。</p>
          <p>· 档案文件写入非公开目录，不接受客户端提供的文件路径；下载前先做家族级与人物级鉴权，内联预览使用独立 CSP 沙箱。</p>
          <p>· 搜索、姓氏详情、社区帖子流与图谱接口都会在数据库查询层做权限过滤，私有族谱中的人物与家庭信息不会出现在结果中。</p>
        </Clause>

        <Clause n="三" title="Cookie 与同类技术">
          <p>仅使用一个 HttpOnly 会话 Cookie（xungen_session），用于保持登录状态；不用于广告追踪，不向第三方共享。浏览器本地可能保存界面偏好，不涉及身份信息。退出登录或注销账号会立即撤销对应会话。</p>
        </Clause>

        <Clause n="四" title="授权、查看与撤回">
          <p>可随时在「个人中心 → 资料与隐私」开启或撤回：允许同姓宗亲检索、展示姓氏、展示地区等授权，撤回后立即生效。平台接口在任何情况下都不会向其他用户返回你的邮箱。</p>
          <p>可查看并撤销登录设备、修改密码（其他设备会被强制下线），导出本人账号数据（JSON），查看自己提交的举报与通知。</p>
        </Clause>

        <Clause n="五" title="数据保存与删除">
          <p>人物、关系、族谱与档案采用软删除，删除后前端不再展示，数据库保留记录用于恢复与审计；版本快照用于误操作恢复。</p>
          <p>账号注销时：邮箱脱敏、密码置为不可登录、资料清空、隐私授权全部撤回、全部会话下线、公开帖子转私有并下架、评论内容清空、私信与通知及搜索记录删除；仅本人参与的私有族谱一并软删除。涉及其他协作者共同录入的族谱会保留，以免删除他人资料。关键操作保留不含身份信息的审计记录。</p>
        </Clause>

        <Clause n="六" title="同姓与亲属关系的边界">
          <p>平台严格区分历史姓氏资料与用户真实家族关系，区分历史人物与用户家族成员。同姓、同名、同字辈、同堂号都不会被用来自动认定血缘、合并家族或推断辈分。亲属称谓只依据已核实的关系计算；OCR 文本、导入关系、档案关联与宗亲关联申请均不产生亲属结论。</p>
        </Clause>

        <Clause n="七" title="第三方服务与外部依赖">
          <p>本地部署默认不向第三方传输个人数据。若管理员启用 S3 兼容对象存储、外部 OCR 服务或搜索引擎，相关文件与请求会在服务配置范围内处理；未配置凭证时系统会返回明确的依赖错误，不会伪造成功。启用前应由部署方评估并另行告知用户。</p>
        </Clause>

        <Clause n="八" title="联系我们">
          <p>如发现隐私风险、越权访问或希望补充行使数据权利，请通过社区「举报 / 纠错」入口提交，或联系站点管理员。管理员处理时会留下审计记录。</p>
        </Clause>

        <div className="mt-8 flex flex-wrap gap-3 text-[12px]">
          <Link href="/legal/terms" className="rounded border border-line bg-white px-3 py-2 hover:border-gold">用户协议</Link>
          <Link href="/guide#privacy" className="rounded border border-line bg-white px-3 py-2 hover:border-gold">隐私设置说明</Link>
          <Link href="/me?tab=data" className="rounded border border-line bg-white px-3 py-2 hover:border-gold">导出 / 删除我的数据</Link>
        </div>
      </div>
    </div>
  );
}
