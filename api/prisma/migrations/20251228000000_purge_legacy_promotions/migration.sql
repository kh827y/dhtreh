-- Purge legacy promotion data so the portal starts clean.
DELETE FROM "CommunicationTask" WHERE "promotionId" IS NOT NULL;
DELETE FROM "PromotionParticipant";
DELETE FROM "LoyaltyPromotionMetric";
DELETE FROM "loyalty_promotions";
