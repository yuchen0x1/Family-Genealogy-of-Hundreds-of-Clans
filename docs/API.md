# API 文档

基址：开发环境 `http://localhost:3000/api`，生产为 `https://<域名>/api`。共 **63 个 Route Handlers**，全部为真实数据库读写。

## 1. 通用约定

### 认证
会话使用 HttpOnly + SameSite Cookie `xungen_session`；数据库只存 token 的 SHA-256 摘要。除明确标注「公开」的接口外均需登录。请求可带 `Origin`，服务端 `assertSameOrigin` 会拒绝跨站写请求（`CSRF_REJECTED`）。

### 响应格式
```jsonc
// 成功
{ "ok": true, "data": { ... } }
// 失败
{ "ok": false, "error": { "message": "...", "code": "FORBIDDEN", "details": { ... } } }
```

### 主要错误码
| 码 | HTTP | 含义 |
| --- | --- | --- |
| `VALIDATION_ERROR` | 422 | Zod 参数校验失败，`details` 为 flatten 结果 |
| `INVALID_JSON` | 400 | 请求体不是合法 JSON |
| `UNAUTHORIZED` | 401 | 未登录或会话失效 |
| `FORBIDDEN` | 403 | 无家族/人物/后台权限 |
| `NOT_FOUND` | 404 | 不存在或无权感知（私有对象一律返回 404，避免存在性泄露） |
| `CONFLICT` / `FK_CONSTRAINT` | 409 | 唯一约束冲突 / 外键约束 |
| `CSRF_REJECTED` | 403 | 跨站 Origin |
| `RATE_LIMITED` | 429 | 触发限流 |
| `ACCOUNT_LOCKED` | 423 | 连续错误登录临时锁定 |
| `MAGIC_MISMATCH` / `MIME_MISMATCH` / `UNSUPPORTED_FILE_TYPE` / `FILE_TOO_LARGE` | 400/413 | 上传校验失败 |
| `INVALID_FORMAT` / `INVALID_VERSION` | 400 | 导出格式或档案版本号非法 |
| `EXPORT_FORBIDDEN` | 403 | 非协作者导出 |
| `OCR_NOT_CONFIGURED` | 503 | 未配置外部 OCR 服务 |
| `INTERNAL_ERROR` | 500 | 未预期异常（详情仅写服务端日志） |

### 分页与限流
列表接口统一 `page` / `pageSize`，返回 `{ items, page, pageSize, total, totalPages }`。限流键按客户端来源 IP 的 HMAC 摘要分桶：`register` 8 次/小时、`login` 15 次/5 分钟、`search` 60 次/分钟。默认 `TRUST_PROXY=false`，不信任客户端伪造的 `X-Forwarded-For`；只有可信 Nginx 覆盖该头且显式开启 `TRUST_PROXY=true` 时才读取真实 IP。

## 2. 权限层级

`公开` → `登录用户` → `家族可读`（公开族谱或有协作权限）→ `家族可写`（OWNER/EDITOR）→ `家族所有者` → `内容审核员` → `管理员`。

**管理员不是超级读者**：后台只处理元数据、审核状态、账号状态与举报，不返回私有族谱人物明细、图谱、导出内容或加密敏感字段。

## 3. 路由清单

### 认证与健康
| 方法 | 路径 | 权限 | 说明 |
| --- | --- | --- | --- |
| POST | `/auth/register` | 公开 | 注册，密码 ≥8 位且含字母与数字；返回会话 |
| POST | `/auth/login` | 公开 | 登录，失败计数与临时锁定 |
| POST | `/auth/logout` | 登录 | 立即失效当前会话 |
| GET | `/auth/me` | 公开 | 当前用户、角色与权限；匿名返回 `authenticated:false` |
| GET | `/health` | 公开 | 部署探针，仅返回数据库/缓存可用性布尔值 |

### 姓氏知识库与历史寻根
| 方法 | 路径 | 权限 | 说明 |
| --- | --- | --- | --- |
| GET | `/surnames` | 公开 | 姓氏列表，支持 `q` / `category` / `letter` / `detail` / `sort` / 分页 |
| GET | `/surnames/[name]` | 公开 | 姓氏详情：起源、异体字、历史人物、迁徙、来源引用 |
| GET | `/places` | 公开 | 古今地名与别名 |
| GET | `/migrations` | 公开 | 宏观迁徙记录（按可信程度着色，传说明确标注） |
| GET | `/search` | 公开 | 统一搜索，7 个分组；结果按家族/人物权限过滤 |
| GET | `/search/suggest` | 公开 | 顶部搜索框联想（姓氏/人物/地名/家族） |

`GET /surnames` 查询参数：

| 参数 | 取值 | 说明 |
| --- | --- | --- |
| `q` | 字符串 | 汉字、带调/不带调拼音、繁体、异体字；命中 `pinyinKeys` 与模糊匹配 |
| `category` | `SINGLE` / `COMPOUND` | 单姓 / 复姓 |
| `letter` | 单个 A–Z | 按拼音首字母筛选；服务端查 `pinyinKeys` 中预写的 ASCII 首字母，因此 `安 ān`、`欧 ōu`、`欧阳 ōu yáng` 等带声调元音开头的姓氏也能被 A / O 命中 |
| `detail` | `documented` / `dictionary` | **资料范围**：`documented` 只返回带已审定史料出处（`surname_origins` 关联记录）的 38 姓；`dictionary` 只返回其余 466 条字典型条目；省略则返回全部 504 姓 |
| `sort` | `rank`（默认）/ `name` / `pinyin` | `rank` 为《百家姓》序位，非现代人口排名 |
| `page` / `pageSize` | 正整数 | `pageSize` 上限 100 |

`detail` 会参与列表缓存 key，与 `q`、`category`、`letter`、`sort`、`page`、`pageSize` 一起构成隔离键，避免不同筛选条件串用缓存。资料范围以「是否存在史料关联记录」为判据，不以 `reviewStatus` 或 `credibility` 代替，避免把审核状态误当成资料完整度。

搜索支持中文 2-gram、拼音全拼与首字母、异体字与繁体命中。查询词经 `normalizeSearchTerm` 剥离控制字符与标签形态后才用于匹配、回显和写入搜索记录，避免存储型 XSS；搜索记录只存查询词与聚合数量，不记录被权限过滤掉的私有内容。

### 族谱与人物
| 方法 | 路径 | 权限 | 说明 |
| --- | --- | --- | --- |
| GET,POST | `/families` | 登录 | 可见族谱列表 / 创建族谱（默认 PRIVATE） |
| GET,PATCH,DELETE | `/families/[id]` | 家族读/写/所有者 | 详情、设置更新、软删除 |
| GET,POST | `/families/[id]/members` | 家族读/写 | 人物列表 / 新增（敏感字段 AES-256-GCM 加密） |
| GET | `/families/[id]/members/trash` | 家族写 | 回收站 |
| GET,PATCH,DELETE | `/families/[id]/members/[memberId]` | 家族读/写 | 人物详情 / 编辑 / 软删除 |
| POST | `/families/[id]/members/[memberId]/restore` | 家族写 | 恢复人物 |
| GET,POST | `/families/[id]/relationships` | 家族读/写 | 关系列表 / 创建（写入前冲突检测） |
| GET,PATCH,DELETE | `/families/[id]/relationships/[relationId]` | 家族读/写 | 关系详情 / 核实状态 / 删除 |
| GET | `/families/[id]/graph` | 家族读 | 按需局部加载，`up/down/focusPersonId`，节点上限 200 |
| GET | `/families/[id]/kinship` | 家族读 | 亲属称谓；信息不足返回「无法确定」 |
| GET,POST | `/families/[id]/generations` | 家族读/写 | 世代与字辈查询 / 显式录入（不自动推断） |
| GET,POST | `/families/[id]/branches` | 家族读/写 | 分支列表 / 创建 |
| POST | `/families/[id]/poems` | 家族写 | 字辈派语录入 |
| GET,POST | `/families/[id]/versions` | 家族读/写 | 版本快照列表 / 手动创建（不含敏感字段） |
| POST | `/families/[id]/versions/[versionId]/restore` | 家族所有者 | 恢复版本，必须提交 `confirm:"RESTORE"` |

关系创建会拦截：自反关系、重复关系、对称关系反向写法、血缘环、两位以上生物学父母、跨家族血缘自动关联、父母年龄倒挂、同名误合并；多次婚姻给出提示而非推断。只有 `VERIFIED` 关系默认参与亲属称谓计算。

### 档案中心
| 方法 | 路径 | 权限 | 说明 |
| --- | --- | --- | --- |
| GET,POST | `/families/[id]/documents` | 家族读/写 | 档案列表 / 上传（扩展名+MIME+magic bytes+体积+文件名清洗） |
| GET,PATCH,DELETE | `/families/[id]/documents/[docId]` | 家族读/写 | 详情 / 元数据编辑 / 软删除 |
| GET | `/families/[id]/documents/[docId]/download` | 家族读（受控） | 鉴权下载；`version` 只接受正整数，绝不接收文件路径 |
| GET,POST | `/families/[id]/documents/[docId]/versions` | 家族读/写 | 版本列表 / 新增版本 |
| GET,POST,DELETE | `/families/[id]/documents/[docId]/links` | 家族读/写 | 档案与人物关联 |
| GET,POST | `/families/[id]/documents/[docId]/ocr` | 家族写 | 人工录入待校对文本 / 调用外部 OCR（未配置返回 `OCR_NOT_CONFIGURED`） |

上传文件存于 `public/` 之外，无法静态直连；下载响应带 `nosniff`、`Cache-Control: private, no-store`，内联预览额外使用 CSP `sandbox`。OCR 文本永不自动创建或核实亲属关系。

### 导入导出
| 方法 | 路径 | 权限 | 说明 |
| --- | --- | --- | --- |
| POST | `/families/[id]/export?format=...` | 家族写 | `JSON / CSV / GEDCOM551 / GEDCOM70 / SVG / PNG / PDF` |
| GET,POST | `/families/[id]/import` | 家族写 | 导入说明 / 上传预览（**不落库**） |
| GET | `/families/[id]/import/[jobId]` | 家族写 | 查看查重、缺字段、冲突报告 |
| POST | `/families/[id]/import/[jobId]/commit` | 家族写 | 用户显式确认后事务写入；支持跳过行 |

导出不含 `sensitiveDataEncrypted`；导入关系默认 `UNVERIFIED`。PNG/PDF 由 `sharp` 与 `pdf-lib` 真实生成，SVG 由布局引擎生成。

### 协作与邀请
| 方法 | 路径 | 权限 | 说明 |
| --- | --- | --- | --- |
| GET,POST | `/families/[id]/collaborators` | 家族读/所有者 | 协作者列表（非协作者不返回邮箱）/ 邀请 |
| PATCH,DELETE | `/families/[id]/collaborators/[userId]` | 家族所有者 | 调整权限 / 移除 |
| GET,POST | `/invitations/[token]` | 登录 | 查看邀请 / 接受 |

### 宗亲社区
| 方法 | 路径 | 权限 | 说明 |
| --- | --- | --- | --- |
| GET,POST | `/posts` | 公开/登录 | 帖子流（PUBLIC/FAMILY/PRIVATE 权限过滤）/ 发帖 |
| GET,PATCH,DELETE | `/posts/[id]` | 公开/作者或版主 | 详情含两级评论树 / 编辑 / 删除 |
| GET,POST | `/posts/[id]/comments` | 公开/登录 | 评论树 / 发表评论（父节点必须同帖） |
| DELETE | `/comments/[id]` | 作者或版主 | 评论软删除 |
| GET,POST | `/reports` | 登录 | 我的举报 / 提交举报或纠错 |
| GET | `/clan/search` | 登录 | 仅返回主动开启 `allowClanSearch` 的用户 |
| GET,POST | `/clan-connections` | 登录 | 分支关联申请列表 / 发起 |
| PATCH | `/clan-connections/[id]` | 参与者 | 双确认（发起方 + 被申请方），确认后不创建亲属关系 |

帖子列表把可见性条件与关键词条件组合在 `AND` 下，避免 `OR` 关键词覆盖权限表达式导致私有内容泄露。

### 私信与通知
| 方法 | 路径 | 权限 | 说明 |
| --- | --- | --- | --- |
| GET,POST | `/messages` | 登录 | 会话列表 / 发送私信（不返回邮箱） |
| GET,DELETE | `/messages/[id]` | 参与者 | 单会话 / 单侧删除 |
| GET,PATCH | `/notifications` | 登录 | 通知与未读数 / 按 ids 或 all 标记已读 |

### 用户中心
| 方法 | 路径 | 权限 | 说明 |
| --- | --- | --- | --- |
| GET,PATCH | `/me/profile` | 登录 | 资料与隐私授权（宗亲检索、可见性） |
| GET,DELETE | `/me/sessions` | 登录 | 会话列表 / 撤销指定设备 |
| POST | `/me/password` | 登录 | 改密并撤销其他设备会话 |
| GET | `/me/export` | 登录 | 个人数据导出 JSON（不含密码哈希、会话摘要、族谱人物明细） |
| POST | `/me/delete` | 登录 | 账号注销与个人信息删除策略 |

### 管理后台
| 方法 | 路径 | 权限 | 说明 |
| --- | --- | --- | --- |
| GET | `/admin/overview` | 管理员 | 聚合计数与服务状态 |
| GET,PATCH | `/admin/users` | 管理员 | 用户停权/恢复/角色调整 |
| GET,PATCH | `/admin/posts` | 审核员 | 帖子下架/恢复 |
| GET,PATCH | `/admin/reports` | 管理员 | 举报处理 |
| GET,PATCH | `/admin/sources` | 审核员 | 史料来源审核状态 |
| GET,PATCH | `/admin/surnames` | 审核员 | 姓氏资料审核状态 |
| GET | `/admin/audit-logs` | 管理员 | 审计日志（写入含 before/after 与 IP 摘要） |
| GET,PATCH | `/admin/settings` | 管理员 | 系统设置白名单；安全基线只读 |

以上后台接口均只处理元数据与状态；管理员账号同样受家族级权限约束，无法通过后台读取私有族谱人物、图谱或导出内容（已由 `smoke-admin.mjs` 验证）。

## 4. 调用示例

```bash
# 登录并保存 Cookie
curl -c cookies.txt -H 'Content-Type: application/json' -H 'Origin: http://localhost:3000' \
  -d '{"email":"demo@xungen.local","password":"Demo_Xungen_2026"}' \
  http://localhost:3000/api/auth/login

# 创建私有族谱
curl -b cookies.txt -H 'Content-Type: application/json' -H 'Origin: http://localhost:3000' \
  -d '{"name":"测试族谱","surnameText":"陈","visibility":"PRIVATE"}' \
  http://localhost:3000/api/families

# 统一搜索（拼音、繁体、异体字）
curl 'http://localhost:3000/api/search?q=li&category=surnames'
```

完整交互流程与字段约束见 `src/lib/validation.ts`，数据库字段见 `prisma/schema.prisma`。
