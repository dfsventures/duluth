-- Part 38 (WS112.3). Run in the Neon SQL editor AFTER the WS113 deploy is Ready.
-- Idempotent: deterministic ids + ON CONFLICT, and the UPDATE only touches empty arrays.
BEGIN;

INSERT INTO "board_card_owners" ("id", "cardId", "personId", "rawName", "createdAt")
SELECT 'bco' || substr(md5(c."id" || ':' || c."ownerId"), 1, 22), c."id", c."ownerId", c."rawOwnerName", c."createdAt"
FROM "board_cards" c
WHERE c."ownerId" IS NOT NULL
ON CONFLICT ("cardId", "personId") DO NOTHING;

-- An unmatched owner today = raw name, no ownerId, card flagged (resolveEntity's "none" case).
UPDATE "board_cards"
SET "unmatchedOwnerNames" = ARRAY["rawOwnerName"]
WHERE "ownerId" IS NULL AND "rawOwnerName" IS NOT NULL AND "needsReview" = true
  AND cardinality("unmatchedOwnerNames") = 0;

COMMIT;

-- Verify (both must return 0):
SELECT count(*) FROM "board_cards" c
WHERE c."ownerId" IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM "board_card_owners" o WHERE o."cardId" = c."id" AND o."personId" = c."ownerId");
SELECT count(*) FROM "board_cards"
WHERE "ownerId" IS NULL AND "rawOwnerName" IS NOT NULL AND "needsReview" = true AND cardinality("unmatchedOwnerNames") = 0;
