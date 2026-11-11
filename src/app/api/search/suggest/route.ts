import { NextRequest } from "next/server";
import { ok, route, getQuery, clientIpHash } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth";
import { suggest } from "@/lib/search";
import { rateLimit } from "@/lib/cache";

export const GET = route(async (req: NextRequest) => {
  const { q } = getQuery(req);
  const user = await getCurrentUser();
  if (q.length < 1) return ok({ suggestions: [] });
  // 与 /api/search 共用同一限流键：suggest 同样调用 searchAll，不能成为绕过搜索限流的旁路
  const permit = await rateLimit(`search:${clientIpHash(req)}`, 60, 60);
  if (!permit.allowed) return ok({ suggestions: [], rateLimited: true });
  const suggestions = await suggest(q, user);
  return ok({ suggestions }, 200, { "Cache-Control": "private, max-age=60" });
});
