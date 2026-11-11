-- 系统更新任务表
--
-- 注意：本文件由 `prisma migrate dev --create-only` 生成后经过人工修订。
-- Prisma 自动生成时附带 13 条 `DROP INDEX "idx_*_trgm"`，原因是这些 pg_trgm
-- GIN 索引由手写迁移 20261108021500_search_indexes 创建，而 Prisma schema 无法
-- 表达 `gin_trgm_ops` 操作符类，因此被误判为「schema 中不存在的多余索引」。
-- 直接执行会让起名、拼音、史料、帖子等 13 处模糊检索退化为全表扫描，
-- 故此处已全部剔除。后续再生成迁移时必须复查是否又出现同类 DROP。

-- CreateEnum
CREATE TYPE "UpdateStatus" AS ENUM ('QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "UpdateStage" AS ENUM ('QUEUED', 'BACKUP', 'DOWNLOAD', 'VERIFY', 'INSTALL', 'RESTART', 'DONE');

-- CreateEnum
CREATE TYPE "UpdateDriver" AS ENUM ('SOURCE', 'DOCKER', 'SIMULATE');

-- CreateTable
CREATE TABLE "update_jobs" (
    "id" UUID NOT NULL,
    "instance_id" VARCHAR(64) NOT NULL,
    "from_version" VARCHAR(40) NOT NULL,
    "target_version" VARCHAR(40) NOT NULL,
    "driver" "UpdateDriver" NOT NULL,
    "status" "UpdateStatus" NOT NULL DEFAULT 'QUEUED',
    "stage" "UpdateStage" NOT NULL DEFAULT 'QUEUED',
    "progress" INTEGER NOT NULL DEFAULT 0,
    "message" VARCHAR(500),
    "log" JSONB NOT NULL DEFAULT '[]',
    "error" TEXT,
    "artifact_path" VARCHAR(500),
    "requested_by_id" UUID,
    "active_lock" VARCHAR(16),
    "started_at" TIMESTAMP(3),
    "finished_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "update_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
-- 唯一索引即「同一时刻只允许一个活跃任务」的数据库级互斥；
-- 任务结束时 active_lock 置空，NULL 不参与唯一性比较，故历史记录不冲突。
CREATE UNIQUE INDEX "update_jobs_active_lock_key" ON "update_jobs"("active_lock");

-- CreateIndex
CREATE INDEX "update_jobs_status_created_at_idx" ON "update_jobs"("status", "created_at");

-- CreateIndex
CREATE INDEX "update_jobs_created_at_idx" ON "update_jobs"("created_at");

-- AddForeignKey
ALTER TABLE "update_jobs" ADD CONSTRAINT "update_jobs_requested_by_id_fkey" FOREIGN KEY ("requested_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
