-- Add nullable column first
ALTER TABLE "ErrorItem" ADD COLUMN "questionNo" TEXT;

-- Backfill existing rows by user + day using createdAt order.
WITH ranked AS (
    SELECT
        "id",
        to_char("createdAt", 'YYYYMMDD') AS day_prefix,
        row_number() OVER (
            PARTITION BY "userId", to_char("createdAt", 'YYYYMMDD')
            ORDER BY "createdAt" ASC, "id" ASC
        ) AS seq
    FROM "ErrorItem"
)
UPDATE "ErrorItem" ei
SET "questionNo" = ranked.day_prefix ||
    CASE
        WHEN ranked.seq <= 999 THEN lpad(ranked.seq::text, 3, '0')
        ELSE ranked.seq::text
    END
FROM ranked
WHERE ranked."id" = ei."id";

-- Enforce constraints
ALTER TABLE "ErrorItem" ALTER COLUMN "questionNo" SET NOT NULL;
CREATE UNIQUE INDEX "ErrorItem_userId_questionNo_key" ON "ErrorItem"("userId", "questionNo");
CREATE INDEX "ErrorItem_questionNo_idx" ON "ErrorItem"("questionNo");
