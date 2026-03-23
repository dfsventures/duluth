-- Migration: role (single enum) → roles (enum array)
-- Run this against your database BEFORE running `prisma generate`.
--
-- Usage:
--   psql $DATABASE_URL -f scripts/migrate-roles.sql
--
-- What it does:
--   1. Adds the new "roles" column (UserRole[]) defaulting to {FOUNDER}
--   2. Copies the existing single "role" value into the array
--   3. Drops the old "role" column

BEGIN;

ALTER TABLE "users"
  ADD COLUMN "roles" "UserRole"[] NOT NULL DEFAULT ARRAY['FOUNDER'::"UserRole"];

UPDATE "users"
  SET "roles" = ARRAY["role"];

ALTER TABLE "users"
  DROP COLUMN "role";

COMMIT;
