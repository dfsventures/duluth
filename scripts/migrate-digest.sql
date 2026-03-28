-- Run this in the Neon SQL editor (or any Postgres console connected to the production DB)

BEGIN;

-- Company aliases (for fuzzy matching in Granola sync)
ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "aliases" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

-- Admin digest subscription flag
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "receivesDigest" BOOLEAN NOT NULL DEFAULT true;

-- Weekly digest table
CREATE TABLE IF NOT EXISTS "weekly_digests" (
  "id"        TEXT        NOT NULL,
  "weekOf"    TIMESTAMP(3) NOT NULL,
  "title"     TEXT        NOT NULL,
  "sections"  JSONB       NOT NULL DEFAULT '[]',
  "sentAt"    TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "weekly_digests_pkey" PRIMARY KEY ("id")
);

-- Digest todos table
CREATE TABLE IF NOT EXISTS "digest_todos" (
  "id"         TEXT        NOT NULL,
  "digestId"   TEXT        NOT NULL,
  "text"       TEXT        NOT NULL,
  "assigneeId" TEXT,
  "completed"  BOOLEAN     NOT NULL DEFAULT false,
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "digest_todos_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "digest_todos"
  ADD CONSTRAINT "digest_todos_digestId_fkey"
  FOREIGN KEY ("digestId") REFERENCES "weekly_digests"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "digest_todos"
  ADD CONSTRAINT "digest_todos_assigneeId_fkey"
  FOREIGN KEY ("assigneeId") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

COMMIT;
