/**
 * 阶段 10 端到端冒烟测试：管理员后台。
 * 运行： node scripts/smoke-admin.mjs  （需站点与数据库已启动；管理员账号来自 seed）
 *
 * 覆盖：后台页面 → 未登录/普通用户越权拦截 → 总览统计与服务状态
 *       → 用户停权恢复与角色调整 → 自我保护规则 → 举报/内容/史料/姓氏审核
 *       → 审计日志 → 系统设置白名单与安全基线只读
 *       → 【关键】管理员也不得读取私有族谱人物明细或导出私有族谱
 */
const BASE = process.env.SMOKE_BASE_URL || "http://localhost:3000";
const ADMIN_EMAIL = process.env.SMOKE_ADMIN_EMAIL || "admin@xungen.local";
const ADMIN_PASSWORD = process.env.SMOKE_ADMIN_PASSWORD || "ChangeMe_Admin_2026";
const jars = { admin: "", user: "" };
let passed = 0;
let failed = 0;

async function request(method, path, opts = {}) {
  const { json, as = "admin", raw } = opts;
  const headers = { Origin: BASE };
  const cookie = as === "anon" ? "" : jars[as];
  if (cookie) headers.Cookie = cookie;
  if (json !== undefined) headers["Content-Type"] = "application/json";
  const res = await fetch(`${BASE}${path}`, {
    method, headers, body: json === undefined ? undefined : JSON.stringify(json),
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

async function main() {
  const stamp = Date.now();
  console.log(`\n[smoke-admin] 目标 ${BASE}\n`);

  console.log("1) 页面与越权拦截");
  const page = await request("GET", "/admin", { as: "anon", raw: true });
  check("后台页面返回 200（客户端再做权限判定）", page.status === 200, `实际 ${page.status}`);
  const adminEndpoints = ["/api/admin/overview", "/api/admin/users", "/api/admin/reports", "/api/admin/posts", "/api/admin/sources", "/api/admin/surnames", "/api/admin/audit-logs", "/api/admin/settings"];
  for (const p of adminEndpoints) {
    const r = await request("GET", p, { as: "anon" });
    check(`匿名访问 ${p} 被拒`, r.status === 401, `实际 ${r.status}`);
  }

  const email = `admin_test_${stamp}@xungen.local`;
  let r = await request("POST", "/api/auth/register", {
    json: { email, password: "AdminTest2026", displayName: "后台测试用户", agreeTerms: true }, as: "user",
  });
  check("普通测试用户注册成功", r.status === 201, JSON.stringify(r.body));
  r = await request("GET", "/api/auth/me", { as: "user" });
  const normalUserId = r.data?.user?.id;
  for (const p of adminEndpoints) {
    const res = await request("GET", p, { as: "user" });
    check(`普通用户访问 ${p} 被拒`, res.status === 403, `实际 ${res.status}`);
  }

  console.log("2) 管理员登录与总览");
  r = await request("POST", "/api/auth/login", { json: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD }, as: "admin" });
  check("管理员登录成功", r.status === 200, JSON.stringify(r.body));
  r = await request("GET", "/api/auth/me", { as: "admin" });
  const adminId = r.data?.user?.id;
  check("管理员身份含 isAdmin", r.data?.user?.isAdmin === true, JSON.stringify(r.data?.user).slice(0, 240));
  r = await request("GET", "/api/admin/overview", { as: "admin" });
  const overview = r.data;
  check("总览返回聚合统计", r.status === 200 && typeof overview?.counts?.users === "number", JSON.stringify(r.body).slice(0, 240));
  check("总览返回待处理事项", typeof overview?.pending?.reports === "number", JSON.stringify(overview?.pending));
  check("总览返回服务状态", overview?.services?.database === "connected" && Boolean(overview.services.cache), JSON.stringify(overview?.services));
  check("总览声明隐私边界", typeof overview?.notice === "string" && overview.notice.includes("人物明细"), String(overview?.notice));
  check("总览不返回任何人物姓名或敏感字段", !JSON.stringify(overview).includes("sensitiveDataEncrypted"));

  console.log("3) 私有族谱隐私边界");
  r = await request("POST", "/api/families", {
    json: { name: `后台隐私测试族谱 ${stamp}`, surnameText: "陈", visibility: "PRIVATE" }, as: "user",
  });
  const privateFamily = r.data?.id;
  r = await request("POST", `/api/families/${privateFamily}/members`, {
    json: { surnameText: "陈", givenName: "不可被管理员读取", isLiving: false, visibility: "PRIVATE", sensitiveData: "私密联系方式-测试" }, as: "user",
  });
  check("普通用户创建私有族谱与人物", Boolean(privateFamily) && r.status === 201, JSON.stringify(r.body));
  r = await request("GET", `/api/families/${privateFamily}/members`, { as: "admin" });
  check("【关键】管理员不能读取私有族谱人物列表", r.status === 403, `实际 ${r.status}`);
  r = await request("GET", `/api/families/${privateFamily}`, { as: "admin" });
  check("【关键】管理员不能读取私有族谱详情", r.status === 403, `实际 ${r.status}`);
  r = await request("POST", `/api/families/${privateFamily}/export?format=JSON`, { json: {}, as: "admin", raw: true });
  check("【关键】管理员不能导出私有族谱", r.status === 403, `实际 ${r.status}`);
  r = await request("GET", `/api/families/${privateFamily}/graph`, { as: "admin" });
  check("【关键】管理员不能读取私有族谱图谱", r.status === 403, `实际 ${r.status}`);
  r = await request("GET", "/api/search?q=%E4%B8%8D%E5%8F%AF%E8%A2%AB%E7%AE%A1%E7%90%86%E5%91%98%E8%AF%BB%E5%8F%96", { as: "admin" });
  const leakedPerson = (r.data?.groups ?? []).some((g) => (g.items ?? []).some((it) => JSON.stringify(it).includes("不可被管理员读取")));
  check("【关键】管理员搜索不命中私有族谱人物", r.status === 200 && !leakedPerson && r.data?.total === 0, `命中 ${r.data?.total} 条，泄露=${leakedPerson}`);

  console.log("4) 用户管理与自我保护");
  r = await request("GET", `/api/admin/users?q=${encodeURIComponent(email)}`, { as: "admin" });
  check("用户列表可按邮箱搜索", r.status === 200 && (r.data?.items ?? []).some((u) => u.id === normalUserId), JSON.stringify(r.data?.items).slice(0, 240));
  r = await request("PATCH", "/api/admin/users", { json: { userId: adminId, status: "SUSPENDED" }, as: "admin" });
  check("不能停用自己的账号", r.status === 400, `实际 ${r.status}`);
  r = await request("PATCH", "/api/admin/users", { json: { userId: adminId, roleKeys: ["user"] }, as: "admin" });
  check("不能移除自己的管理员权限", r.status === 400, `实际 ${r.status}`);
  r = await request("PATCH", "/api/admin/users", { json: { userId: normalUserId, status: "SUSPENDED" }, as: "admin" });
  check("管理员可停用违规账号", r.status === 200, JSON.stringify(r.body));
  r = await request("GET", "/api/auth/me", { as: "user" });
  check("停权后该用户会话立即失效", r.data?.authenticated === false, JSON.stringify(r.data).slice(0, 200));
  r = await request("PATCH", "/api/admin/users", { json: { userId: normalUserId, roleKeys: ["user", "editor"] }, as: "admin" });
  check("可调整用户角色", r.status === 200, JSON.stringify(r.body));
  r = await request("GET", `/api/admin/users?q=${encodeURIComponent(email)}`, { as: "admin" });
  const roles = (r.data?.items ?? []).find((u) => u.id === normalUserId)?.roles.map((x) => x.role.key) ?? [];
  check("角色变更已生效", roles.includes("editor"), JSON.stringify(roles));
  r = await request("PATCH", "/api/admin/users", { json: { userId: normalUserId, roleKeys: ["ghost"] }, as: "admin" });
  check("未知角色被拒", r.status === 422 || r.status === 400, `实际 ${r.status}`);
  r = await request("PATCH", "/api/admin/users", { json: { userId: normalUserId, status: "ACTIVE" }, as: "admin" });
  check("管理员可恢复账号状态", r.status === 200, JSON.stringify(r.body));
  // 停权时会话已被撤销，恢复状态后需重新登录才能继续以该用户身份操作
  r = await request("POST", "/api/auth/login", { json: { email, password: "AdminTest2026" }, as: "user" });
  check("恢复后可重新登录", r.status === 200, JSON.stringify(r.body));

  console.log("5) 举报与内容审核");
  r = await request("GET", "/api/posts", { as: "anon" });
  const somePost = r.data?.items?.[0]?.id;
  check("获取一条公开帖子用于审核测试", Boolean(somePost), JSON.stringify(r.data?.items?.slice(0, 1)));
  r = await request("POST", "/api/reports", {
    json: { targetType: "POST", targetId: somePost, reason: "内容不实：后台审核冒烟测试" }, as: "user",
  });
  check("用户提交举报", r.status === 201, JSON.stringify(r.body));
  r = await request("GET", "/api/admin/reports", { as: "admin" });
  const reportId = r.data?.items?.find((x) => x.reason.includes("后台审核冒烟测试"))?.id;
  check("后台可见举报列表", r.status === 200 && Boolean(reportId), JSON.stringify(r.body).slice(0, 240));
  r = await request("PATCH", "/api/admin/reports", { json: { id: reportId, status: "RESOLVED", resolution: "已核查，属测试数据，保留内容" }, as: "admin" });
  check("处理举报并记录结论", r.status === 200 && r.data?.status === "RESOLVED", JSON.stringify(r.body));
  r = await request("GET", `/api/posts/${somePost}`, { as: "anon" });
  check("处理举报不会自动删除被举报内容", r.status === 200, `实际 ${r.status}`);
  r = await request("PATCH", "/api/admin/posts", { json: { id: somePost, status: "HIDDEN", reason: "冒烟测试下架" }, as: "admin" });
  check("后台下架内容", r.status === 200 && r.data?.status === "HIDDEN", JSON.stringify(r.body));
  r = await request("GET", `/api/posts/${somePost}`, { as: "anon" });
  check("下架后匿名访客不可见", r.status === 404, `实际 ${r.status}`);
  r = await request("PATCH", "/api/admin/posts", { json: { id: somePost, status: "PUBLISHED" }, as: "admin" });
  check("后台恢复发布", r.status === 200, JSON.stringify(r.body));
  r = await request("GET", `/api/posts/${somePost}`, { as: "anon" });
  check("恢复后匿名访客可重新读取", r.status === 200, `实际 ${r.status}`);

  console.log("6) 史料与姓氏审核");
  r = await request("GET", "/api/admin/sources?pageSize=1", { as: "admin" });
  const source = r.data?.items?.[0];
  check("史料审核列表可读且带出处字段", r.status === 200 && Boolean(source?.id) && "volumeOrPage" in (source ?? {}), JSON.stringify(source).slice(0, 240));
  const sourceBefore = source?.reviewStatus;
  r = await request("PATCH", "/api/admin/sources", { json: { id: source.id, reviewStatus: "APPROVED" }, as: "admin" });
  check("可审定史料", r.status === 200 && r.data?.reviewStatus === "APPROVED", JSON.stringify(r.body));
  r = await request("PATCH", "/api/admin/sources", { json: { id: source.id, reviewStatus: sourceBefore ?? "PENDING" }, as: "admin" });
  check("史料审核状态已恢复原值", r.status === 200, JSON.stringify(r.body));
  r = await request("GET", "/api/admin/surnames?pageSize=1", { as: "admin" });
  const surname = r.data?.items?.[0];
  check("姓氏审核列表可读", r.status === 200 && Boolean(surname?.id), JSON.stringify(surname).slice(0, 240));
  const surnameBefore = surname?.reviewStatus;
  r = await request("PATCH", "/api/admin/surnames", { json: { id: surname.id, reviewStatus: "DISPUTED" }, as: "admin" });
  check("可标记姓氏资料存疑", r.status === 200 && r.data?.reviewStatus === "DISPUTED", JSON.stringify(r.body));
  r = await request("PATCH", "/api/admin/surnames", { json: { id: surname.id, reviewStatus: surnameBefore ?? "PENDING" }, as: "admin" });
  check("姓氏审核状态已恢复原值", r.status === 200, JSON.stringify(r.body));

  console.log("7) 审计日志与系统设置");
  r = await request("GET", "/api/admin/audit-logs?action=admin", { as: "admin" });
  check("审计日志可按动作筛选", r.status === 200 && (r.data?.items ?? []).length > 0, JSON.stringify(r.data?.items?.slice(0, 1)).slice(0, 240));
  check("审计日志包含后台操作记录", (r.data?.items ?? []).some((a) => a.action.startsWith("admin.")), JSON.stringify((r.data?.items ?? []).map((a) => a.action).slice(0, 5)));
  r = await request("GET", "/api/admin/settings", { as: "admin" });
  const settings = r.data?.items ?? [];
  check("系统设置列表可读且标记可编辑性", r.status === 200 && settings.some((s) => s.editable === true) && settings.some((s) => s.editable === false), JSON.stringify(settings.map((s) => [s.key, s.editable])).slice(0, 240));
  r = await request("PATCH", "/api/admin/settings", { json: { key: "clan.auto_merge_enabled", value: true }, as: "admin" });
  check("【关键】同姓自动合并开关不可被打开", r.status === 403 && r.body?.error?.code === "READ_ONLY_SETTING", JSON.stringify(r.body));
  r = await request("PATCH", "/api/admin/settings", { json: { key: "privacy.family_default_visibility", value: "PUBLIC" }, as: "admin" });
  check("【关键】隐私默认策略不可被放宽", r.status === 403, `实际 ${r.status}`);
  r = await request("PATCH", "/api/admin/settings", { json: { key: "not.allowed", value: "x" }, as: "admin" });
  check("未知设置键被拒", r.status === 400, `实际 ${r.status}`);
  const siteNameBefore = settings.find((s) => s.key === "site.name")?.value?.value ?? "中华寻根 · 百家族谱";
  r = await request("PATCH", "/api/admin/settings", { json: { key: "site.name", value: "后台冒烟测试名称" }, as: "admin" });
  check("白名单设置项可修改", r.status === 200, JSON.stringify(r.body));
  r = await request("PATCH", "/api/admin/settings", { json: { key: "site.name", value: siteNameBefore }, as: "admin" });
  check("设置值已恢复原值", r.status === 200, JSON.stringify(r.body));

  console.log(`\n[smoke-admin] 通过 ${passed} 项，失败 ${failed} 项\n`);
  if (failed) process.exit(1);
}

main().catch((err) => { console.error("[smoke-admin] 运行异常：", err); process.exit(1); });
