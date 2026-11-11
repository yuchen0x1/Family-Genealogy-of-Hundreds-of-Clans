-- 容器首次初始化时启用搜索所需扩展（migration 中亦有 CREATE EXTENSION IF NOT EXISTS，双保险）。
-- PostGIS 目前未启用：迁徙地图使用本地合规行政区划 GeoJSON，不依赖空间数据库扩展。
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS unaccent;
