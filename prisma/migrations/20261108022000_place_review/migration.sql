-- 历史地名同属史料记录，需具备审核状态
ALTER TABLE "historical_places"
  ADD COLUMN IF NOT EXISTS "review_status" "ReviewStatus" NOT NULL DEFAULT 'PENDING';

CREATE INDEX IF NOT EXISTS idx_hist_places_review
  ON "historical_places" ("review_status") WHERE "deleted_at" IS NULL;
