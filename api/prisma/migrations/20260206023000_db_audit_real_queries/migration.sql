-- Customer filters (audiences / portal)
DROP INDEX IF EXISTS "idx_customer_merchant_erased";
CREATE INDEX "idx_customer_merchant_erased_created" ON "Customer"("merchantId", "erasedAt", "createdAt");
CREATE INDEX "idx_customer_tags_gin" ON "Customer" USING GIN ("tags");

-- Customer segments listing
DROP INDEX IF EXISTS "CustomerSegment_merchantId_isSystem_idx";
CREATE INDEX "idx_customer_segment_merchant_system_created" ON "CustomerSegment"("merchantId", "isSystem", "createdAt");

-- Segment members listing
CREATE INDEX "idx_segment_customer_segment_created" ON "SegmentCustomer"("segmentId", "createdAt");

-- CustomerStats filters (audiences / analytics)
CREATE INDEX "idx_customer_stats_merchant_first_seen" ON "CustomerStats"("merchantId", "firstSeenAt");
CREATE INDEX "idx_customer_stats_merchant_last_order" ON "CustomerStats"("merchantId", "lastOrderAt");
CREATE INDEX "idx_customer_stats_merchant_rfm_class" ON "CustomerStats"("merchantId", "rfmClass");
CREATE INDEX "idx_customer_stats_merchant_rfm_r" ON "CustomerStats"("merchantId", "rfmR");
CREATE INDEX "idx_customer_stats_merchant_rfm_f" ON "CustomerStats"("merchantId", "rfmF");
CREATE INDEX "idx_customer_stats_merchant_rfm_m" ON "CustomerStats"("merchantId", "rfmM");
CREATE INDEX "idx_customer_stats_merchant_visits" ON "CustomerStats"("merchantId", "visits");
CREATE INDEX "idx_customer_stats_merchant_avg_check" ON "CustomerStats"("merchantId", "avgCheck");

-- Receipt aggregates (analytics, cohorts)
CREATE INDEX "idx_receipt_merchant_canceled_created" ON "Receipt"("merchantId", "canceledAt", "createdAt");

-- Refund lookup used by receipt aggregates
CREATE INDEX "idx_transaction_refund_lookup" ON "Transaction"("merchantId", "orderId", "type", "canceledAt");

-- Referral lookups
CREATE INDEX "idx_referral_referrer_created" ON "Referral"("referrerId", "createdAt");
CREATE INDEX "idx_referral_referee_program" ON "Referral"("refereeId", "programId");
CREATE INDEX "idx_referral_referee_status" ON "Referral"("refereeId", "status");

-- Promo code usage lookups
CREATE INDEX "idx_promocode_usage_promocode_order" ON "PromoCodeUsage"("promoCodeId", "orderId");
CREATE INDEX "idx_promocode_usage_promocode_customer_created" ON "PromoCodeUsage"("promoCodeId", "customerId", "createdAt");

-- Staff list/auth helpers
CREATE INDEX "idx_staff_merchant_created" ON "Staff"("merchantId", "createdAt");
CREATE INDEX "idx_staff_email" ON "Staff"("email");
