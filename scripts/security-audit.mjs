/**
 * 安全审计脚本（对运行中的站点发起真实请求）。
 * 运行： pnpm test:reset-limits && pnpm test:security
 * 输出： reports/security-audit.json（结构化结果）+ 控制台摘要
 *
 * 覆盖：安全响应头、Cookie 属性、CSRF、越权、XSS 存储与渲染、SQL 注入、
 *       路径穿越、上传伪装、限流、密码策略、登录锁定、会话失效、敏感字段泄露。
 *
 * warnings 是「已知遗留项」的可观测护栏：只检测并写入报告，不计入 passed/failed，
 * 也不修改 CSP 本体。当前用于跟踪生产 CSP 的宽松指令，待 nonce/hash 化改造后移除。
 *
 * 顺序约定：会打满注册/登录限流桶的用例一律放在最后，避免污染功能用例。
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const BASE = process.env.SMOKE_BASE_URL || "http://localhost:3000";
const OUT = path.join(process.cwd(), "reports", "security-audit.json");
const results = [];
// 已知遗留项的可观测护栏：只记录、不判定失败，不改变 passed/failed 计数。
const warnings = [];

function warn(category, name, detail) {
  warnings.push({ category, name, detail: String(detail).slice(0, 400) });
  console.log(`  ⚠ ${name} — ${String(detail).slice(0, 160)}`);
}

// 当前审计账号的会话；只有显式 capture 的响应才能改写它
let cookie = "";

const safeJson = (v) => {
  try { return JSON.stringify(v ?? {}); } catch { return "{}"; }
};

function record(category, name, ok, detail = "") {
  results.push({ category, name, ok, detail: String(detail).slice(0, 400) });
  console.log(`  ${ok ? "✓" : "✗"} ${name}${ok ? "" : ` — ${String(detail).slice(0, 160)}`}`);
  return ok;
}

/**
 * @param opts.capture 是否把响应中的 xungen_session 写入全局 cookie（只有可信的注册/登录响应用）
 */
async function req(method, url, opts = {}) {
  const { json, headers = {}, anonymous, raw, capture } = opts;
  const h = { ...headers };
  if (!anonymous && cookie) h.Cookie = cookie;
  if (json !== undefined) h["Content-Type"] = "application/json";
  const res = await fetch(`${BASE}${url}`, {
    method, headers: h, body: json === undefined ? undefined : JSON.stringify(json), redirect: "manual",
  });
  let setCookie = "";
  for (const c of res.headers.getSetCookie?.() ?? []) {
    const [pair] = c.split(";");
    if (pair.startsWith("xungen_session=")) {
      setCookie = c;
      // 只有显式捕获才改写会话；限流/弱密码/登录锁定等探测请求不污染当前登录态
      if (capture && pair.includes("=") && !/^xungen_session=;?$/.test(pair)) cookie = pair;
    }
  }
  if (raw) return { status: res.status, headers: res.headers, text: await res.text(), body: {}, setCookie };
  const body = await res.json().catch(() => ({}));
  return { status: res.status, headers: res.headers, body, data: body?.data, setCookie };
}

async function main() {
  const stamp = Date.now();
  console.log(`\n[security-audit] 目标 ${BASE}\n`);

  console.log("1) HTTP 安全响应头");
  let r = await req("GET", "/", { anonymous: true, raw: true });
  const h = r.headers;
  record("headers", "X-Content-Type-Options: nosniff", h.get("x-content-type-options") === "nosniff", h.get("x-content-type-options"));
  record("headers", "X-Frame-Options 防点击劫持", ["DENY", "SAMEORIGIN"].includes(h.get("x-frame-options") || ""), h.get("x-frame-options"));
  record("headers", "Referrer-Policy 存在", Boolean(h.get("referrer-policy")), h.get("referrer-policy"));
  record("headers", "Permissions-Policy 存在", Boolean(h.get("permissions-policy")), h.get("permissions-policy"));
  const csp = h.get("content-security-policy") || "";
  record("headers", "CSP 策略存在且限制脚本来源", csp.includes("script-src"), csp.slice(0, 160));
  // 护栏：生产 CSP 仍含宽松指令（审计报告中的已知遗留项）。这里只检测并告警，
  // 不修改 next.config.ts：nonce/hash 化需先收敛 Next.js 注入的 inline script 与
  // ECharts/图谱等运行时依赖，属于后续独立改造。本护栏保证遗留项每次审计都可见。
  const looseCsp = ["unsafe-inline", "unsafe-eval"].filter((d) => csp.includes(d));
  if (looseCsp.length) {
    warn("headers", "CSP 含宽松指令（已知遗留项，待 nonce/hash 化）",
      `检测到 ${looseCsp.join(", ")}；移除前须先收敛 inline script 与运行时依赖`);
  }
  if (!csp.includes("script-src")) {
    warn("headers", "CSP 缺少 script-src", csp.slice(0, 160));
  }
  record("headers", "不暴露 X-Powered-By", !h.get("x-powered-by"), h.get("x-powered-by"));

  console.log("2) 会话 Cookie 与密码策略");
  r = await req("POST", "/api/auth/register", {
    json: { email: `weak_${stamp}@xungen.local`, password: "123", displayName: "弱密码", agreeTerms: true },
    anonymous: true,
  });
  record("auth", "弱密码注册被拒", r.status === 422 || r.status === 400, `状态 ${r.status}`);

  const email = `sec_${stamp}@xungen.local`;
  r = await req("POST", "/api/auth/register", {
    json: { email, password: "SecPass2026", displayName: "安全审计", agreeTerms: true },
    anonymous: true, capture: true,
  });
  record("auth", "合规密码注册成功", r.status === 201, `状态 ${r.status} / ${r.body?.error?.code ?? ""}`);
  const setCookie = r.setCookie || "";
  record("auth", "会话 Cookie 为 HttpOnly", /httponly/i.test(setCookie), setCookie.slice(0, 160));
  record("auth", "会话 Cookie 设置 SameSite", /samesite=/i.test(setCookie), setCookie.slice(0, 160));
  record("auth", "会话 Cookie 限定 Path=/", /path=\//i.test(setCookie), setCookie.slice(0, 160));
  record("auth", "响应体不返回会话令牌原文", !safeJson(r.body).includes("token"), safeJson(r.body).slice(0, 160));
  r = await req("GET", "/api/auth/me", {});
  record("auth", "当前用户接口不返回密码哈希", !safeJson(r.body).includes("passwordHash"), safeJson(r.body).slice(0, 200));

  console.log("3) CSRF");
  r = await req("POST", "/api/families", {
    json: { name: "跨站创建族谱", surnameText: "陈" },
    headers: { Origin: "https://evil.example.com" },
  });
  record("csrf", "跨站 Origin 的写请求被拒", r.status === 403 && r.body?.error?.code === "CSRF_REJECTED", `状态 ${r.status} / ${r.body?.error?.code}`);

  console.log("4) 越权与隐私边界");
  r = await req("POST", "/api/families", { json: { name: `安全测试私有族谱 ${stamp}`, surnameText: "陈", visibility: "PRIVATE" } });
  const familyId = r.data?.id;
  record("privacy", "创建私有族谱成功", Boolean(familyId), `状态 ${r.status} / ${r.body?.error?.code ?? ""}`);
  r = await req("POST", `/api/families/${familyId}/members`, {
    json: { surnameText: "陈", givenName: "隐私人物", isLiving: false, visibility: "PRIVATE", sensitiveData: "身份证号仅测试" },
  });
  const personId = r.data?.id;
  record("privacy", "创建加密敏感字段的人物", Boolean(personId), `状态 ${r.status} / ${r.body?.error?.code ?? ""}`);

  const anonRoutes = [
    ["GET", `/api/families/${familyId}/members`],
    ["GET", `/api/families/${familyId}`],
    ["GET", `/api/families/${familyId}/graph`],
    ["POST", `/api/families/${familyId}/export?format=JSON`],
    ["GET", `/api/families/${familyId}/documents`],
  ];
  for (const [method, url] of anonRoutes) {
    const res = await req(method, url, { anonymous: true, json: method === "POST" ? {} : undefined });
    record("privacy", `匿名访问 ${url.split("/").slice(3).join("/")} 被拒`, [401, 403].includes(res.status), `状态 ${res.status}`);
  }
  for (const url of ["/api/admin/overview", "/api/admin/users", "/api/admin/settings", "/api/admin/audit-logs"]) {
    const res = await req("GET", url, {});
    record("privacy", `普通用户访问 ${url} 被拒`, res.status === 403, `状态 ${res.status}`);
  }
  r = await req("GET", `/api/families/${familyId}/members`, {});
  record("privacy", "人物列表不返回加密敏感字段",
    r.status === 200 && !safeJson(r.data).includes("sensitiveDataEncrypted"),
    `状态 ${r.status} / ${safeJson(r.data).slice(0, 200)}`);
  r = await req("GET", `/api/search?q=${encodeURIComponent("隐私人物")}`, { anonymous: true });
  const leaked = safeJson(r.data?.groups ?? []).includes("隐私人物");
  record("privacy", "匿名全站搜索不泄露私有族谱人物", r.status === 200 && !leaked, `状态 ${r.status} 命中 ${r.data?.total ?? 0} 条`);

  console.log("5) 注入与恶意输入");
  const xss = `<script>alert('xss-audit-${stamp}')</script>`;
  r = await req("POST", "/api/posts", { json: { title: `【安全审计】XSS 测试 ${stamp}`, content: xss, visibility: "PUBLIC", type: "DISCUSSION" } });
  const xssPost = r.data?.id;
  record("xss", "含脚本标签的内容可提交（由前端转义，不做静默篡改）", [200, 201].includes(r.status) && Boolean(xssPost), `状态 ${r.status} / ${r.body?.error?.code ?? ""}`);
  record("xss", "服务端渲染 HTML 不含可执行脚本标签", await (async () => {
    const html = await req("GET", `/community/${xssPost ?? "nonexistent"}`, { anonymous: true, raw: true });
    return html.status === 200 && !html.text.includes(`<script>alert('xss-audit-${stamp}')</script>`);
  })(), `页面长度检查`);

  const injection = "' OR 1=1 --";
  r = await req("GET", `/api/search?q=${encodeURIComponent(injection)}`, { anonymous: true });
  record("sql-injection", "SQL 注入式查询不报错、不返回额外数据", r.status === 200 && (r.data?.total ?? 0) === 0, `状态 ${r.status} 命中 ${r.data?.total}`);
  r = await req("GET", `/api/surnames?q=${encodeURIComponent("' UNION SELECT * FROM users --")}`, { anonymous: true });
  record("sql-injection", "姓氏查询参数化，不泄露用户表数据", r.status === 200 && !safeJson(r.data).includes("passwordHash"), `状态 ${r.status}`);
  r = await req("GET", "/api/search?q=%3Cscript%3Ealert(1)%3C%2Fscript%3E", { anonymous: true });
  record("xss", "搜索接口不回显可执行脚本", r.status === 200 && !safeJson(r.body).includes("<script>alert(1)</script>"), `状态 ${r.status}`);

  console.log("6) 文件上传与路径穿越");
  const forms = [
    ["伪装 PNG", "evil.png", "this is not a png", "image/png", "MAGIC_MISMATCH"],
    ["可执行扩展名", "evil.exe", "MZ", "application/octet-stream", "UNSUPPORTED_FILE_TYPE"],
    ["MIME 不符", "note.txt", "普通文本", "image/png", "MIME_MISMATCH"],
  ];
  for (const [name, fileName, content, mime, code] of forms) {
    const fd = new FormData();
    fd.append("title", name);
    fd.append("file", new Blob([content], { type: mime }), fileName);
    const res = await fetch(`${BASE}/api/families/${familyId}/documents`, {
      method: "POST", headers: { Origin: BASE, Cookie: cookie }, body: fd,
    });
    const body = await res.json().catch(() => ({}));
    record("upload", `${name} 被拒绝（${code}）`, res.status === 400 && body?.error?.code === code, `状态 ${res.status} / ${body?.error?.code}`);
  }
  const traversal = await req("GET", `/api/families/${familyId}/documents/00000000-0000-4000-8000-000000000000/download?version=${encodeURIComponent("../../etc/passwd")}`, {});
  record("upload", "下载接口不因路径穿越读取任意文件", [400, 403, 404].includes(traversal.status), `状态 ${traversal.status} / ${traversal.body?.error?.code ?? ""}`);

  console.log("7) 登录锁定与会话失效");
  const lockEmail = `lock_${stamp}@xungen.local`;
  const lockRegister = await req("POST", "/api/auth/register", {
    json: { email: lockEmail, password: "LockPass2026", displayName: "锁定测试", agreeTerms: true }, anonymous: true,
  });
  record("auth", "锁定测试账号已创建", lockRegister.status === 201, `状态 ${lockRegister.status}`);
  let locked = false;
  for (let i = 0; i < 6; i++) {
    const res = await req("POST", "/api/auth/login", { json: { email: lockEmail, password: "wrong-pass" }, anonymous: true });
    if (res.status === 423 || /锁定|频繁/.test(res.body?.error?.message ?? "")) locked = true;
  }
  record("auth", "连续错误登录触发账号锁定", locked, locked ? "已触发" : "6 次尝试未触发");
  const correct = await req("POST", "/api/auth/login", { json: { email: lockEmail, password: "LockPass2026" }, anonymous: true });
  record("auth", "锁定期间即使密码正确也无法登录", correct.status === 423 || correct.status === 401, `状态 ${correct.status}`);
  r = await req("POST", "/api/auth/logout", { json: {} });
  record("auth", "退出登录成功", r.status === 200, `状态 ${r.status}`);
  r = await req("GET", "/api/auth/me", {});
  record("auth", "退出后会话立即失效", r.data?.authenticated === false, safeJson(r.data).slice(0, 160));

  console.log("8) 注册接口频率限制（放最后，避免污染前述用例）");
  let limited = 0;
  for (let i = 0; i < 12; i++) {
    // 使用弱密码载荷：限流在参数校验之前计数，既能验证限流又不创建测试账号
    const res = await req("POST", "/api/auth/register", {
      json: { email: `rate_${stamp}_${i}@xungen.local`, password: "123", displayName: "限流测试", agreeTerms: true },
      anonymous: true,
    });
    if (res.status === 429) limited++;
  }
  record("rate-limit", "注册接口触发频率限制", limited > 0, `12 次中命中 ${limited} 次 429`);

  const passed = results.filter((x) => x.ok).length;
  const failed = results.length - passed;
  const report = {
    generatedAt: new Date().toISOString(),
    baseUrl: BASE,
    summary: { total: results.length, passed, failed, warnings: warnings.length },
    results,
    warnings,
    note: "本报告由真实 HTTP 请求生成。warnings 为已知遗留项的可观测护栏，不计入 passed/failed。外部依赖（S3、外部 OCR、HTTPS 证书、WAF、独立渗透测试、生产 CDN）不在本脚本覆盖范围，需在生产部署时另行验收。运行前建议执行 pnpm test:reset-limits 清理开发期限流计数。",
  };
  mkdirSync(path.dirname(OUT), { recursive: true });
  writeFileSync(OUT, JSON.stringify(report, null, 2), "utf8");
  console.log(`\n[security-audit] 通过 ${passed} 项，失败 ${failed} 项，遗留项告警 ${warnings.length} 项 → ${OUT}\n`);
  if (failed) process.exit(1);
}

main().catch((err) => { console.error("[security-audit] 运行异常：", err); process.exit(1); });
