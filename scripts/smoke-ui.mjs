/**
 * 族谱前端所依赖接口 + 页面可达性的端到端冒烟测试。
 * 运行： node scripts/smoke-ui.mjs   （需要站点已启动）
 *
 * 覆盖：页面 200 → 详情权限 → 人物扩展字段/敏感字段往返 → 回收站恢复
 *       → 关系冲突明细/核实/删除 → 世代字辈/分支 → 版本备份与恢复
 *       → 协作邀请与邮箱校验 → 族谱设置更新 → 匿名越权拦截
 */
const BASE = process.env.SMOKE_BASE_URL || "http://localhost:3000";
let cookie = "";
let passed = 0;
let failed = 0;

async function call(method, path, body, expectStatus = 200, opts = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      ...(cookie && !opts.anonymous ? { Cookie: cookie } : {}),
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
  return { status: res.status, json, okStatus, data: json?.data };
}

async function page(path, expectStatus = 200) {
  const res = await fetch(`${BASE}${path}`, { headers: { ...(cookie ? { Cookie: cookie } : {}) } });
  const text = await res.text();
  return { status: res.status, okStatus: res.status === expectStatus, text };
}

function check(name, condition, detail = "") {
  if (condition) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; console.error(`  ✗ ${name} ${detail}`); }
}

async function main() {
  const stamp = Date.now();
  const email = `ui_${stamp}@xungen.local`;
  console.log(`\n[smoke-ui] 目标 ${BASE}\n`);

  console.log("1) 页面可达性");
  for (const p of ["/families", "/families/new", "/surnames", "/roots", "/login", "/register"]) {
    const r = await page(p);
    check(`页面 ${p} 返回 200`, r.okStatus, `实际 ${r.status}`);
  }

  console.log("2) 认证与族谱详情");
  let r = await call("POST", "/api/auth/register", { email, password: "UiPass2026", displayName: "界面冒烟测试", agreeTerms: true }, 201);
  check("注册成功", r.okStatus, JSON.stringify(r.json));
  r = await call("POST", "/api/families", {
    name: `界面测试家族 ${stamp}`, surnameText: "陈", hallName: "测试堂", visibility: "PRIVATE",
  }, 201);
  const familyId = r.data?.id;
  check("创建私有族谱", Boolean(familyId));
  const fpage = await page(`/families/${familyId}`);
  check("族谱详情页返回 200", fpage.okStatus, `实际 ${fpage.status}`);
  r = await call("GET", `/api/families/${familyId}`);
  check("详情返回 OWNER 权限", r.data?.access?.level === "OWNER", JSON.stringify(r.data?.access));
  check("详情包含分支/世代结构", Array.isArray(r.data?.branches) && Array.isArray(r.data?.generations));
  r = await call("GET", `/api/families/${familyId}`, undefined, 403, { anonymous: true });
  check("匿名访问私有族谱 API 被拒", r.status === 403);

  console.log("3) 人物字段与敏感资料");
  const mk = (givenName, extra = {}) => call("POST", `/api/families/${familyId}/members`, {
    surnameText: "陈", givenName, gender: "MALE", visibility: "PRIVATE", isLiving: false, ...extra,
  }, 201);
  const a = await mk("祖父", { birthYear: 1900, courtesyName: "子厚", generationNumber: 1, generationChar: "文", generationConfirmed: true, sensitiveData: "联系方式仅在家族内可见" });
  const b = await mk("父亲", { birthYear: 1930 });
  const aid = a.data?.id, bid = b.data?.id;
  check("新增两位人物", Boolean(aid && bid), JSON.stringify([a.json, b.json]));
  r = await call("GET", `/api/families/${familyId}/members`);
  const ra = r.data?.items?.find((x) => x.id === aid);
  check("协作者可见扩展编辑字段", ra?.courtesyName === "子厚" && ra?.generationNumber === 1 && ra?.generationChar === "文", JSON.stringify(ra));
  check("列表不返回加密敏感字段", !("sensitiveDataEncrypted" in (ra ?? {})) || ra?.sensitiveDataEncrypted === undefined);
  r = await call("GET", `/api/families/${familyId}/members/${aid}`);
  check("敏感字段解密往返正确", r.data?.sensitiveData === "联系方式仅在家族内可见", String(r.data?.sensitiveData));
  check("详情返回关系与文档数组", Array.isArray(r.data?.relations) && Array.isArray(r.data?.documents));
  r = await call("PATCH", `/api/families/${familyId}/members/${aid}`, { biography: "界面测试传记", courtesyName: "子安" });
  check("编辑人物成功", r.data?.biography === "界面测试传记");
  r = await call("POST", `/api/families/${familyId}/members`, {
    surnameText: "陈", givenName: "在世者", isLiving: true, visibility: "PUBLIC",
  }, 201);
  check("在世人物 PUBLIC 自动降级为 FAMILY", r.data?.visibility === "FAMILY", r.data?.visibility);
  const livingId = r.data?.id;

  console.log("4) 回收站");
  r = await call("GET", `/api/families/${familyId}/members/trash`);
  check("回收站初始为空", r.data?.total === 0);
  r = await call("DELETE", `/api/families/${familyId}/members/${livingId}`);
  check("软删除人物成功", r.data?.deleted === true);
  r = await call("GET", `/api/families/${familyId}/members/trash`);
  check("回收站出现已删人物", r.data?.total === 1);
  r = await call("POST", `/api/families/${familyId}/members/${livingId}/restore`);
  check("恢复人物成功", r.data?.restored === true);
  r = await call("GET", `/api/families/${familyId}/members`);
  check("恢复后人物重新出现在列表", Boolean(r.data?.items?.find((x) => x.id === livingId)));
  r = await call("GET", `/api/families/${familyId}/members/trash`, undefined, 401, { anonymous: true });
  check("匿名无法读取回收站", r.status === 401 || r.status === 403, `实际 ${r.status}`);

  console.log("5) 关系校验与核实");
  r = await call("POST", `/api/families/${familyId}/relationships`, {
    fromPersonId: aid, toPersonId: bid, type: "PARENT_CHILD", subtype: "BIOLOGICAL", verification: "VERIFIED",
  }, 201);
  const relId = r.data?.relation?.id;
  check("建立已核实亲子关系", Boolean(relId), JSON.stringify(r.json));
  r = await call("POST", `/api/families/${familyId}/relationships`, {
    fromPersonId: aid, toPersonId: bid, type: "PARENT_CHILD", subtype: "BIOLOGICAL",
  }, 409);
  check("重复关系被拦截且带错误明细", r.status === 409 && Array.isArray(r.json?.error?.details?.errors), JSON.stringify(r.json?.error));
  r = await call("POST", `/api/families/${familyId}/relationships`, {
    fromPersonId: bid, toPersonId: aid, type: "PARENT_CHILD", subtype: "BIOLOGICAL",
  }, 409);
  check("反向血缘环被拦截", r.status === 409, JSON.stringify(r.json?.error));
  r = await call("GET", `/api/families/${familyId}/graph`);
  check("图谱返回节点与已核实边", r.data?.nodes?.length >= 2 && r.data?.edges?.length >= 1);
  r = await call("GET", `/api/families/${familyId}/kinship?from=${bid}&to=${aid}`);
  check("亲属称谓计算可用", typeof r.data?.term === "string", JSON.stringify(r.data));
  r = await call("PATCH", `/api/families/${familyId}/relationships/${relId}`, { verification: "PENDING", notes: "界面测试备注" });
  check("修改关系核实状态成功", r.data?.verification === "PENDING");
  r = await call("PATCH", `/api/families/${familyId}/relationships/${relId}`, { verification: "VERIFIED" });
  check("重新标记为已核实成功", r.data?.verification === "VERIFIED");
  r = await call("DELETE", `/api/families/${familyId}/relationships/${relId}`);
  check("删除关系成功", r.data?.deleted === true);

  console.log("6) 世代 / 字辈诗 / 分支");
  r = await call("POST", `/api/families/${familyId}/generations`, {
    generationNumber: 1, generationChar: "文", poemLine: "文章华国", notes: "界面测试",
  });
  check("登记世代字辈", r.data?.generationNumber === 1);
  r = await call("POST", `/api/families/${familyId}/poems`, {
    title: "界面测试派语", content: "文章华国，诗礼传家", sourceText: "测试数据",
  }, 201);
  check("录入字辈诗且默认待审核", r.data?.reviewStatus === "PENDING" && r.data?.characters?.length === 8, JSON.stringify(r.data?.characters));
  r = await call("POST", `/api/families/${familyId}/branches`, { name: "长房", rootPersonId: aid }, 201);
  check("创建分支", r.data?.name === "长房");
  r = await call("GET", `/api/families/${familyId}/generations`);
  check("世代列表与字辈诗可查询", r.data?.generations?.length === 1 && r.data?.poems?.length === 1);

  console.log("7) 版本备份与恢复");
  r = await call("GET", `/api/families/${familyId}/versions`);
  check("存在自动生成的版本快照", r.data?.length >= 1);
  r = await call("POST", `/api/families/${familyId}/versions`, { label: "界面测试备份", changeSummary: "冒烟测试" }, 201);
  check("手动创建备份", Boolean(r.data?.id));
  const versionId = r.data?.id;
  r = await call("POST", `/api/families/${familyId}/versions/${versionId}/restore`, { confirm: "NO" }, 422);
  check("缺少 RESTORE 确认被拒", r.status === 422 || r.status === 400, `实际 ${r.status}`);
  r = await call("POST", `/api/families/${familyId}/versions/${versionId}/restore`, { confirm: "RESTORE" });
  check("恢复版本成功并自动备份", r.data?.backupVersion > 0, JSON.stringify(r.data));
  r = await call("GET", `/api/families/${familyId}/members`);
  check("恢复后人物仍在", r.data?.total >= 3, String(r.data?.total));

  console.log("8) 协作邀请与隐私");
  const publicList = await call("GET", "/api/families", undefined, 200, { anonymous: true });
  const demo = publicList.data?.items?.find((f) => f.isDemo) ?? publicList.data?.items?.[0];
  if (demo) {
    r = await call("GET", `/api/families/${demo.id}/collaborators`, undefined, 200, { anonymous: true });
    check("匿名读公开族谱协作名单被裁剪", r.data?.restricted === true && r.data?.collaborators?.length === 0, JSON.stringify(r.data));
    check("匿名响应不含成员邮箱", !JSON.stringify(r.data).includes("@"));
  } else {
    check("存在可供校验的公开族谱", false, "公开列表为空");
  }
  const inviteEmail = `invitee_${stamp}@xungen.local`;
  r = await call("POST", `/api/families/${familyId}/collaborators`, { email: inviteEmail, permission: "EDITOR" }, 201);
  const inviteUrl = r.data?.invitationUrl;
  check("生成邀请链接", typeof inviteUrl === "string" && inviteUrl.includes("/invitations/"), JSON.stringify(r.data));
  const token = inviteUrl?.split("/invitations/")[1];
  const invPage = await page(`/invitations/${token}`);
  check("邀请页面返回 200", invPage.okStatus, `实际 ${invPage.status}`);
  r = await call("GET", `/api/invitations/${token}`);
  check("邀请详情邮箱正确", r.data?.email === inviteEmail);
  r = await call("POST", `/api/invitations/${token}`, undefined, 403);
  check("当前账号邮箱不一致时拒绝接受", r.status === 403, JSON.stringify(r.json?.error));
  r = await call("GET", `/api/families/${familyId}/collaborators`);
  check("协作者名单含所有者", r.data?.collaborators?.length >= 1);
  check("待接受邀请可见", r.data?.invitations?.length >= 1);

  console.log("9) 族谱设置");
  r = await call("PATCH", `/api/families/${familyId}`, { name: `已更新家族 ${stamp}`, visibility: "PUBLIC" });
  check("更新名称与可见范围", r.data?.name?.startsWith("已更新家族") && r.data?.visibility === "PUBLIC");
  r = await call("GET", `/api/families/${familyId}`, undefined, 200, { anonymous: true });
  check("公开后匿名可读", r.okStatus && r.data?.access?.level === null);
  r = await call("GET", `/api/families/${familyId}/members`, undefined, 200, { anonymous: true });
  check("匿名读取人物列表不含扩展字段与敏感资料", !JSON.stringify(r.data?.items ?? []).includes("sensitiveData") && r.data?.items?.every((x) => x.courtesyName === undefined), JSON.stringify(r.data?.items?.[0]));
  r = await call("PATCH", `/api/families/${familyId}`, { visibility: "PRIVATE" });
  check("可改回私有", r.data?.visibility === "PRIVATE");

  console.log(`\n[smoke-ui] 通过 ${passed} 项，失败 ${failed} 项\n`);
  if (failed > 0) process.exit(1);
}

main().catch((err) => { console.error("[smoke-ui] 运行异常:", err); process.exit(1); });
