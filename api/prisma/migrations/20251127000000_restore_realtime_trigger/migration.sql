-- Restore realtime events trigger for miniapp long-poll
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE OR REPLACE FUNCTION "public"."loyalty_emit_realtime_event"()
RETURNS TRIGGER AS $$
DECLARE
    target_mc_id TEXT;
    event_id TEXT := 'evt_' || encode(gen_random_bytes(12), 'hex');
    emitted_at TIMESTAMP(3) := now();
BEGIN
    SELECT "id"
    INTO target_mc_id
    FROM "public"."MerchantCustomer"
    WHERE "merchantId" = NEW."merchantId"
      AND "customerId" = NEW."customerId"
    LIMIT 1;

    INSERT INTO "public"."LoyaltyRealtimeEvent" (
        "id", "merchantId", "customerId", "merchantCustomerId",
        "transactionId", "transactionType", "amount", "eventType",
        "payload", "emittedAt", "deliveredAt", "createdAt", "updatedAt"
    )
    VALUES (
        event_id, NEW."merchantId", NEW."customerId", target_mc_id,
        NEW."id", NEW."type", NEW."amount", 'loyalty.transaction',
        NULL, emitted_at, NULL, emitted_at, emitted_at
    )
    ON CONFLICT ("id") DO NOTHING;

    PERFORM pg_notify(
        'loyalty_realtime_events',
        jsonb_build_object(
            'id', event_id,
            'merchantId', NEW."merchantId",
            'customerId', NEW."customerId",
            'merchantCustomerId', target_mc_id,
            'transactionId', NEW."id",
            'transactionType', NEW."type",
            'amount', NEW."amount",
            'eventType', 'loyalty.transaction',
            'emittedAt', emitted_at
        )::text
    );

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "loyalty_realtime_event_emit" ON "public"."Transaction";

CREATE TRIGGER "loyalty_realtime_event_emit"
AFTER INSERT OR UPDATE ON "public"."Transaction"
FOR EACH ROW
EXECUTE FUNCTION "public"."loyalty_emit_realtime_event"();
