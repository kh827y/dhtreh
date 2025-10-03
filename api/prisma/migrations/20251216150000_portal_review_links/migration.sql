-- Populate Outlet.reviewLinks from historical structures in MerchantSettings.rulesJson
-- We extract per-platform URLs for each outlet and store them as a flat JSON object { yandex: url, twogis: url, google: url }

WITH platform_urls AS (
  SELECT
    o.id AS outlet_id,
    jsonb_strip_nulls(jsonb_build_object(
      'yandex',
        COALESCE(
          (ms."rulesJson" #>> '{reviewsShare,platforms,yandex,url}'),
          (
            SELECT elem->>'url'
            FROM jsonb_array_elements(COALESCE(ms."rulesJson"#>'{reviewsShare,platforms,yandex,outlets}', '[]'::jsonb)) elem
            WHERE elem->>'outletId' = o.id
            LIMIT 1
          )
        ),
      'twogis',
        COALESCE(
          (ms."rulesJson" #>> '{reviewsShare,platforms,twogis,url}'),
          (
            SELECT elem->>'url'
            FROM jsonb_array_elements(COALESCE(ms."rulesJson"#>'{reviewsShare,platforms,twogis,outlets}', '[]'::jsonb)) elem
            WHERE elem->>'outletId' = o.id
            LIMIT 1
          )
        ),
      'google',
        COALESCE(
          (ms."rulesJson" #>> '{reviewsShare,platforms,google,url}'),
          (
            SELECT elem->>'url'
            FROM jsonb_array_elements(COALESCE(ms."rulesJson"#>'{reviewsShare,platforms,google,outlets}', '[]'::jsonb)) elem
            WHERE elem->>'outletId' = o.id
            LIMIT 1
          )
        )
    )) AS review_links
  FROM "public"."Outlet" o
  INNER JOIN "public"."MerchantSettings" ms ON ms."merchantId" = o."merchantId"
)
UPDATE "public"."Outlet" AS o
SET "reviewLinks" = CASE
  WHEN platform_urls.review_links = '{}'::jsonb THEN NULL
  ELSE platform_urls.review_links
END
FROM platform_urls
WHERE platform_urls.outlet_id = o.id;

-- Optional: clean up legacy outlet-specific URLs inside rulesJson (they are no longer used by the app)
UPDATE "public"."MerchantSettings"
SET "rulesJson" = jsonb_set(
  COALESCE("rulesJson", '{}'::jsonb),
  '{reviewsShare,platforms}',
  (
    SELECT jsonb_object_agg(key, jsonb_strip_nulls(value - 'outlets'))
    FROM jsonb_each(COALESCE("rulesJson"#>'{reviewsShare,platforms}', '{}'::jsonb)) AS t(key, value)
  )
)
WHERE "rulesJson" ? 'reviewsShare';
