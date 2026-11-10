/**
 * 阶段 8 端到端冒烟测试：家族档案中心 + 导入导出。
 * 运行： node scripts/smoke-archive.mjs   （需站点与数据库已启动）
 *
 * 覆盖：上传安全（伪装文件/MIME/扩展名）→ 非公开存储 → 受控下载与匿名拦截
 *       → 版本管理 → OCR 外部依赖明确报错 / 人工录入不产生关系
 *       → 档案-人物关联与跨家族拦截 → 审核与可见性
 *       → 7 种导出格式的真实字节与魔数 → 敏感字段不导出 → 匿名导出拦截
 *       → 导入预览不落库 → 查重/冲突/缺字段报告 → 显式确认才写入
 *       → 导入事务中的生物学父母上限与悬空引用 → 重复提交拦截
 */
import { existsSync, readdirSync } from "node:fs";
import path from "node:path";

const BASE = process.env.SMOKE_BASE_URL || "http://localhost:3000";
const ROOT = process.cwd();
let cookie = "";
let passed = 0;
let failed = 0;

async function request(method, url, opts = {}) {
  const { json, form, anonymous, raw } = opts;
  const headers = { Origin: BASE };
  if (!anonymous && cookie) headers.Cookie = cookie;
  if (json !== undefined) headers["Content-Type"] = "application/json";
  const res = await fetch(`${BASE}${url}`, {
    method,
    headers,
    body: form ?? (json === undefined ? undefined : JSON.stringify(json)),
  });
  for (const c of res.headers.getSetCookie?.() ?? []) {
    const [pair] = c.split(";");
    if (pair.startsWith("xungen_session=")) cookie = pair;
  }
  if (raw) {
    return { status: res.status, headers: res.headers, buf: Buffer.from(await res.arrayBuffer()) };
  }
  return { status: res.status, headers: res.headers, body: await res.json().catch(() => ({})), data: undefined };
}

/** request 的便捷包装：自动把 body.data 挂到 data 上 */
async function call(method, url, json, expectStatus = 200, opts = {}) {
  const r = await request(method, url, { ...opts, json });
  r.data = r.body?.data;
  r.okStatus = Array.isArray(expectStatus) ? expectStatus.includes(r.status) : r.status === expectStatus;
  return r;
}

function form(fields, fileName, bytes, mime) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.append(k, String(v));
  fd.append("file", new Blob([bytes], { type: mime }), fileName);
  return fd;
}

function check(name, condition, detail = "") {
  if (condition) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; console.error(`  ✗ ${name} ${detail}`); }
}

function isPng(buf) {
  return buf.length > 8 && buf[0] === 0x89 && buf.subarray(1, 4).toString("latin1") === "PNG";
}

async function main() {
  const stamp = Date.now();
  const email = `archive_${stamp}@xungen.local`;
  console.log(`\n[smoke-archive] 目标 ${BASE}\n`);

  console.log("1) 认证与族谱");
  let r = await call("POST", "/api/auth/register", {
    email, password: "ArchivePass2026", displayName: "档案冒烟测试", agreeTerms: true,
  }, 201);
  check("注册成功", r.okStatus, JSON.stringify(r.body));
  r = await call("POST", "/api/families", {
    name: `档案测试家族 ${stamp}`, surnameText: "陈", visibility: "PRIVATE",
  }, 201);
  const familyId = r.data?.id;
  check("创建私有族谱", Boolean(familyId), JSON.stringify(r.body));
  if (!familyId) { console.error("无法继续"); process.exit(1); }
  const base = `/api/families/${familyId}`;
  r = await call("POST", `${base}/members`, {
    surnameText: "陈", givenName: "档案关联人", gender: "MALE", birthYear: 1890, isLiving: false, visibility: "PRIVATE",
  }, 201);
  const personId = r.data?.id;
  check("创建用于档案关联的人物", Boolean(personId), JSON.stringify(r.body));

  console.log("2) 上传安全校验");
  const goodText = "【测试档案】陈氏族谱残页，内容为演示用占位文本，不代表真实史料。\n第二行。";
  const noFile = new FormData();
  noFile.append("title", "缺文件测试");
  const noFileRes = await fetch(`${BASE}${base}/documents`, {
    method: "POST", headers: { Origin: BASE, Cookie: cookie }, body: noFile,
  });
  check("无 file 字段返回 400 NO_FILE", noFileRes.status === 400 && (await noFileRes.json()).error?.code === "NO_FILE");

  r = await call("POST", `${base}/documents`, undefined, 400, {
    form: form({ title: "伪装 PNG" }, "fake.png", Buffer.from("this is not a png"), "image/png"),
  });
  check("伪装 PNG 被 magic bytes 检出", r.body?.error?.code === "MAGIC_MISMATCH", JSON.stringify(r.body));

  r = await call("POST", `${base}/documents`, undefined, 400, {
    form: form({ title: "MIME 不符" }, "note.txt", Buffer.from(goodText), "image/png"),
  });
  check("MIME 与扩展名不符被拒", r.body?.error?.code === "MIME_MISMATCH", JSON.stringify(r.body));

  r = await call("POST", `${base}/documents`, undefined, 400, {
    form: form({ title: "可执行扩展名" }, "evil.exe", Buffer.from("MZ"), "application/octet-stream"),
  });
  check("不支持的扩展名被拒", r.body?.error?.code === "UNSUPPORTED_FILE_TYPE", JSON.stringify(r.body));

  r = await call("POST", `${base}/documents`, undefined, 422, {
    form: form({}, "ok.txt", Buffer.from(goodText), "text/plain"),
  });
  check("缺少档案标题被拒", r.status === 422, JSON.stringify(r.body));

  r = await call("POST", `${base}/documents`, undefined, 201, {
    form: form({
      title: "【测试】陈氏族谱残页", category: "OLD_GENEALOGY", visibility: "PRIVATE",
      description: "演示用测试档案，非真实史料", sourceText: "测试来源标注（未核实）",
    }, "canpu.txt", Buffer.from(goodText), "text/plain"),
  });
  const doc = r.data;
  check("合法文本档案上传成功", r.okStatus && Boolean(doc?.id), JSON.stringify(r.body));
  check("上传返回校验和与版本 1", typeof doc?.checksum === "string" && doc.checksum.length === 64 && doc.currentVersion === 1, JSON.stringify(doc));
  check("默认审核状态为 PENDING", doc?.reviewStatus === "PENDING", doc?.reviewStatus);
  check("默认 OCR 状态为 NONE", doc?.ocrStatus === "NONE", doc?.ocrStatus);
  check("默认可见性 PRIVATE", doc?.visibility === "PRIVATE", doc?.visibility);
  const docId = doc?.id;

  console.log("3) 非公开存储与受控下载");
  const publicDir = path.join(ROOT, "public", "uploads");
  const privateDir = path.join(ROOT, ".storage", "uploads");
  let publicHasTxt = false;
  if (existsSync(publicDir)) {
    try { publicHasTxt = readdirSync(publicDir, { recursive: true }).some((f) => String(f).includes(".txt")); } catch { /* 目录不可读视为无文件 */ }
  }
  check("文件未写入 public 静态目录", !publicHasTxt);
  check("文件写入非公开存储目录", existsSync(privateDir));
  check("静态直连路径不可访问", (await request("GET", `/uploads/${docId ?? "x"}/canpu.txt`, { anonymous: true })).status === 404);

  let bin = await request("GET", `${base}/documents/${docId}/download`, { raw: true });
  check("协作者可下载且内容一致", bin.status === 200 && bin.buf.toString("utf8") === goodText, `状态 ${bin.status}`);
  check("下载响应为 attachment 且 no-store", /attachment/.test(bin.headers.get("content-disposition") || "") && /no-store/.test(bin.headers.get("cache-control") || ""));
  bin = await request("GET", `${base}/documents/${docId}/download`, { raw: true, anonymous: true });
  check("匿名下载私有家族档案被拒", bin.status === 403, `实际 ${bin.status}`);
  r = await call("GET", `${base}/documents`, undefined, 403, { anonymous: true });
  check("匿名读取私有家族档案列表被拒", r.status === 403, `实际 ${r.status}`);

  console.log("4) 版本管理");
  r = await call("GET", `${base}/documents/${docId}/versions`);
  check("版本列表包含 v1", Array.isArray(r.data) && r.data.length === 1, JSON.stringify(r.data));
  const v2Text = "【版本 2】修订后的测试文本，仍为演示数据。";
  r = await call("POST", `${base}/documents/${docId}/versions`, undefined, 201, {
    form: form({ changeNote: "冒烟测试修订" }, "canpu-v2.txt", Buffer.from(v2Text), "text/plain"),
  });
  check("上传新版本成功", r.okStatus, JSON.stringify(r.body));
  r = await call("GET", `${base}/documents/${docId}`);
  check("当前版本递增到 2", r.data?.currentVersion === 2, String(r.data?.currentVersion));
  bin = await request("GET", `${base}/documents/${docId}/download?version=1`, { raw: true });
  check("可下载历史版本 v1 原始内容", bin.status === 200 && bin.buf.toString("utf8") === goodText);
  bin = await request("GET", `${base}/documents/${docId}/download?version=2`, { raw: true });
  check("可下载当前版本 v2 修订内容", bin.status === 200 && bin.buf.toString("utf8") === v2Text);
  bin = await request("GET", `${base}/documents/${docId}/download?version=999`, { raw: true });
  check("不存在的版本返回 404", bin.status === 404, `实际 ${bin.status}`);
  bin = await request("GET", `${base}/documents/${docId}/download?version=../../etc/passwd`, { raw: true });
  check("非法版本号被拒", bin.status === 400, `实际 ${bin.status}`);

  console.log("5) OCR 外部依赖与人工校对");
  r = await call("GET", `${base}/documents/${docId}/ocr`);
  check("OCR 状态接口可用且声明 NOTICE", typeof r.data?.notice === "string" && r.data.ocrStatus === "NONE", JSON.stringify(r.body));
  r = await call("POST", `${base}/documents/${docId}/ocr`, { auto: true }, 503);
  check("未配置外部 OCR 服务时明确报错、不伪造结果", r.body?.error?.code === "OCR_NOT_CONFIGURED", JSON.stringify(r.body));
  const beforeRels = await call("GET", `${base}/relationships`);
  const relCountBefore = beforeRels.data?.items?.length ?? beforeRels.data?.length ?? 0;
  r = await call("POST", `${base}/documents/${docId}/ocr`, { text: "【人工录入】陈公讳某，配某氏，生子三人。（待人工校对，不作为亲属关系依据）" });
  check("人工录入 OCR 文本成功", r.okStatus && r.data?.ocrStatus === "DONE", JSON.stringify(r.body));
  const afterRels = await call("GET", `${base}/relationships`);
  const relCountAfter = afterRels.data?.items?.length ?? afterRels.data?.length ?? 0;
  check("OCR 文本未自动创建任何亲属关系", relCountBefore === relCountAfter, `${relCountBefore} → ${relCountAfter}`);
  r = await call("GET", `${base}/documents/${docId}/ocr`);
  check("OCR 状态更新为 DONE 且标记有文本", r.data?.ocrStatus === "DONE" && r.data?.hasText === true, JSON.stringify(r.data));

  console.log("6) 档案-人物关联与审核可见性");
  r = await call("POST", `${base}/documents/${docId}/links`, { personId, linkType: "MENTION" }, 201);
  const linkId = r.data?.id;
  check("关联人物到档案成功", Boolean(linkId), JSON.stringify(r.body));
  r = await call("POST", `${base}/documents/${docId}/links`, { personId, linkType: "MENTION" }, 409);
  check("重复关联被拒", r.status === 409, `实际 ${r.status}`);
  r = await call("POST", `${base}/documents/${docId}/links`, { personId: "00000000-0000-4000-8000-000000000000", linkType: "MENTION" }, 400);
  check("跨家族/不存在人物关联被拒", r.status === 400 && r.body?.error?.code === "INVALID_PERSON", JSON.stringify(r.body));
  r = await call("GET", `${base}/documents/${docId}/links`);
  check("关联列表可读且带人物姓名", Array.isArray(r.data) && r.data.some((x) => x.personId === personId), JSON.stringify(r.data));

  r = await call("PATCH", `${base}/documents/${docId}`, { reviewStatus: "APPROVED", visibility: "PUBLIC", title: "【测试】已审定的演示档案" });
  check("档案审核与公开设置成功", r.okStatus, JSON.stringify(r.body));
  r = await call("PATCH", base, { visibility: "PUBLIC" });
  check("家族切换为公开以验证匿名可见性", r.okStatus, JSON.stringify(r.body));
  r = await call("GET", `${base}/documents`, undefined, 200, { anonymous: true });
  check("匿名可见已审定且公开的档案", Array.isArray(r.data?.items) && r.data.items.some((x) => x.id === docId), JSON.stringify(r.data?.items?.map((x) => x.id)));
  r = await call("PATCH", `${base}/documents/${docId}`, { reviewStatus: "PENDING" });
  check("档案撤回审核状态成功", r.okStatus, JSON.stringify(r.body));
  r = await call("GET", `${base}/documents`, undefined, 200, { anonymous: true });
  check("未审定档案对匿名访客隐藏", !(r.data?.items ?? []).some((x) => x.id === docId), JSON.stringify(r.data?.items?.map((x) => x.id)));
  r = await call("DELETE", `${base}/documents/${docId}/links?linkId=${linkId}`);
  check("解除人物关联成功", r.okStatus, JSON.stringify(r.body));

  console.log("7) 七种导出格式（真实字节）");
  const cases = [
    ["JSON", "application/json", (b) => { try { const j = JSON.parse(b.toString("utf8")); return j.format === "zhonghua-xungen.genealogy" && Array.isArray(j.members); } catch { return false; } }],
    ["CSV", "text/csv", (b) => b.toString("utf8").includes("givenName") || b.toString("utf8").includes("名字")],
    ["GEDCOM551", "text/plain", (b) => b.toString("utf8").startsWith("0 HEAD") && b.toString("utf8").includes("2 VERS 5.5.1")],
    ["GEDCOM70", "text/plain", (b) => b.toString("utf8").includes("2 VERS 7.0") && b.toString("utf8").includes("1 SCHMA")],
    ["SVG", "image/svg+xml", (b) => b.toString("utf8").includes("<svg")],
    ["PNG", "image/png", isPng],
    ["PDF", "application/pdf", (b) => b.subarray(0, 5).toString("latin1") === "%PDF-"],
  ];
  let jsonBuf = Buffer.alloc(0);
  for (const [fmt, mime, verify] of cases) {
    const out = await request("POST", `${base}/export?format=${fmt}`, { json: {}, raw: true });
    const okType = (out.headers.get("content-type") || "").startsWith(mime);
    check(`导出 ${fmt} 内容正确`, out.status === 200 && okType && verify(out.buf) && out.buf.length > 20,
      `状态 ${out.status} 类型 ${out.headers.get("content-type")} 长度 ${out.buf.length} 前40字节 ${out.buf.subarray(0, 40).toString("latin1")}`);
    if (fmt === "JSON") jsonBuf = out.buf;
  }
  check("导出内容不含加密敏感字段", !jsonBuf.toString("utf8").includes("sensitiveDataEncrypted") && !jsonBuf.toString("utf8").includes("联系方式"));
  const badFmt = await request("POST", `${base}/export?format=EXE`, { json: {}, raw: true });
  check("不支持的导出格式被拒", badFmt.status === 400, `实际 ${badFmt.status}`);
  const anonExport = await request("POST", `${base}/export?format=JSON`, { json: {}, raw: true, anonymous: true });
  check("匿名访客不能批量导出人物", anonExport.status === 403, `实际 ${anonExport.status}`);

  console.log("8) 导入预览（不落库）");
  const payload = {
    members: [
      { id: "IMP1", surnameText: "陈", givenName: "导入甲", gender: "MALE", birthYear: 1901 },
      { id: "IMP2", surnameText: "陈", givenName: "导入乙", gender: "MALE", birthYear: 1931 },
      { id: "IMP3", surnameText: "陈", givenName: "导入丙", gender: "FEMALE", birthYear: 1961 },
    ],
    relationships: [
      { fromPersonId: "IMP1", toPersonId: "IMP2", type: "PARENT_CHILD", subtype: "BIOLOGICAL" },
      { fromPersonId: "IMP2", toPersonId: "IMP9", type: "PARENT_CHILD", subtype: "BIOLOGICAL" },
    ],
  };
  let before = await call("GET", `${base}/members`);
  const memberCountBefore = before.data?.total ?? before.data?.items?.length ?? 0;
  r = await call("POST", `${base}/import`, undefined, 201, {
    form: form({}, "import.json", Buffer.from(JSON.stringify(payload)), "application/json"),
  });
  const jobId = r.data?.jobId;
  const report = r.data?.report;
  check("导入预览创建任务", r.okStatus && Boolean(jobId), JSON.stringify(r.body));
  check("报告统计 3 人 2 关系", report?.counts?.persons === 3 && report?.counts?.relations === 2, JSON.stringify(report?.counts));
  check("报告标出悬空引用冲突", report?.conflicts?.some((c) => c.type === "DANGLING_REFERENCE"), JSON.stringify(report?.conflicts));
  check("报告包含不自动合并声明", report?.warnings?.some((w) => w.includes("不会因同姓或同名合并")), JSON.stringify(report?.warnings));
  check("报告 ready=true", report?.ready === true, String(report?.ready));
  before = await call("GET", `${base}/members`);
  check("预览阶段未写入任何人物", (before.data?.total ?? before.data?.items?.length ?? 0) === memberCountBefore);
  r = await call("GET", `${base}/import`);
  check("导入历史不回传完整 payload", Array.isArray(r.data) && r.data.some((j) => j.id === jobId) && !JSON.stringify(r.data).includes("导入甲"), JSON.stringify(r.data).slice(0, 200));

  r = await call("POST", `${base}/import`, undefined, 400, {
    form: form({}, "broken.json", Buffer.from("{not json"), "application/json"),
  });
  check("损坏文件解析失败返回 400", r.status === 400 && r.body?.error?.code === "PARSE_FAILED", JSON.stringify(r.body));
  r = await call("POST", `${base}/import`, undefined, 400, {
    form: form({}, "empty.json", Buffer.from("   "), "application/json"),
  });
  check("空文件被拒", r.status === 400, JSON.stringify(r.body));

  console.log("9) 导入确认与事务校验");
  r = await call("POST", `${base}/import/${jobId}/commit`, {}, 422);
  check("缺少显式确认被拒", r.status === 422 || r.status === 400, `实际 ${r.status}`);
  const otherJob = await call("POST", `${base}/import`, undefined, 201, {
    form: form({}, "skip.json", Buffer.from(JSON.stringify(payload)), "application/json"),
  });
  r = await call("POST", `${base}/import/${otherJob.data?.jobId}/commit`, { confirm: "IMPORT", skipRows: [1] });
  check("skipRows 生效（跳过第 1 行，仅创建 2 人）", r.okStatus && r.data?.createdPersons === 2, JSON.stringify(r.body));
  check("被跳过人物的悬空关系一并跳过", r.data?.createdRelations === 0, JSON.stringify(r.data));
  check("导入提示关系均为未核实", typeof r.data?.notice === "string" && r.data.notice.includes("未核实"), JSON.stringify(r.data?.notice));

  r = await call("POST", `${base}/import/${jobId}/commit`, { confirm: "IMPORT" });
  check("显式确认后写入 3 人", r.okStatus && r.data?.createdPersons === 3, JSON.stringify(r.body));
  check("悬空引用关系被跳过", (r.data?.skipped ?? []).some((s) => s.reason.includes("不存在或已被跳过")), JSON.stringify(r.data?.skipped));
  const importedRels = await call("GET", `${base}/relationships`);
  const importedList = importedRels.data?.items ?? importedRels.data ?? [];
  const unverified = importedList.filter((x) => x.notes?.includes("由导入生成"));
  check("导入关系均为 UNVERIFIED", unverified.length > 0 && unverified.every((x) => x.verification === "UNVERIFIED"), JSON.stringify(unverified.map((x) => x.verification)));
  r = await call("POST", `${base}/import/${jobId}/commit`, { confirm: "IMPORT" }, 409);
  check("重复提交同一任务被拒", r.status === 409, `实际 ${r.status}`);

  const tooManyParents = {
    members: [
      { id: "P1", surnameText: "陈", givenName: "父甲", gender: "MALE", birthYear: 1900 },
      { id: "P2", surnameText: "陈", givenName: "父乙", gender: "MALE", birthYear: 1902 },
      { id: "P3", surnameText: "陈", givenName: "母丙", gender: "FEMALE", birthYear: 1904 },
      { id: "C1", surnameText: "陈", givenName: "子丁", gender: "MALE", birthYear: 1930 },
    ],
    relationships: [
      { fromPersonId: "P1", toPersonId: "C1", type: "PARENT_CHILD", subtype: "BIOLOGICAL" },
      { fromPersonId: "P2", toPersonId: "C1", type: "PARENT_CHILD", subtype: "BIOLOGICAL" },
      { fromPersonId: "P3", toPersonId: "C1", type: "PARENT_CHILD", subtype: "BIOLOGICAL" },
    ],
  };
  const overJob = await call("POST", `${base}/import`, undefined, 201, {
    form: form({}, "parents.json", Buffer.from(JSON.stringify(tooManyParents)), "application/json"),
  });
  r = await call("POST", `${base}/import/${overJob.data?.jobId}/commit`, { confirm: "IMPORT" });
  check("第三位生物学父母被拦截（最多两位）", r.okStatus && (r.data?.skipped ?? []).some((s) => s.reason.includes("生物学父母超过两位")), JSON.stringify(r.data?.skipped));

  console.log("10) 页面可达性");
  const page = await request("GET", `/families/${familyId}`, { anonymous: true });
  check("族谱详情页（含档案/导入导出面板）返回 200", page.status === 200, `实际 ${page.status}`);

  // 本套用例为验证匿名可见性把族谱切成了 PUBLIC，若不恢复会永久污染公开族谱列表。
  // 先改回 PRIVATE，再软删除（可由所有者恢复），保证每次运行后站点状态回到原样。
  console.log("11) 清理测试数据");
  r = await call("PATCH", base, { visibility: "PRIVATE" });
  check("测试族谱恢复为私有", r.okStatus, JSON.stringify(r.body));
  r = await call("DELETE", base);
  check("测试族谱软删除", r.okStatus, JSON.stringify(r.body));

  console.log(`\n[smoke-archive] 通过 ${passed} 项，失败 ${failed} 项\n`);
  if (failed) process.exit(1);
}

main().catch((err) => { console.error("[smoke-archive] 运行异常：", err); process.exit(1); });
