-- Backfill: one primary lp_emails row per existing limited_partners row
-- Run this AFTER `prisma db push` has created the "lp_emails" table
-- (Part 26, WS58).
--
-- Usage:
--   psql $DATABASE_URL -f scripts/backfill-lp-emails.sql
--
-- What it does:
--   Inserts one LpEmail row (isPrimary = true) per LimitedPartner, mirroring
--   their current "email" column. Idempotent — ON CONFLICT (email) DO NOTHING
--   means re-running this is a no-op once every LP has been backfilled.

BEGIN;

INSERT INTO "lp_emails" ("id", "lpId", "email", "isPrimary", "createdAt")
SELECT gen_random_uuid()::text, "id", "email", true, now()
FROM "limited_partners"
WHERE "email" IS NOT NULL
ON CONFLICT ("email") DO NOTHING;

COMMIT;
