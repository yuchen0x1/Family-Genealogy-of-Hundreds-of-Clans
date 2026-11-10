-- 人物检索：为姓氏建立 pg_trgm GIN 索引。
--
-- 背景：家族人物列表的关键词搜索原本只匹配 given_name（名），按姓氏
-- （如输入「陈」）、字号、别名都搜不到人。接口已改为 OR 匹配
-- surname_text / given_name / courtesy_name / alias 四个字段。
--
-- 索引策略：
--   * given_name 已有 idx_family_members_name_trgm（20261108021500_search_indexes）
--   * 本次为 surname_text 补同一类 trgm 索引，避免「按姓氏搜索」退化为全表扫描
--   * courtesy_name / alias 为可选字段、基数低且多为 NULL，暂不单独建索引：
--     OR 查询中前三列已能大幅收敛，额外索引的维护成本高于收益
--
-- 注意：与既有 trgm 索引一样，本索引由手写迁移创建（Prisma schema 无法表达
-- gin_trgm_ops 操作符类），后续执行 `prisma migrate dev` 生成新迁移时，
-- 必须复查是否又出现 `DROP INDEX idx_*_trgm`，出现则手工剔除。

CREATE INDEX IF NOT EXISTS idx_family_members_surname_trgm
  ON "family_members" USING gin ("surname_text" gin_trgm_ops);