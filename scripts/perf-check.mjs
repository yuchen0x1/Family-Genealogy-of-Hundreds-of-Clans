/**
 * 性能基线检查（对运行中的站点发起真实请求）。
 * 运行： node scripts/perf-check.mjs
 * 输出： reports/perf-report.json
 *
 * 说明：这是开发机单实例基线，不是生产压测。生产环境应在部署后按真实并发量重新测量。
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const BASE = process.env.SMOKE_BASE_URL || "http://localhost:3000";
const OUT = path.join(process.cwd(), "reports", "perf-report.json");

function stats(values) {
  const s = [...values].sort((a, b) => a - b);
  if (!s.length) return { count: 0, min: 0, p50: 0, p95: 0, max: 0, avg: 0 };
  return {
    count: s.length,
    min: Math.round(s[0]),
    p50: Math.round(s[Math.floor(s.length * 0.5)]),
    p95: Math.round(s[Math.min(s.length - 1, Math.floor(s.length * 0.95))]),
    max: Math.round(s[s.length - 1]),
    avg: Math.round(s.reduce((a, b) => a + b, 0) / s.length),
  };
}

async function timed(label, url, opts = {}) {
  const t0 = performance.now();
  const res = await fetch(`${BASE}${url}`, { ...opts, headers: { ...(opts.headers ?? {}) } });
  const ms = performance.now() - t0;
  await res.arrayBuffer().catch(() => undefined);
  return { label, url, status: res.status, ms: Math.round(ms), bytes: res.headers.get("content-length") };
}

async function main() {
  console.log(`\n[perf-check] 目标 ${BASE}\n`);
  const endpoints = [
    ["首页", "/"], ["姓氏列表", "/surnames"], ["姓氏详情", "/surnames/%E6%9D%8E"],
    ["历史寻根", "/roots"], ["族谱中心", "/families"], ["宗亲社区", "/community"],
    ["统一搜索 API", "/api/search?q=%E9%99%88"], ["姓氏 API", "/api/surnames?pageSize=20"],
    ["地名 API", "/api/places"], ["迁徙 API", "/api/migrations"], ["帖子流 API", "/api/posts?pageSize=12"],
  ];
  // dev 模式页面是按需编译的，首次请求含编译耗时；先全部预热一次，基线只统计稳态请求
  console.log("0) 预热（排除 Next.js dev 首次按需编译开销）");
  for (const [, url] of endpoints) await timed("预热", url);
  console.log(`  ✓ ${endpoints.length} 个端点已预热`);

  const sequential = [];
  console.log("1) 顺序请求（每端点 3 次）");
  for (const [label, url] of endpoints) {
    const runs = [];
    for (let i = 0; i < 3; i++) runs.push(await timed(label, url));
    const s = stats(runs.map((r) => r.ms));
    const ok = runs.every((r) => r.status === 200);
    sequential.push({ label, url, ok, ...s });
    console.log(`  ${ok ? "✓" : "✗"} ${label.padEnd(14)} p50 ${String(s.p50).padStart(5)}ms  p95 ${String(s.p95).padStart(5)}ms  max ${String(s.max).padStart(5)}ms`);
  }

  console.log("2) 并发读取（20 并发 × 3 轮，混合只读端点）");
  // 轮换端点，避免 60 次集中打在同一限流桶（search 为 60 次/分钟）上把正常限流误判为性能故障
  const concurrentEndpoints = [
    "/api/surnames?pageSize=20",
    "/api/posts?pageSize=12",
    "/api/places",
    "/api/migrations",
    "/api/search?q=%E6%9D%8E",
  ];
  const concurrentSamples = [];
  let failed = 0;
  for (let round = 0; round < 3; round++) {
    const tasks = Array.from({ length: 20 }, (_, i) =>
      timed(`并发读取 ${i % concurrentEndpoints.length}`, concurrentEndpoints[i % concurrentEndpoints.length]));
    const results = await Promise.all(tasks);
    for (const r of results) { concurrentSamples.push(r.ms); if (r.status !== 200) failed++; }
  }
  const cs = stats(concurrentSamples);
  console.log(`  ${failed === 0 ? "✓" : "✗"} 60 次并发：成功 ${concurrentSamples.length - failed}，失败 ${failed}，p50 ${cs.p50}ms，p95 ${cs.p95}ms，max ${cs.max}ms`);

  console.log("3) 图谱按需加载与导出");
  let graphLimit = null;
  let exportTimes = null;
  const familiesRes = await fetch(`${BASE}/api/families?pageSize=20`);
  const familiesJson = await familiesRes.json().catch(() => ({}));
  const publicFamily = familiesJson?.data?.items?.find((f) => f.visibility === "PUBLIC") ?? familiesJson?.data?.items?.[0];
  if (publicFamily) {
    const g = await timed("图谱加载", `/api/families/${publicFamily.id}/graph?up=3&down=3`);
    const body = await (await fetch(`${BASE}/api/families/${publicFamily.id}/graph?up=3&down=3`)).json().catch(() => ({}));
    graphLimit = {
      status: g.status, ms: g.ms,
      nodes: Array.isArray(body?.data?.nodes) ? body.data.nodes.length : null,
      edges: Array.isArray(body?.data?.edges) ? body.data.edges.length : null,
      cap: 200,
      withinCap: (body?.data?.nodes?.length ?? 0) <= 200,
    };
    console.log(`  ✓ 图谱局部加载 ${g.ms}ms，节点 ${graphLimit.nodes}，边 ${graphLimit.edges}（上限 ${graphLimit.cap}）`);
  } else {
    console.log("  · 无公开族谱，跳过图谱检查");
  }

  const login = await fetch(`${BASE}/api/auth/login`, {
    method: "POST", headers: { "Content-Type": "application/json", Origin: BASE },
    body: JSON.stringify({ email: "demo@xungen.local", password: "Demo_Xungen_2026" }),
  });
  const setCookie = (login.headers.getSetCookie?.() ?? []).map((c) => c.split(";")[0]).find((c) => c.startsWith("xungen_session="));
  if (setCookie && publicFamily) {
    const runs = [];
    for (const fmt of ["JSON", "GEDCOM551", "SVG", "PNG", "PDF"]) {
      const t = await timed(`导出 ${fmt}`, `/api/families/${publicFamily.id}/export?format=${fmt}`, {
        method: "POST", headers: { Cookie: setCookie, Origin: BASE, "Content-Type": "application/json" }, body: "{}",
      });
      runs.push(t);
    }
    exportTimes = runs.map((r) => ({ format: r.label.replace("导出 ", ""), status: r.status, ms: r.ms }));
    console.log(`  ${runs.every((r) => r.status === 200 || r.status === 403) ? "✓" : "✗"} 5 种导出耗时：${runs.map((r) => `${r.label.replace("导出 ", "")} ${r.ms}ms`).join("，")}`);
  } else {
    console.log("  · 演示账号登录或公开族谱不可用，跳过导出耗时检查");
  }

  const report = {
    generatedAt: new Date().toISOString(),
    baseUrl: BASE,
    environment: "本地开发单实例（Next.js dev + 本地 PostgreSQL 17 + Redis）",
    warmup: { endpoints: endpoints.length, note: "每个端点预热 1 次，排除 dev 模式首次按需编译耗时；统计只含稳态请求。" },
    thresholds: { sequentialP95Ms: 5000, graphNodeCap: 200 },
    sequential,
    concurrent: { ...cs, total: concurrentSamples.length, failed },
    graphLimit,
    exportTimes,
    note: "开发机基线：预热后统计，仍为 dev 模式，生产需以 next build + next start 重新测量。图谱样本为 seed 公开族谱（节点数少），局部加载上限由服务端 buildPartialGraph 的 MAX_GRAPH_NODES=200 控制，不以单次样本节点数作为上限验证。",
  };
  mkdirSync(path.dirname(OUT), { recursive: true });
  writeFileSync(OUT, JSON.stringify(report, null, 2), "utf8");
  const slow = sequential.filter((x) => !x.ok || x.p95 > 5000);
  const anomalies = slow.length + (failed > 0 ? 1 : 0);
  console.log(`\n[perf-check] 完成 → ${OUT}；异常端点 ${slow.length} 个，并发失败 ${failed} 次\n`);
  if (anomalies) process.exit(1);
}

main().catch((err) => { console.error("[perf-check] 运行异常：", err); process.exit(1); });
