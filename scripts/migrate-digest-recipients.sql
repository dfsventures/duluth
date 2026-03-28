-- Run this in the Neon SQL editor

CREATE TABLE IF NOT EXISTS "digest_extra_recipients" (
  "id"        TEXT         NOT NULL,
  "email"     TEXT         NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "digest_extra_recipients_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "digest_extra_recipients_email_key" UNIQUE ("email")
);
