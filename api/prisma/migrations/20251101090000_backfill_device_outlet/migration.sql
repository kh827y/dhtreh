-- Backfill outletId for records that only reference deviceId
DO $$
DECLARE
    rec RECORD;
    remaining BIGINT;
BEGIN
    FOR rec IN
        SELECT d.table_schema,
               d.table_name
        FROM information_schema.columns d
        JOIN information_schema.columns o
          ON o.table_schema = d.table_schema
         AND o.table_name = d.table_name
         AND o.column_name = 'outletId'
        WHERE d.table_schema = 'public'
          AND d.column_name = 'deviceId'
          AND d.table_name IS NOT NULL
          AND d.table_name <> ''
    LOOP
        IF rec.table_name IS NULL OR rec.table_name = '' THEN
            CONTINUE;
        END IF;

        EXECUTE format(
            'UPDATE %I.%I AS t
             SET "outletId" = dev."outletId"
             FROM "public"."Device" AS dev
             WHERE t."outletId" IS NULL
               AND t."deviceId" IS NOT NULL
               AND dev."id" = t."deviceId"
               AND dev."outletId" IS NOT NULL;',
            rec.table_schema,
            rec.table_name
        );

        EXECUTE format(
            'SELECT COUNT(*) FROM %I.%I AS t
             WHERE t."deviceId" IS NOT NULL AND t."outletId" IS NULL;',
            rec.table_schema,
            rec.table_name
        ) INTO remaining;

        IF remaining > 0 THEN
            RAISE EXCEPTION USING MESSAGE = format(
                '%s rows with deviceId but no outletId remaining: %s',
                rec.table_schema || '.' || rec.table_name,
                remaining
            );
        END IF;
    END LOOP;
END $$;
