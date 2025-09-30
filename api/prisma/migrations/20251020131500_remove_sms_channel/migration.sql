-- Remove legacy SMS channel data before narrowing CommunicationChannel enum
DELETE FROM "public"."CommunicationTaskRecipient" WHERE "channel" = 'SMS';
DELETE FROM "public"."CommunicationTask" WHERE "channel" = 'SMS';
DELETE FROM "public"."CommunicationTemplate" WHERE "channel" = 'SMS';

-- Recreate enum without SMS value
ALTER TYPE "public"."CommunicationChannel" RENAME TO "CommunicationChannel_old";

CREATE TYPE "public"."CommunicationChannel" AS ENUM ('PUSH', 'EMAIL', 'TELEGRAM', 'INAPP');

ALTER TABLE "public"."CommunicationTemplate"
  ALTER COLUMN "channel" TYPE "public"."CommunicationChannel"
  USING "channel"::text::"public"."CommunicationChannel";

ALTER TABLE "public"."CommunicationTask"
  ALTER COLUMN "channel" TYPE "public"."CommunicationChannel"
  USING "channel"::text::"public"."CommunicationChannel";

ALTER TABLE "public"."CommunicationTaskRecipient"
  ALTER COLUMN "channel" TYPE "public"."CommunicationChannel"
  USING "channel"::text::"public"."CommunicationChannel";

DROP TYPE "public"."CommunicationChannel_old";
