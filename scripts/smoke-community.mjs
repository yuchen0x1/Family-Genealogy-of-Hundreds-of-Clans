/**
 * 阶段 9 端到端冒烟测试：宗亲社区 + 用户中心 + 说明/法务页面。
 * 运行： node scripts/smoke-community.mjs  （需站点与数据库已启动）
 *
 * 覆盖：页面可达 → 帖子可见性与关键词检索不越权 → 评论树与举报
 *       → 私信收发/未读/越权 → 通知 → 同姓宗亲检索授权 → 关联双确认
 *       → 资料隐私/改密/会话/数据导出 → 账号注销与信息删除
 */
const BASE = process.env.SMOKE_BASE_URL || "http://localhost:3000";
const jars = { a: "", b: "", c: "" };
let passed = 0;
let failed = 0;

async function request(method, path, opts = {}) {
  const { json, as = "a", raw } = opts;
  const headers = { Origin: BASE };
  const cookie = as === "anon" ? "" : jars[as];
  if (cookie) headers.Cookie = cookie;
  if (json !== undefined) headers["Content-Type"] = "application/json";
  const res = await fetch(`${BASE}${path}`, {
    method, headers,
    body: json === undefined ? undefined : JSON.stringify(json),
  });
  for (const c of res.headers.getSetCookie?.() ?? []) {
    const [pair] = c.split(";");
    if (pair.startsWith("xungen_session=") && as !== "anon") jars[as] = pair;
  }
  if (raw) return { status: res.status, headers: res.headers, buf: Buffer.from(await res.arrayBuffer()) };
  const body = await res.json().catch(() => ({}));
  return { status: res.status, headers: res.headers, body, data: body?.data };
}

function check(name, condition, detail = "") {
  if (condition) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; console.error(`  ✗ ${name} ${detail}`); }
}

async function register(as, label) {
  const email = `comm_${as}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}@xungen.local`;
  const r = await request("POST", "/api/auth/register", {
    json: { email, password: "Community2026", displayName: label, agreeTerms: true }, as,
  });
  return { r, email };
}

async function main() {
  const stamp = Date.now();
  console.log(`\n[smoke-community] 目标 ${BASE}\n`);

  console.log("1) 页面可达性");
  for (const p of ["/community", "/community/new", "/me", "/me/messages", "/guide", "/legal/privacy", "/legal/terms"]) {
    const r = await request("GET", p, { as: "anon", raw: true });
    check(`页面 ${p} 返回 200`, r.status === 200, `实际 ${r.status}`);
  }

  console.log("2) 认证与基础数据");
  const A = await register("a", "社区甲");
  check("用户 A 注册成功", A.r.status === 201, JSON.stringify(A.r.body));
  const B = await register("b", "社区乙");
  check("用户 B 注册成功", B.r.status === 201, JSON.stringify(B.r.body));
  let r = await request("GET", "/api/posts", { as: "anon" });
  check("匿名可读取公开帖子流", r.status === 200 && Array.isArray(r.data?.items), JSON.stringify(r.body).slice(0, 200));
  const demoCount = r.data?.total ?? 0;
  check("种子演示帖已入库且为公开内容", demoCount > 0, `共 ${demoCount} 条`);
  r = await request("GET", "/api/auth/me", { as: "a" });
  const userA = r.data?.user?.id;
  check("A 的 /api/auth/me 返回身份", Boolean(userA), JSON.stringify(r.data).slice(0, 200));
  r = await request("GET", "/api/auth/me", { as: "b" });
  const userB = r.data?.user?.id;
  check("B 的 /api/auth/me 返回身份", Boolean(userB), JSON.stringify(r.data).slice(0, 200));

  r = await request("POST", "/api/families", {
    json: { name: `社区测试族谱 ${stamp}`, surnameText: "陈", visibility: "PRIVATE" }, as: "a",
  });
  const familyA = r.data?.id;
  check("A 创建私有族谱用于 FAMILY 帖子", Boolean(familyA), JSON.stringify(r.body));

  console.log("3) 帖子发布与可见性");
  const secretWord = `隐私标记${stamp}`;
  r = await request("POST", "/api/posts", {
    json: { title: `${secretWord} 的私密记录`, content: "这条内容仅作者可见，用于验证检索权限过滤。", type: "DISCUSSION", visibility: "PRIVATE" }, as: "a",
  });
  const privatePost = r.data?.id;
  check("创建 PRIVATE 帖子", r.status === 201 && Boolean(privatePost), JSON.stringify(r.body));
  r = await request("GET", `/api/posts?q=${encodeURIComponent(secretWord)}`, { as: "anon" });
  check("【权限】匿名关键词检索不泄露 PRIVATE 帖子", r.status === 200 && !(r.data?.items ?? []).some((p) => p.id === privatePost), JSON.stringify(r.data?.items?.map((p) => p.id)));
  r = await request("GET", `/api/posts?q=${encodeURIComponent(secretWord)}`, { as: "a" });
  check("作者本人可检索到自己的 PRIVATE 帖子", (r.data?.items ?? []).some((p) => p.id === privatePost), JSON.stringify(r.data?.items?.map((p) => p.id)));
  r = await request("GET", `/api/posts/${privatePost}`, { as: "anon" });
  check("匿名读取 PRIVATE 帖子详情被拒", r.status === 404, `实际 ${r.status}`);

  r = await request("POST", "/api/posts", {
    json: { title: `【测试】家族内部通知 ${stamp}`, content: "仅家族协作者可见。", type: "FAMILY_NEWS", visibility: "FAMILY", familyId: familyA }, as: "a",
  });
  const familyPost = r.data?.id;
  check("创建 FAMILY 可见帖子", r.status === 201 && Boolean(familyPost), JSON.stringify(r.body));
  r = await request("GET", `/api/posts/${familyPost}`, { as: "anon" });
  check("匿名不可读 FAMILY 帖子", r.status === 404, `实际 ${r.status}`);
  r = await request("GET", `/api/posts/${familyPost}`, { as: "a" });
  check("家族协作者可读 FAMILY 帖子", r.status === 200 && r.data?.id === familyPost, JSON.stringify(r.body).slice(0, 200));
  r = await request("POST", "/api/posts", {
    json: { title: "试图发布全站公告", content: "普通用户不应有此权限。", type: "ANNOUNCEMENT" }, as: "a",
  });
  check("普通用户发布全站公告被拒", r.status === 403, `实际 ${r.status}`);
  r = await request("POST", "/api/posts", {
    json: { title: "缺依据的家族可见帖", content: "未绑定家族。", visibility: "FAMILY" }, as: "a",
  });
  check("FAMILY 可见性未绑定家族被拒", r.status === 400, `实际 ${r.status}`);
  r = await request("GET", "/api/posts?mine=1", { as: "anon" });
  check("匿名使用 mine=1 被拒", r.status === 401, `实际 ${r.status}`);

  const publicPostTitle = `【测试】公开寻亲线索 ${stamp}`;
  r = await request("POST", "/api/posts", {
    json: {
      title: publicPostTitle, content: "【测试内容】寻找同字辈宗亲，仅作功能验证。", type: "SEEK_RELATIVE",
      visibility: "PUBLIC", tags: ["测试"], clues: { ancestralHome: "河南（演示）", generationPoem: "测试字辈", surname: "陈" },
    }, as: "a",
  });
  const publicPost = r.data?.id;
  check("创建 PUBLIC 寻亲帖（含结构化线索）", r.status === 201 && Boolean(publicPost), JSON.stringify(r.body));
  r = await request("GET", `/api/posts/${publicPost}`, { as: "anon" });
  check("匿名可读公开帖且不返回作者邮箱", r.status === 200 && !JSON.stringify(r.data).includes(A.email), JSON.stringify(r.data).slice(0, 240));
  check("寻亲线索随详情返回", r.data?.clues?.ancestralHome === "河南（演示）", JSON.stringify(r.data?.clues));
  r = await request("GET", "/api/posts?type=SEEK_RELATIVE", { as: "anon" });
  check("按类型筛选生效", r.status === 200 && (r.data?.items ?? []).every((p) => p.type === "SEEK_RELATIVE"), JSON.stringify(r.data?.items?.map((p) => p.type)));

  console.log("4) 评论树、举报与编辑");
  r = await request("POST", `/api/posts/${publicPost}/comments`, {
    json: { content: "【测试】第一条评论" }, as: "b",
  });
  const rootComment = r.data?.id;
  check("B 发表评论", r.status === 201 && Boolean(rootComment), JSON.stringify(r.body));
  r = await request("POST", `/api/posts/${publicPost}/comments`, {
    json: { content: "【测试】回复第一条评论", parentId: rootComment }, as: "a",
  });
  check("A 回复评论", r.status === 201, JSON.stringify(r.body));
  r = await request("GET", `/api/posts/${publicPost}`, { as: "anon" });
  const roots = r.data?.comments ?? [];
  check("评论以两级树返回", roots.length >= 1 && roots[0].children?.length >= 1, JSON.stringify(roots).slice(0, 300));
  r = await request("POST", `/api/posts/${publicPost}/comments`, {
    json: { content: "父评论不属于本帖子", parentId: "00000000-0000-4000-8000-000000000000" }, as: "a",
  });
  check("无效父评论被拒", r.status === 400, `实际 ${r.status}`);
  r = await request("GET", "/api/notifications", { as: "a" });
  check("帖子作者收到评论通知", (r.data?.unread ?? 0) > 0, JSON.stringify(r.data).slice(0, 200));
  r = await request("PATCH", "/api/notifications", { json: { all: true }, as: "a" });
  check("标记全部通知已读", r.status === 200 && r.data?.updated > 0, JSON.stringify(r.body));
  r = await request("GET", "/api/notifications", { as: "a" });
  check("未读数归零", r.data?.unread === 0, String(r.data?.unread));
  r = await request("DELETE", `/api/comments/${rootComment}`, { as: "b" });
  check("评论作者可删除自己的评论", r.status === 200, JSON.stringify(r.body));
  r = await request("DELETE", `/api/comments/${rootComment}`, { as: "a" });
  check("重复删除返回 404", r.status === 404, `实际 ${r.status}`);

  r = await request("POST", "/api/reports", {
    json: { targetType: "POST", targetId: publicPost, reason: "内容不实：冒烟测试举报" }, as: "b",
  });
  check("提交举报 / 纠错", r.status === 201, JSON.stringify(r.body));
  r = await request("POST", "/api/reports", {
    json: { targetType: "POST", targetId: publicPost, reason: "内容不实：重复提交" }, as: "b",
  });
  check("重复举报被拒", r.status === 409, `实际 ${r.status}`);
  r = await request("GET", "/api/reports", { as: "b" });
  check("举报列表仅含本人记录", r.status === 200 && (r.data?.items ?? []).every((x) => x.targetId === publicPost), JSON.stringify(r.data).slice(0, 200));

  r = await request("PATCH", `/api/posts/${publicPost}`, { json: { title: `${publicPostTitle}（已修订）` }, as: "a" });
  check("作者可编辑自己的帖子", r.status === 200 && r.data?.title.includes("已修订"), JSON.stringify(r.body).slice(0, 200));
  r = await request("PATCH", `/api/posts/${publicPost}`, { json: { title: "越权修改" }, as: "b" });
  check("他人修改帖子被拒", r.status === 403, `实际 ${r.status}`);

  console.log("5) 私信");
  r = await request("POST", "/api/messages", { json: { recipientId: userB, content: "【测试】你好，想咨询字辈线索。" }, as: "a" });
  const msg = r.data?.id;
  check("A 向 B 发送私信", r.status === 201 && Boolean(msg), JSON.stringify(r.body));
  r = await request("POST", "/api/messages", { json: { recipientId: userA, content: "自己给自己发" }, as: "a" });
  check("不能给自己发私信", r.status === 400, `实际 ${r.status}`);
  r = await request("GET", "/api/messages", { as: "b" });
  check("B 收件箱可见该私信", (r.data?.items ?? []).some((m) => m.id === msg), JSON.stringify(r.data).slice(0, 200));
  check("B 未读计数正确", r.data?.unread >= 1, String(r.data?.unread));
  r = await request("GET", `/api/messages/${msg}`, { as: "a" });
  check("发送方可读自己发的私信", r.status === 200, `实际 ${r.status}`);
  r = await request("GET", "/api/messages?conversations=1", { as: "b" });
  check("会话列表聚合且不返回邮箱", r.status === 200 && (r.data?.items ?? []).some((c) => c.partnerId === userA) && !JSON.stringify(r.data).includes(A.email), JSON.stringify(r.data).slice(0, 240));
  r = await request("GET", `/api/messages?with=${userA}`, { as: "b" });
  check("打开会话后消息可读", r.status === 200 && (r.data?.items ?? []).some((m) => m.id === msg), JSON.stringify(r.data).slice(0, 200));
  r = await request("GET", "/api/messages", { as: "b" });
  check("打开会话后未读归零", r.data?.unread === 0, String(r.data?.unread));
  r = await request("GET", `/api/messages/${msg}`, { as: "c" });
  check("第三方读取私信被拒", r.status === 401 || r.status === 404, `实际 ${r.status}`);
  r = await request("DELETE", `/api/messages/${msg}`, { as: "b" });
  check("接收方可删除自己一侧的私信", r.status === 200, JSON.stringify(r.body));
  r = await request("GET", `/api/messages/${msg}`, { as: "b" });
  check("删除后接收方不可再读取", r.status === 404, `实际 ${r.status}`);

  console.log("6) 同姓宗亲检索授权");
  r = await request("GET", "/api/clan/search?surname=%E9%99%88", { as: "a" });
  check("未授权用户不会出现在宗亲检索结果", r.status === 200 && !(r.data?.items ?? []).some((u) => u.id === userB), JSON.stringify(r.data?.items).slice(0, 200));
  r = await request("PATCH", "/api/me/profile", {
    json: { displayName: "社区乙", surname: "陈", location: "河南（测试）", privacySettings: { allowClanSearch: true, showLocation: false } }, as: "b",
  });
  check("B 开启宗亲检索授权", r.status === 200, JSON.stringify(r.body));
  r = await request("GET", "/api/clan/search?surname=%E9%99%88", { as: "a" });
  check("授权后 B 出现在检索结果", (r.data?.items ?? []).some((u) => u.id === userB), JSON.stringify(r.data?.items).slice(0, 240));
  check("检索结果不含邮箱", !JSON.stringify(r.data?.items ?? []).includes(B.email), JSON.stringify(r.data?.items).slice(0, 240));
  check("未授权展示地区时不下发地区", (r.data?.items ?? []).find((u) => u.id === userB)?.location === null, JSON.stringify((r.data?.items ?? []).find((u) => u.id === userB)));
  r = await request("PATCH", "/api/me/profile", {
    json: { privacySettings: { allowClanSearch: false } }, as: "b",
  });
  r = await request("GET", "/api/clan/search?surname=%E9%99%88", { as: "a" });
  check("撤回授权后立即从检索结果消失", r.status === 200 && !(r.data?.items ?? []).some((u) => u.id === userB), JSON.stringify(r.data?.items).slice(0, 200));

  console.log("7) 分支关联双确认");
  r = await request("POST", "/api/clan-connections", {
    json: { addresseeId: userB, familyAId: familyA, evidenceNote: "【测试】双方族谱字辈与祖籍线索待人工比对" }, as: "a",
  });
  const conn = r.data?.id;
  check("A 发起关联申请（发起即确认）", r.status === 201 && Boolean(conn) && r.data?.requesterConfirmedAt, JSON.stringify(r.body));
  check("申请初始状态 PENDING", r.data?.status === "PENDING", r.data?.status);
  r = await request("POST", "/api/clan-connections", {
    json: { addresseeId: userB, evidenceNote: "重复申请" }, as: "a",
  });
  check("重复申请被拒", r.status === 409, `实际 ${r.status}`);
  r = await request("POST", "/api/clan-connections", {
    json: { addresseeId: userA, evidenceNote: "反向重复申请" }, as: "b",
  });
  check("反向重复申请同样被拒", r.status === 409, `实际 ${r.status}`);
  let relBefore = await request("GET", `/api/families/${familyA}/relationships`, { as: "a" });
  const relCountBefore = relBefore.data?.total ?? 0;
  r = await request("PATCH", `/api/clan-connections/${conn}`, { json: { action: "ACCEPT" }, as: "a" });
  check("发起方不能代替对方确认", r.status === 403, `实际 ${r.status}`);
  r = await request("PATCH", `/api/clan-connections/${conn}`, { json: { action: "ACCEPT" }, as: "b" });
  check("被申请方确认后状态 ACCEPTED", r.status === 200 && r.data?.status === "ACCEPTED", JSON.stringify(r.body));
  check("双方确认时间戳齐全", Boolean(r.data?.requesterConfirmedAt && r.data?.addresseeConfirmedAt), JSON.stringify(r.data));
  relBefore = await request("GET", `/api/families/${familyA}/relationships`, { as: "a" });
  check("关联确认不自动创建任何亲属关系", (relBefore.data?.total ?? 0) === relCountBefore, `${relCountBefore} → ${relBefore.data?.total}`);
  r = await request("PATCH", `/api/clan-connections/${conn}`, { json: { action: "REJECT" }, as: "b" });
  check("已处理申请不可重复操作", r.status === 409, `实际 ${r.status}`);

  console.log("8) 个人中心：资料、改密、会话、导出");
  r = await request("GET", "/api/me/profile", { as: "a" });
  check("个人资料接口可用", r.status === 200 && Boolean(r.data?.profile?.id) && r.data?.account?.email === A.email, JSON.stringify(r.data).slice(0, 200));
  r = await request("PATCH", "/api/me/profile", {
    json: { displayName: "社区甲（已更新）", bio: "冒烟测试", privacySettings: { allowClanSearch: true, showSurname: true } }, as: "a",
  });
  check("资料与隐私设置更新成功", r.status === 200 && r.data?.displayName === "社区甲（已更新）", JSON.stringify(r.body));
  r = await request("GET", "/api/me/sessions", { as: "a" });
  check("会话列表返回且标出当前设备", r.status === 200 && (r.data ?? []).some((s) => s.current === true), JSON.stringify(r.data).slice(0, 240));
  check("会话列表不含 token 摘要", !JSON.stringify(r.data ?? []).includes("tokenHash"), JSON.stringify(r.data).slice(0, 200));
  r = await request("POST", "/api/me/password", { json: { currentPassword: "wrong-password", newPassword: "NewPass2026" }, as: "a" });
  check("错误原密码不能改密", r.status === 403, `实际 ${r.status}`);
  r = await request("POST", "/api/me/password", { json: { currentPassword: "Community2026", newPassword: "NewPass2026" }, as: "a" });
  check("正确原密码可修改密码", r.status === 200 && r.data?.changed === true, JSON.stringify(r.body));
  r = await request("POST", "/api/auth/login", { json: { email: A.email, password: "NewPass2026" }, as: "anon" });
  check("新密码可登录、旧密码失效", r.status === 200, `实际 ${r.status}`);
  r = await request("POST", "/api/auth/login", { json: { email: A.email, password: "Community2026" }, as: "anon" });
  check("旧密码登录被拒", r.status === 401 || r.status === 403, `实际 ${r.status}`);
  const exported = await request("GET", "/api/me/export", { as: "a", raw: true });
  let bundle = null;
  try { bundle = JSON.parse(exported.buf.toString("utf8")); } catch { /* 解析失败由下一条断言报告 */ }
  check("个人数据导出为合法 JSON", exported.status === 200 && bundle?.format === "zhonghua-xungen.personal-data", `状态 ${exported.status}`);
  check("导出不含密码哈希与会话摘要", !exported.buf.toString("utf8").includes("passwordHash") && !exported.buf.toString("utf8").includes("tokenHash"));
  check("导出包含本人帖子", Array.isArray(bundle?.posts) && bundle.posts.length > 0, JSON.stringify(bundle?.posts?.length));

  console.log("9) 账号注销与个人信息删除（独立账号）");
  const C = await register("c", "注销测试");
  check("独立账号 C 注册成功", C.r.status === 201, JSON.stringify(C.r.body));
  r = await request("POST", "/api/families", {
    json: { name: `注销测试私有族谱 ${stamp}`, surnameText: "陈", visibility: "PRIVATE" }, as: "c",
  });
  const familyC = r.data?.id;
  r = await request("POST", "/api/posts", {
    json: { title: `【注销测试】公开帖 ${stamp}`, content: "注销后应不再公开。", type: "DISCUSSION", visibility: "PUBLIC" }, as: "c",
  });
  const postC = r.data?.id;
  check("C 创建私有族谱与公开帖", Boolean(familyC) && Boolean(postC), JSON.stringify([familyC, postC]));
  r = await request("GET", `/api/posts/${postC}`, { as: "anon" });
  check("注销前公开帖匿名可见", r.status === 200, `实际 ${r.status}`);
  r = await request("POST", "/api/me/delete", { json: { password: "wrong", confirm: "DELETE_MY_ACCOUNT" }, as: "c" });
  check("密码错误不能注销", r.status === 403, `实际 ${r.status}`);
  r = await request("POST", "/api/me/delete", { json: { password: "Community2026", confirm: "WRONG" }, as: "c" });
  check("缺少显式确认不能注销", r.status === 422 || r.status === 400, `实际 ${r.status}`);
  r = await request("POST", "/api/me/delete", { json: { password: "Community2026", confirm: "DELETE_MY_ACCOUNT" }, as: "c" });
  check("显式确认后注销成功", r.status === 200 && r.data?.deleted === true, JSON.stringify(r.body));
  check("注销处理了会话与私信等数据", typeof r.data?.summary?.sessions === "number" && r.data.summary.sessions >= 1, JSON.stringify(r.data?.summary));
  r = await request("GET", "/api/auth/me", { as: "c" });
  check("注销后会话立即失效", r.data?.authenticated === false, JSON.stringify(r.data).slice(0, 200));
  r = await request("GET", `/api/posts/${postC}`, { as: "anon" });
  check("注销后原公开帖不再对外展示", r.status === 404, `实际 ${r.status}`);
  r = await request("POST", "/api/auth/login", { json: { email: C.email, password: "Community2026" }, as: "anon" });
  check("注销后原邮箱无法登录", r.status === 401 || r.status === 403, `实际 ${r.status}`);

  console.log(`\n[smoke-community] 通过 ${passed} 项，失败 ${failed} 项\n`);
  if (failed) process.exit(1);
}

main().catch((err) => { console.error("[smoke-community] 运行异常：", err); process.exit(1); });
