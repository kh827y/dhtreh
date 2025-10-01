-- Rename device-based columns to outlet-based keys
ALTER TABLE "public"."PushDevice" RENAME COLUMN "deviceId" TO "outletId";
ALTER TABLE "public"."PushNotification" RENAME COLUMN "deviceId" TO "outletId";

-- Rename unique index to match new column name
ALTER INDEX IF EXISTS "PushDevice_customerId_deviceId_key"
  RENAME TO "PushDevice_customerId_outletId_key";
