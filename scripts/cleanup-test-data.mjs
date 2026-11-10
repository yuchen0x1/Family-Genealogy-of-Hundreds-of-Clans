/**
 * 清理冒烟 / E2E 测试留下的数据。
 *
 * 背景：`scripts/smoke*.mjs` 与 Playwright 用例会创建族谱与帖子。早期版本没有收尾，
 * 其中 `smoke-archive` 为了验证匿名可见性把族谱改成了 PUBLIC 且未改回，
 * 导致测试家族出现在站点公开列表与社区流里。
 *
 * 本脚本只做**软删除**（写 `deleted_at` / `status`），不物理删除任何行，
 * 因此可以随时把 `deleted_at` 置回 NULL 恢复。默认 dry-run，必须显式 `--apply` 才执行。
 *
 * 用法：
 *   node scripts/cleanup-test-data.mjs                # 只统计，不修改
 *   node scripts/cleanup-test-data.mjs --apply        # 实际执行
 *   node scripts/cleanup-test-data.mjs --apply --older-than-days 0
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { Client } from "pg";

/* ---------------- 配置 ---------------- */

/** 测试族谱名称前缀（与各 smoke / e2e 脚本保持一致） */
const FAMILY_PREFIXES = [
  "档案测试家族",
  "冒烟测试家族",
  "界面测试家族",
  "已更新家族",
  "社区测试族谱",
  "后台隐私测试族谱",
  "E2E 测试族谱",
  "安全测试私有族谱",
  "注销测试私有族谱",
  "重复检测验证",
  "重复核对 UI",
  "规模验证",
  "隐私统计验证",
  "别名规模验证",
];

/** 测试帖子标题前缀 */
const POST_PREFIXES = [
  "【测试】",
  "【E2E】",
  "【安全审计】",
  "【注销测试】",
  "隐私标记",
  "缺依据的家族可见帖",
];

/* ---------------- 参数 ---------------- */

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const quiet = args.includes("--quiet");

const olderIdx = args.indexOf("--older-than-days");
const olderThanDays = olderIdx >= 0 ? Number(args[olderIdx + 1] ?? 0) : 0;

/* ---------------- 环境变量 ---------------- */

/** 从 .env 读取 DATABASE_URL（不引入 dotenv 依赖） */
function loadDatabaseUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const envPath = path.join(process.cwd(), ".env");
  try {
    const text = readFileSync(envPath, "utf8");
    for (const line of text.split(/\r?\n/)) {
      const m = /^\s*DATABASE_URL\s*=\s*(.*)\s*$/.exec(line);
      if (m) return m[1].trim().replace(/^["']|["']$/g, "");
    }
  } catch {
    /* 没有 .env 时交给下面报错 */
  }
  return "";
}

const connectionString = loadDatabaseUrl();
if (!connectionString) {
  console.error("未找到 DATABASE_URL（环境变量或 .env）");
  process.exit(2);
}

/* ---------------- 执行 ---------------- */

const likeAny = (column, prefixes) =>
  prefixes.map((_, i) => `${column} LIKE $${i + 1}`).join(" OR ");
const likeParams = (prefixes) => prefixes.map((p) => `${p}%`);

const client = new Client({ connectionString });

try {
  await client.connect();

  // 时间过滤：默认只处理「已经存在一段时间」的行，避免误伤正在运行的测试
  const cutoff = new Date(Date.now() - olderThanDays * 24 * 60 * 60 * 1000);

  const familyWhere = `deleted_at IS NULL AND (${likeAny("name", FAMILY_PREFIXES)}) AND created_at < $${FAMILY_PREFIXES.length + 1}`;
  const familyParams = [...likeParams(FAMILY_PREFIXES), cutoff];

  const postWhere = `deleted_at IS NULL AND (${likeAny("title", POST_PREFIXES)}) AND created_at < $${POST_PREFIXES.length + 1}`;
  const postParams = [...likeParams(POST_PREFIXES), cutoff];

  const fam = await client.query(
    `SELECT count(*)::int AS n, count(*) FILTER (WHERE visibility = 'PUBLIC')::int AS pub FROM families WHERE ${familyWhere}`,
    familyParams,
  );
  const post = await client.query(
    `SELECT count(*)::int AS n, count(*) FILTER (WHERE visibility = 'PUBLIC')::int AS pub FROM posts WHERE ${postWhere}`,
    postParams,
  );

  const famStats = fam.rows[0];
  const postStats = post.rows[0];

  if (!quiet) {
    console.log(`测试族谱：${famStats.n} 个（其中 PUBLIC ${famStats.pub} 个）`);
    console.log(`测试帖子：${postStats.n} 条（其中 PUBLIC ${postStats.pub} 条）`);
  }

  if (!apply) {
    if (!quiet) {
      console.log("\n[dry-run] 未修改任何数据。加 --apply 执行软删除。");
    }
    process.exit(0);
  }

  if (famStats.n === 0 && postStats.n === 0) {
    if (!quiet) console.log("没有需要清理的数据。");
    process.exit(0);
  }

  // 先降级可见性：即使后续步骤失败，也不会再出现在公开列表
  await client.query(
    `UPDATE families SET visibility = 'PRIVATE', updated_at = now() WHERE ${familyWhere}`,
    familyParams,
  );
  await client.query(
    `UPDATE posts SET visibility = 'PRIVATE', updated_at = now() WHERE ${postWhere}`,
    postParams,
  );

  // 再软删除（可恢复）
  const famDel = await client.query(
    `UPDATE families SET deleted_at = now(), updated_at = now() WHERE ${familyWhere} RETURNING id`,
    familyParams,
  );
  const postDel = await client.query(
    `UPDATE posts SET deleted_at = now(), status = 'REMOVED', updated_at = now() WHERE ${postWhere} RETURNING id`,
    postParams,
  );

  console.log(`已软删除测试族谱 ${famDel.rowCount} 个、测试帖子 ${postDel.rowCount} 条。`);
  console.log("恢复方式：把对应行的 deleted_at 置回 NULL（族谱）或 NULL 且 status='PUBLISHED'（帖子）。");
} catch (err) {
  console.error("清理失败：", err.message);
  process.exit(1);
} finally {
  await client.end().catch(() => {});
}