# 中华寻根 · 百家族谱 — 生产镜像
# 使用完整 node_modules + next start（而非 standalone），确保 Prisma CLI 与迁移脚本在容器内可直接运行。
# 构建产物与本机 `pnpm build && pnpm start` 走同一条启动路径，便于在无 Docker 的环境验证。
FROM node:22-bookworm-slim AS base
RUN apt-get update \
 && apt-get install -y --no-install-recommends openssl ca-certificates \
 && rm -rf /var/lib/apt/lists/*
# 与 package.json 的 packageManager (pnpm@11.20.0) 及 CI 的 pnpm/action-setup 保持一致
RUN corepack enable && corepack prepare pnpm@11.20.0 --activate
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY prisma ./prisma
RUN pnpm install --frozen-lockfile

FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm exec prisma generate && pnpm build

FROM base AS runner
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    TRUST_PROXY=true \
    UPLOAD_DIR=/app/.storage/uploads \
    BACKUP_DIR=/app/backups
RUN groupadd -g 1001 nodejs \
 && useradd -u 1001 -g nodejs -m nextjs \
 && mkdir -p /app/.storage/uploads /app/backups \
 && chown -R nextjs:nodejs /app
COPY --from=builder --chown=nextjs:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nextjs:nodejs /app/.next ./.next
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/prisma ./prisma
COPY --from=builder --chown=nextjs:nodejs /app/scripts ./scripts
COPY --from=builder --chown=nextjs:nodejs /app/package.json /app/pnpm-lock.yaml /app/pnpm-workspace.yaml /app/.npmrc /app/next.config.ts ./
USER nextjs
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
# 启动时应用迁移；seed 不自动执行，由运维显式运行 `docker compose run --rm app pnpm db:seed`
CMD ["sh", "-c", "pnpm exec prisma migrate deploy && pnpm start"]
