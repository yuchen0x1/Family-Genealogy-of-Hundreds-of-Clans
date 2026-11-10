-- 统一搜索的初始方案：pg_trgm 三元组模糊匹配 + 拼音字段。
-- 中文分词说明：PostgreSQL 内置 simple 分词器不切分中文，本阶段采用
--   (1) pg_trgm 的相似度/ILIKE 做中文子串与模糊匹配；
--   (2) 应用层把中文查询切成 2-gram，配合索引做召回；
--   (3) 预留 zhparser / Meilisearch / OpenSearch 升级路径，见 docs/ARCHITECTURE.md。
-- 注意：gin_trgm_ops 对中文按字符切分，短词（1~2 字）召回由 ILIKE 兜底。

CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS unaccent;

-- 姓氏：姓氏本体、拼音、异体字、繁体
CREATE INDEX IF NOT EXISTS idx_surnames_name_trgm        ON "surnames" USING gin ("name" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_surnames_pinyin_trgm      ON "surnames" USING gin ("pinyin" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_surnames_traditional_trgm ON "surnames" USING gin ("traditional" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_surname_variants_trgm     ON "surname_variants" USING gin ("variant" gin_trgm_ops);

-- 历史人物、地名、古籍
CREATE INDEX IF NOT EXISTS idx_hist_figures_name_trgm    ON "historical_figures" USING gin ("name" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_hist_figures_bio_trgm     ON "historical_figures" USING gin ("biography" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_hist_places_hist_trgm     ON "historical_places" USING gin ("historical_name" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_hist_places_modern_trgm   ON "historical_places" USING gin ("modern_name" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_place_aliases_trgm        ON "place_aliases" USING gin ("alias" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_hist_sources_title_trgm   ON "historical_sources" USING gin ("title" gin_trgm_ops);

-- 家族 / 人物（注意：搜索 API 必须做权限过滤，索引不绕过权限）
CREATE INDEX IF NOT EXISTS idx_families_name_trgm        ON "families" USING gin ("name" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_family_members_name_trgm  ON "family_members" USING gin ("given_name" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_family_docs_title_trgm    ON "family_documents" USING gin ("title" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_posts_title_trgm          ON "posts" USING gin ("title" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_posts_content_trgm        ON "posts" USING gin ("content" gin_trgm_ops);

-- 图谱局部加载 / 关系遍历的复合索引
CREATE INDEX IF NOT EXISTS idx_rel_family_verified       ON "family_relationships" ("family_id", "type", "verification") WHERE "deleted_at" IS NULL;
CREATE INDEX IF NOT EXISTS idx_members_family_living     ON "family_members" ("family_id", "is_living") WHERE "deleted_at" IS NULL;

-- 会话与审计的过期清理
CREATE INDEX IF NOT EXISTS idx_sessions_expires          ON "user_sessions" ("expires_at") WHERE "revoked_at" IS NULL;
