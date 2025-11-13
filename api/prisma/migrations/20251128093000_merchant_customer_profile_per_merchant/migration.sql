ALTER TABLE "MerchantCustomer"
  ADD COLUMN "profileGender" TEXT,
  ADD COLUMN "profileBirthDate" TIMESTAMP(3),
  ADD COLUMN "profileCompletedAt" TIMESTAMP(3);

WITH source AS (
  SELECT
    mc."id",
    c."gender",
    c."birthday",
    mc."phone",
    mc."name",
    mc."updatedAt"
  FROM "MerchantCustomer" mc
  JOIN "Customer" c ON c."id" = mc."customerId"
)
UPDATE "MerchantCustomer" AS mc
SET
  "profileGender" = CASE
    WHEN src."phone" IS NOT NULL AND src."gender" IN ('male','female') THEN src."gender"
    ELSE NULL
  END,
  "profileBirthDate" = CASE
    WHEN src."phone" IS NOT NULL THEN src."birthday"
    ELSE NULL
  END,
  "profileCompletedAt" = CASE
    WHEN src."phone" IS NOT NULL
      AND src."gender" IN ('male','female')
      AND src."birthday" IS NOT NULL
      AND btrim(COALESCE(src."name", '')) <> ''
    THEN COALESCE(mc."profileCompletedAt", src."updatedAt", NOW())
    ELSE NULL
  END
FROM source src
WHERE mc."id" = src."id";
