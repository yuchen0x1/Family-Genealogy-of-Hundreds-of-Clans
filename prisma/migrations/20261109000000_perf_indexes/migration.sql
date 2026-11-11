-- Performance indexes: feed ordering, author lookups, duplicate-report check, incoming clan requests
CREATE INDEX "posts_status_created_at_idx" ON "posts"("status", "created_at");
CREATE INDEX "posts_author_id_idx" ON "posts"("author_id");
CREATE INDEX "comments_author_id_idx" ON "comments"("author_id");
CREATE INDEX "reports_reporter_id_target_type_target_id_idx" ON "reports"("reporter_id", "target_type", "target_id");
CREATE INDEX "friendships_addressee_id_status_idx" ON "friendships"("addressee_id", "status");
