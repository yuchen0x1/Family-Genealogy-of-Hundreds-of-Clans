import { NextRequest, NextResponse } from "next/server";
import { z, ZodError, ZodTypeAny } from "zod";
import { Prisma } from "@prisma/client";
import { anonymizeIp } from "./crypto";
import { rateLimit } from "./cache";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public code = "BAD_REQUEST",
    public details?: unknown,
  ) {
    super(message);
  }
}

export function ok<T>(data: T, status = 200, extraHeaders?: Record<string, string>) {
  return NextResponse.json({ ok: true, data }, { status, headers: extraHeaders });
}

export function fail(message: string, status = 400, code = "BAD_REQUEST", details?: unknown) {
  return NextResponse.json({ ok: false, error: { message, code, details } }, { status });
}

/** 统一错误处理：Zod 校验错误 / Prisma 约束错误 / 业务异常 均转为结构化响应。 */
export function handleError(error: unknown) {
  if (error instanceof ApiError) {
    return fail(error.message, error.status, error.code, error.details);
  }
  if (error instanceof ZodError) {
    return fail("请求参数校验失败", 422, "VALIDATION_ERROR", error.flatten());
  }
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    // meta 含约束名与字段名，只写日志不返回客户端，避免泄漏表结构
    if (error.code === "P2002") {
      console.warn("[api] unique constraint:", error.meta);
      return fail("数据已存在（唯一约束冲突）", 409, "CONFLICT");
    }
    if (error.code === "P2003") {
      console.warn("[api] fk constraint:", error.meta);
      return fail("关联数据不存在或无法删除", 409, "FK_CONSTRAINT");
    }
    if (error.code === "P2025") return fail("记录不存在", 404, "NOT_FOUND");
  }
  console.error("[api] unhandled:", error);
  return fail("服务器内部错误", 500, "INTERNAL_ERROR");
}

export type RouteContext<P = Record<string, string>> = { params: Promise<P> };

/**
 * 写接口兜底限流：在统一入口对所有写方法计数，防止新增 Route Handler 遗漏限流。
 *
 * 背景：此前限流完全依赖各 handler 自愿调用 assertRateLimit，53 个写接口中仅 9 个覆盖；
 * 而 docs/COMPLETION.md 的记录也说明限流是「分批补的」。把兜底收进 route() 后，
 * 任何新增写接口都自动受保护，敏感接口仍可在 handler 内叠加更严格的独立桶，二者互补。
 *
 * 未配置 TRUST_PROXY 时 clientIpHash 会把所有请求归入同一桶（更严格），因此阈值
 * 按「单实例开发/内网 + 冒烟测试批量写入」留出余量；生产多实例请接入 Redis 并配置
 * TRUST_PROXY，让每个来源 IP 独立计数。
 */
const WRITE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const WRITE_FALLBACK_LIMIT = 600;
const WRITE_FALLBACK_WINDOW_SECONDS = 60;

export function route<P = Record<string, string>>(
  handler: (req: NextRequest, ctx: RouteContext<P>) => Promise<NextResponse>,
) {
  return async (req: NextRequest, ctx: RouteContext<P>): Promise<NextResponse> => {
    try {
      if (WRITE_METHODS.has(req.method)) {
        await assertRateLimit(
          `write:${clientIpHash(req)}`,
          WRITE_FALLBACK_LIMIT,
          WRITE_FALLBACK_WINDOW_SECONDS,
        );
      }
      return await handler(req, ctx);
    } catch (error) {
      return handleError(error);
    }
  };
}

/** 返回 Zod 解析后的输出类型（含 .default() 填充后的必填字段），而非输入类型。 */
export async function parseBody<S extends ZodTypeAny>(schema: S, req: Request): Promise<z.output<S>> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    throw new ApiError(400, "请求体不是合法 JSON", "INVALID_JSON");
  }
  return schema.parse(raw);
}

export function getQuery(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  return {
    q: (p.get("q") || "").trim(),
    page: Math.max(1, Math.min(1000, Number(p.get("page")) || 1)),
    pageSize: Math.max(1, Math.min(100, Number(p.get("pageSize")) || 20)),
    params: p,
  };
}

/** CSRF 防护：对写操作校验同源 Origin；配合 SameSite=Lax Cookie。 */
export function assertSameOrigin(req: Request) {
  const origin = req.headers.get("origin");
  if (!origin) return; // 无 Origin 的同源请求（如 server action / curl）由 SameSite Cookie 兜底
  let allowed: string;
  try {
    allowed = new URL(process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000").origin;
  } catch {
    allowed = "http://localhost:3000";
  }
  const host = req.headers.get("host");
  const originUrl = new URL(origin);
  if (originUrl.origin !== allowed && originUrl.host !== host) {
    throw new ApiError(403, "跨站请求被拒绝", "CSRF_REJECTED");
  }
}

/**
 * 客户端 IP 脱敏摘要，用于限流与审计。
 * 安全：默认不信任客户端可自行伪造的 X-Forwarded-For（否则攻击者可无限生成限流键绕过限流）。
 * 只有在部署了会覆盖该头的反向代理、并显式设置 TRUST_PROXY=true 时才读取真实来源 IP；
 * 未配置时所有请求归入同一限流桶（更严格，适合单实例开发/内网部署）。
 */
export function clientIpHash(req: Request): string {
  const trustProxy = process.env.TRUST_PROXY === "true";
  const forwarded = trustProxy ? req.headers.get("x-forwarded-for")?.split(",")[0].trim() : null;
  const ip = forwarded || (trustProxy ? req.headers.get("x-real-ip") : null) || "unknown";
  return anonymizeIp(ip);
}

export function paginate<T>(items: T[], total: number, page: number, pageSize: number) {
  return { items, total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
}

/**
 * 限流断言：超限抛 429。
 * 所有写接口已由 route() 统一兜底限流；敏感接口可在 handler 内再叠加更严格的独立桶。
 * 限流键由调用方显式给出（IP 摘要、用户 ID、业务键等），本函数不隐式读取用户身份。
 */
export async function assertRateLimit(key: string, limit: number, windowSeconds: number) {
  const permit = await rateLimit(key, limit, windowSeconds);
  if (!permit.allowed) throw new ApiError(429, "操作过于频繁，请稍后再试", "RATE_LIMITED");
}
