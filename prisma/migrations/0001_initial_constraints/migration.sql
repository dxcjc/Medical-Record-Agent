-- ProviderConfig 默认配置唯一性约束：
-- Prisma schema 当前不能优雅表达 PostgreSQL partial unique index。
-- 这里仅约束 "isDefault" = true 的记录，允许同一个 kind 下存在多个非默认配置。
CREATE UNIQUE INDEX IF NOT EXISTS "ProviderConfig_one_default_per_kind"
  ON "ProviderConfig" ("kind")
  WHERE "isDefault" = true;
