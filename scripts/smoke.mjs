/**
 * 端到端 HTTP 冒烟测试（需要本地站点已启动，默认 http://localhost:3000）
 * 运行： node scripts/smoke.mjs
 *
 * 覆盖：注册登录 → 创建私有族谱 → 增删查改人物 → 关系校验（含循环拦截）
 *       → 图谱按需加载 → 亲属称谓计算 → 软删除与恢复 → 版本快照 → 隐私越权拦截
 */
const BASE = process.env.SMOKE_BASE_URL || "http://localhost:3000";
let cookie = "";
let passed = 0;
let failed = 0;

async function call(method, path, body, expectStatus = 200) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      ...(cookie ? { Cookie: cookie } : {}),
      Origin: BASE,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const setCookie = res.headers.getSetCookie?.() ?? [];
  for (const c of setCookie) {
    const [pair] = c.split(";");
    if (pair.startsWith("xungen_session=")) cookie = pair;
  }
  const json = await res.json().catch(() => ({}));
  const okStatus = Array.isArray(expectStatus) ? expectStatus.includes(res.status) : res.status === expectStatus;
  return { status: res.status, json, okStatus };
}

function check(name, condition, detail = "") {
  if (condition) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; console.error(`  ✗ ${name} ${detail}`); }
}

async function main() {
  const stamp = Date.now();
  const email = `smoke_${stamp}@xungen.local`;
  console.log(`\n[smoke] 目标 ${BASE}\n`);

  console.log("1) 认证");
  let r = await call("POST", "/api/auth/register", { email, password: "SmokePass2026", displayName: "冒烟测试", agreeTerms: true }, 201);
  check("注册成功", r.okStatus, JSON.stringify(r.json));
  check("返回用户 ID", Boolean(r.json?.data?.id));
  r = await call("GET", "/api/auth/me");
  check("会话恢复成功", r.json?.data?.authenticated === true);

  console.log("2) 家族");
  r = await call("POST", "/api/families", {
    name: `冒烟测试家族 ${stamp}`, surnameText: "李", ancestralHome: "甘肃省定西市临洮县（测试）", visibility: "PRIVATE",
  }, 201);
  const familyId = r.json?.data?.id;
  check("创建私有族谱", Boolean(familyId), JSON.stringify(r.json));
  check("默认/指定为 PRIVATE", r.json?.data?.visibility === "PRIVATE");

  r = await call("GET", "/api/families");
  check("匿名公开列表不含私有族谱", !JSON.stringify(r.json).includes(familyId));
  r = await call("GET", "/api/families?mine=1");
  check("我的族谱包含新建家族", JSON.stringify(r.json).includes(familyId));

  console.log("3) 人物");
  const mk = (givenName, gender, birthYear, isLiving = true) =>
    call("POST", `/api/families/${familyId}/members`, { surnameText: "李", givenName, gender, birthYear, isLiving, visibility: "PRIVATE" }, 201);
  const grandpa = await mk("祖父", "MALE", 1900, false);
  const father = await mk("父亲", "MALE", 1930, false);
  const me = await mk("本人", "MALE", 1960, true);
  check("新增 3 位人物", [grandpa, father, me].every((x) => x.json?.data?.id));
  const [gId, fId, mId] = [grandpa, father, me].map((x) => x.json.data.id);

  r = await call("GET", `/api/families/${familyId}/members`);
  check("人物列表共 3 位", r.json?.data?.total === 3, JSON.stringify(r.json?.data?.total));
  r = await call("PATCH", `/api/families/${familyId}/members/${mId}`, { biography: "冒烟测试传记" });
  check("编辑人物成功", r.json?.data?.biography === "冒烟测试传记");

  console.log("4) 关系与冲突检测");
  const rel = (from, to, type = "PARENT_CHILD", subtype = "BIOLOGICAL", verification = "VERIFIED") =>
    call("POST", `/api/families/${familyId}/relationships`, { fromPersonId: from, toPersonId: to, type, subtype, verification, evidenceLevel: "DOCUMENTED" }, 201);
  r = await rel(gId, fId);
  check("祖父 → 父亲 亲子关系", r.okStatus, JSON.stringify(r.json));
  r = await rel(fId, mId);
  check("父亲 → 本人 亲子关系", r.okStatus, JSON.stringify(r.json));
  r = await rel(gId, fId);
  check("重复关系被拒绝", r.status === 409, `status=${r.status}`);
  r = await rel(mId, gId);
  check("血缘循环被拦截", r.status === 409 && r.json?.error?.code === "RELATIONSHIP_CONFLICT", JSON.stringify(r.json));

  console.log("5) 图谱与亲属称谓");
  r = await call("GET", `/api/families/${familyId}/graph?focus=${mId}&up=3&down=2`);
  check("图谱返回节点", (r.json?.data?.nodes?.length ?? 0) >= 3, JSON.stringify(r.json?.data?.nodes?.length));
  check("图谱返回关系边", (r.json?.data?.edges?.length ?? 0) >= 2);
  r = await call("GET", `/api/families/${familyId}/kinship?from=${mId}&to=${fId}`);
  check("本人 → 父亲 = 父亲", r.json?.data?.term === "父亲", JSON.stringify(r.json?.data?.term));
  r = await call("GET", `/api/families/${familyId}/kinship?from=${mId}&to=${gId}`);
  check("本人 → 祖父 = 祖父/爷爷", String(r.json?.data?.term).includes("祖父"), JSON.stringify(r.json?.data?.term));
  r = await call("GET", `/api/families/${familyId}/kinship?ancestors=${mId}`);
  check("祖先追溯含 2 代", (r.json?.data?.groups?.length ?? 0) >= 2);

  console.log("6) 软删除与恢复");
  r = await call("DELETE", `/api/families/${familyId}/members/${mId}`);
  check("软删除人物", r.json?.data?.recoverable === true);
  r = await call("GET", `/api/families/${familyId}/members`);
  check("删除后列表剩 2 位", r.json?.data?.total === 2);
  r = await call("POST", `/api/families/${familyId}/members/${mId}/restore`, {});
  check("恢复人物", r.json?.data?.restored === true);
  r = await call("GET", `/api/families/${familyId}/members`);
  check("恢复后列表回到 3 位", r.json?.data?.total === 3);

  console.log("7) 版本与权限");
  r = await call("GET", `/api/families/${familyId}/versions`);
  check("自动生成版本快照", (r.json?.data?.length ?? 0) >= 3, `count=${r.json?.data?.length}`);
  r = await call("POST", `/api/families/${familyId}/versions`, { label: "冒烟测试手动备份" }, 201);
  check("手动创建版本", Boolean(r.json?.data?.versionNumber));

  const savedCookie = cookie;
  cookie = "";
  r = await call("GET", `/api/families/${familyId}`, undefined, 403);
  check("匿名访问私有族谱被拒", r.status === 403, `status=${r.status}`);
  r = await call("GET", `/api/families/${familyId}/graph`);
  check("匿名访问私有图谱被拒", r.status === 403, `status=${r.status}`);
  cookie = savedCookie;

  // 软删除本次创建的测试族谱，避免长期堆积在「我的族谱」里（可由所有者恢复）。
  console.log("清理测试数据");
  r = await call("DELETE", `/api/families/${familyId}`);
  check("软删除测试族谱", r.status === 200, `status=${r.status}`);

  console.log(`\n[smoke] 通过 ${passed} 项，失败 ${failed} 项\n`);
  if (failed > 0) process.exit(1);
}

main().catch((e) => { console.error("[smoke] 异常:", e); process.exit(1); });
