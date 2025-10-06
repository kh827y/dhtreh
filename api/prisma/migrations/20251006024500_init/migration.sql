-- CreateEnum
CREATE TYPE "public"."WalletType" AS ENUM ('POINTS');

-- CreateEnum
CREATE TYPE "public"."HoldMode" AS ENUM ('REDEEM', 'EARN');

-- CreateEnum
CREATE TYPE "public"."HoldStatus" AS ENUM ('PENDING', 'COMMITTED', 'CANCELED');

-- CreateEnum
CREATE TYPE "public"."DeviceType" AS ENUM ('SMART', 'PC_POS', 'VIRTUAL');

-- CreateEnum
CREATE TYPE "public"."StaffRole" AS ENUM ('ADMIN', 'MERCHANT', 'CASHIER');

-- CreateEnum
CREATE TYPE "public"."StaffStatus" AS ENUM ('ACTIVE', 'PENDING', 'SUSPENDED', 'FIRED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "public"."StaffOutletAccessStatus" AS ENUM ('ACTIVE', 'REVOKED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "public"."AccessScope" AS ENUM ('PORTAL', 'CASHIER', 'API');

-- CreateEnum
CREATE TYPE "public"."StaffInvitationStatus" AS ENUM ('PENDING', 'ACCEPTED', 'EXPIRED', 'REVOKED');

-- CreateEnum
CREATE TYPE "public"."PromoCodeStatus" AS ENUM ('DRAFT', 'ACTIVE', 'PAUSED', 'EXPIRED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "public"."PromoCodeUsageLimitType" AS ENUM ('UNLIMITED', 'ONCE_TOTAL', 'ONCE_PER_CUSTOMER', 'LIMITED_PER_CUSTOMER');

-- CreateEnum
CREATE TYPE "public"."PromotionStatus" AS ENUM ('DRAFT', 'SCHEDULED', 'ACTIVE', 'PAUSED', 'COMPLETED', 'CANCELED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "public"."PromotionRewardType" AS ENUM ('POINTS', 'DISCOUNT', 'CASHBACK', 'LEVEL_UP', 'CUSTOM');

-- CreateEnum
CREATE TYPE "public"."LoyaltyMechanicType" AS ENUM ('TIERS', 'PURCHASE_LIMITS', 'WINBACK', 'BIRTHDAY', 'REGISTRATION_BONUS', 'EXPIRATION_REMINDER', 'REFERRAL', 'CUSTOM');

-- CreateEnum
CREATE TYPE "public"."MechanicStatus" AS ENUM ('DISABLED', 'ENABLED', 'DRAFT');

-- CreateEnum
CREATE TYPE "public"."DataImportStatus" AS ENUM ('UPLOADED', 'VALIDATING', 'PROCESSING', 'COMPLETED', 'FAILED', 'CANCELED');

-- CreateEnum
CREATE TYPE "public"."DataImportType" AS ENUM ('CUSTOMERS', 'TRANSACTIONS', 'PRODUCTS', 'STAFF', 'PROMO_CODES');

-- CreateEnum
CREATE TYPE "public"."CommunicationChannel" AS ENUM ('PUSH', 'EMAIL', 'TELEGRAM', 'INAPP');

-- CreateEnum
CREATE TYPE "public"."PortalAccessState" AS ENUM ('ENABLED', 'DISABLED', 'INVITED', 'LOCKED');

-- CreateEnum
CREATE TYPE "public"."TxnType" AS ENUM ('EARN', 'REDEEM', 'REFUND', 'ADJUST', 'CAMPAIGN', 'REFERRAL');

-- CreateEnum
CREATE TYPE "public"."LedgerAccount" AS ENUM ('CUSTOMER_BALANCE', 'MERCHANT_LIABILITY', 'RESERVED');

-- CreateTable
CREATE TABLE "public"."Gift" (
    "id" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "imageUrl" TEXT,
    "costPoints" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "periodFrom" TIMESTAMP(3),
    "periodTo" TIMESTAMP(3),
    "perCustomerLimit" INTEGER,
    "inventory" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Gift_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."GiftRedemption" (
    "id" TEXT NOT NULL,
    "giftId" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'REDEEMED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),
    "redeemedAt" TIMESTAMP(3),
    "canceledAt" TIMESTAMP(3),

    CONSTRAINT "GiftRedemption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Merchant" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "telegramWebhookSecret" TEXT,
    "telegramBotEnabled" BOOLEAN NOT NULL DEFAULT false,
    "telegramBotToken" TEXT,
    "rating" DOUBLE PRECISION,
    "logo" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewCount" INTEGER NOT NULL DEFAULT 0,
    "portalKeyHash" TEXT,
    "portalEmail" TEXT,
    "portalPasswordHash" TEXT,
    "portalTotpSecret" TEXT,
    "portalTotpEnabled" BOOLEAN NOT NULL DEFAULT false,
    "portalLoginEnabled" BOOLEAN NOT NULL DEFAULT true,
    "portalLastLoginAt" TIMESTAMP(3),
    "cashierLogin" TEXT,
    "cashierPassword9" TEXT,
    "cashierPasswordUpdatedAt" TIMESTAMP(3),
    "archivedAt" TIMESTAMP(3),

    CONSTRAINT "Merchant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."MerchantSettings" (
    "merchantId" TEXT NOT NULL,
    "earnBps" INTEGER NOT NULL DEFAULT 500,
    "redeemLimitBps" INTEGER NOT NULL DEFAULT 5000,
    "qrTtlSec" INTEGER NOT NULL DEFAULT 120,
    "webhookUrl" TEXT,
    "webhookSecret" TEXT,
    "webhookKeyId" TEXT,
    "webhookSecretNext" TEXT,
    "webhookKeyIdNext" TEXT,
    "useWebhookNext" BOOLEAN NOT NULL DEFAULT false,
    "pointsTtlDays" INTEGER,
    "earnDelayDays" INTEGER,
    "redeemCooldownSec" INTEGER NOT NULL DEFAULT 0,
    "earnCooldownSec" INTEGER NOT NULL DEFAULT 0,
    "redeemDailyCap" INTEGER,
    "earnDailyCap" INTEGER,
    "requireJwtForQuote" BOOLEAN NOT NULL DEFAULT false,
    "requireBridgeSig" BOOLEAN NOT NULL DEFAULT false,
    "bridgeSecret" TEXT,
    "bridgeSecretNext" TEXT,
    "rulesJson" JSONB,
    "requireStaffKey" BOOLEAN NOT NULL DEFAULT false,
    "telegramBotToken" TEXT,
    "telegramBotUsername" TEXT,
    "telegramStartParamRequired" BOOLEAN NOT NULL DEFAULT false,
    "miniappBaseUrl" TEXT,
    "miniappThemePrimary" TEXT,
    "miniappThemeBg" TEXT,
    "miniappLogoUrl" TEXT,
    "outboxPausedUntil" TIMESTAMP(3),
    "smsSignature" TEXT,
    "phone" TEXT,
    "monthlyReports" BOOLEAN NOT NULL DEFAULT false,
    "staffMotivationEnabled" BOOLEAN NOT NULL DEFAULT false,
    "staffMotivationNewCustomerPoints" INTEGER NOT NULL DEFAULT 0,
    "staffMotivationExistingCustomerPoints" INTEGER NOT NULL DEFAULT 0,
    "staffMotivationLeaderboardPeriod" TEXT,
    "staffMotivationCustomDays" INTEGER,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MerchantSettings_pkey" PRIMARY KEY ("merchantId")
);

-- CreateTable
CREATE TABLE "public"."IdempotencyKey" (
    "id" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "response" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),

    CONSTRAINT "IdempotencyKey_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Consent" (
    "merchantId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "consentAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Consent_pkey" PRIMARY KEY ("merchantId","customerId")
);

-- CreateTable
CREATE TABLE "public"."Customer" (
    "id" TEXT NOT NULL,
    "phone" TEXT,
    "tgId" TEXT,
    "email" TEXT,
    "name" TEXT,
    "birthday" TIMESTAMP(3),
    "gender" TEXT,
    "city" TEXT,
    "tags" TEXT[],
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Customer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Wallet" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "type" "public"."WalletType" NOT NULL,
    "balance" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Wallet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Hold" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "mode" "public"."HoldMode" NOT NULL,
    "redeemAmount" INTEGER NOT NULL DEFAULT 0,
    "earnPoints" INTEGER NOT NULL DEFAULT 0,
    "status" "public"."HoldStatus" NOT NULL DEFAULT 'PENDING',
    "orderId" TEXT,
    "receiptId" TEXT,
    "total" INTEGER,
    "eligibleTotal" INTEGER,
    "qrJti" TEXT,
    "expiresAt" TIMESTAMP(3),
    "outletId" TEXT,
    "staffId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Hold_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Receipt" (
    "id" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "receiptNumber" TEXT,
    "total" INTEGER NOT NULL,
    "eligibleTotal" INTEGER NOT NULL,
    "redeemApplied" INTEGER NOT NULL DEFAULT 0,
    "earnApplied" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "outletId" TEXT,
    "staffId" TEXT,

    CONSTRAINT "Receipt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Transaction" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "type" "public"."TxnType" NOT NULL,
    "amount" INTEGER NOT NULL,
    "orderId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "outletId" TEXT,
    "staffId" TEXT,

    CONSTRAINT "Transaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."QrNonce" (
    "jti" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "merchantId" TEXT,
    "issuedAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QrNonce_pkey" PRIMARY KEY ("jti")
);

-- CreateTable
CREATE TABLE "public"."EventOutbox" (
    "id" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "retries" INTEGER NOT NULL DEFAULT 0,
    "nextRetryAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EventOutbox_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Outlet" (
    "id" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "hidden" BOOLEAN NOT NULL DEFAULT false,
    "description" TEXT,
    "phone" TEXT,
    "adminEmails" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "timezone" TEXT,
    "code" TEXT,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "scheduleEnabled" BOOLEAN NOT NULL DEFAULT false,
    "scheduleMode" TEXT NOT NULL DEFAULT 'CUSTOM',
    "scheduleJson" JSONB,
    "externalId" TEXT,
    "integrationProvider" TEXT,
    "integrationLocationCode" TEXT,
    "integrationPayload" JSONB,
    "reviewLinks" JSONB,
    "manualLocation" BOOLEAN NOT NULL DEFAULT false,
    "latitude" DECIMAL(10,7),
    "longitude" DECIMAL(10,7),
    "posType" "public"."DeviceType",
    "posLastSeenAt" TIMESTAMP(3),
    "bridgeSecret" TEXT,
    "bridgeSecretNext" TEXT,
    "bridgeSecretUpdatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Outlet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."OutletSchedule" (
    "id" TEXT NOT NULL,
    "outletId" TEXT NOT NULL,
    "dayOfWeek" INTEGER NOT NULL,
    "opensAt" TEXT,
    "closesAt" TEXT,
    "isDayOff" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OutletSchedule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Staff" (
    "id" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "login" TEXT,
    "email" TEXT,
    "role" "public"."StaffRole" NOT NULL DEFAULT 'CASHIER',
    "status" "public"."StaffStatus" NOT NULL DEFAULT 'ACTIVE',
    "portalState" "public"."PortalAccessState" NOT NULL DEFAULT 'DISABLED',
    "hash" TEXT,
    "apiKeyHash" TEXT,
    "allowedOutletId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "firstName" TEXT,
    "lastName" TEXT,
    "position" TEXT,
    "phone" TEXT,
    "comment" TEXT,
    "avatarUrl" TEXT,
    "hiredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "firedAt" TIMESTAMP(3),
    "terminationReason" TEXT,
    "lastActivityAt" TIMESTAMP(3),
    "lastPortalLoginAt" TIMESTAMP(3),
    "lastCashierLoginAt" TIMESTAMP(3),
    "portalAccessEnabled" BOOLEAN NOT NULL DEFAULT false,
    "portalInvitationSentAt" TIMESTAMP(3),
    "portalInvitationAcceptedAt" TIMESTAMP(3),
    "portalAccessRevokedAt" TIMESTAMP(3),
    "canAccessPortal" BOOLEAN NOT NULL DEFAULT false,
    "isOwner" BOOLEAN NOT NULL DEFAULT false,
    "pinCode" TEXT,

    CONSTRAINT "Staff_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."StaffOutletAccess" (
    "id" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "staffId" TEXT NOT NULL,
    "outletId" TEXT NOT NULL,
    "status" "public"."StaffOutletAccessStatus" NOT NULL DEFAULT 'ACTIVE',
    "pinCode" TEXT,
    "pinCodeHash" TEXT,
    "pinIssuedAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "pinUpdatedAt" TIMESTAMP(3),
    "pinIssuedById" TEXT,
    "pinRetryCount" INTEGER NOT NULL DEFAULT 0,
    "revokedAt" TIMESTAMP(3),
    "revokedById" TEXT,
    "lastTxnAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StaffOutletAccess_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."AccessGroup" (
    "id" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "scope" "public"."AccessScope" NOT NULL DEFAULT 'PORTAL',
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "metadata" JSONB,
    "createdById" TEXT,
    "updatedById" TEXT,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AccessGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."AccessGroupPermission" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "resource" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "conditions" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AccessGroupPermission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."StaffAccessGroup" (
    "id" TEXT NOT NULL,
    "staffId" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "assignedById" TEXT,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "StaffAccessGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."StaffInvitation" (
    "id" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "firstName" TEXT,
    "lastName" TEXT,
    "role" "public"."StaffRole" NOT NULL DEFAULT 'CASHIER',
    "status" "public"."StaffInvitationStatus" NOT NULL DEFAULT 'PENDING',
    "accessGroupId" TEXT,
    "invitedById" TEXT,
    "staffId" TEXT,
    "token" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "acceptedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StaffInvitation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."StaffAccessLog" (
    "id" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "staffId" TEXT NOT NULL,
    "actorId" TEXT,
    "action" TEXT NOT NULL,
    "payload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StaffAccessLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."CashierSession" (
    "id" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "staffId" TEXT NOT NULL,
    "outletId" TEXT,
    "pinAccessId" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "result" TEXT,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CashierSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ProductCategory" (
    "id" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "parentId" TEXT,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "imageUrl" TEXT,
    "order" INTEGER NOT NULL DEFAULT 1000,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "ProductCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Product" (
    "id" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "categoryId" TEXT,
    "name" TEXT NOT NULL,
    "sku" TEXT,
    "description" TEXT,
    "order" INTEGER NOT NULL DEFAULT 1000,
    "iikoProductId" TEXT,
    "hasVariants" BOOLEAN NOT NULL DEFAULT false,
    "priceEnabled" BOOLEAN NOT NULL DEFAULT true,
    "price" DECIMAL(10,2),
    "allowCart" BOOLEAN NOT NULL DEFAULT true,
    "visible" BOOLEAN NOT NULL DEFAULT true,
    "accruePoints" BOOLEAN NOT NULL DEFAULT true,
    "allowRedeem" BOOLEAN NOT NULL DEFAULT true,
    "redeemPercent" INTEGER NOT NULL DEFAULT 100,
    "weightValue" DECIMAL(10,3),
    "weightUnit" TEXT,
    "heightCm" DECIMAL(10,2),
    "widthCm" DECIMAL(10,2),
    "depthCm" DECIMAL(10,2),
    "proteins" DECIMAL(10,2),
    "fats" DECIMAL(10,2),
    "carbs" DECIMAL(10,2),
    "calories" DECIMAL(10,2),
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "purchasesMonth" INTEGER NOT NULL DEFAULT 0,
    "purchasesTotal" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ProductImage" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "alt" TEXT,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductImage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ProductVariant" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sku" TEXT,
    "price" DECIMAL(10,2),
    "notes" TEXT,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductVariant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ProductStock" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "outletId" TEXT,
    "label" TEXT NOT NULL,
    "price" DECIMAL(10,2),
    "balance" DECIMAL(12,3),
    "currency" TEXT NOT NULL DEFAULT 'RUB',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductStock_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ProductAttribute" (
    "id" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "valueType" TEXT,
    "locale" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductAttribute_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ProductOption" (
    "id" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT,
    "position" INTEGER NOT NULL DEFAULT 0,
    "isRequired" BOOLEAN NOT NULL DEFAULT false,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductOption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ProductOptionValue" (
    "id" TEXT NOT NULL,
    "optionId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "priceDelta" DECIMAL(10,2),
    "skuSuffix" TEXT,
    "metadata" JSONB,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductOptionValue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ProductVariantOption" (
    "id" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,
    "optionId" TEXT NOT NULL,
    "optionValueId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductVariantOption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."LedgerEntry" (
    "id" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "customerId" TEXT,
    "debit" "public"."LedgerAccount" NOT NULL,
    "credit" "public"."LedgerAccount" NOT NULL,
    "amount" INTEGER NOT NULL,
    "orderId" TEXT,
    "receiptId" TEXT,
    "outletId" TEXT,
    "staffId" TEXT,
    "meta" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LedgerEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."EarnLot" (
    "id" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "points" INTEGER NOT NULL,
    "consumedPoints" INTEGER NOT NULL DEFAULT 0,
    "earnedAt" TIMESTAMP(3) NOT NULL,
    "maturesAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "orderId" TEXT,
    "receiptId" TEXT,
    "outletId" TEXT,
    "staffId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EarnLot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."AdminAudit" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actor" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "merchantId" TEXT,
    "action" TEXT,
    "payload" JSONB,

    CONSTRAINT "AdminAudit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."TelegramBot" (
    "id" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "botToken" TEXT NOT NULL,
    "botUsername" TEXT NOT NULL,
    "botId" TEXT,
    "webhookUrl" TEXT,
    "webhookSecret" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "welcomeMessage" TEXT,
    "menuConfig" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TelegramBot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."TelegramStaffInvite" (
    "id" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),
    "createdById" TEXT,

    CONSTRAINT "TelegramStaffInvite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."TelegramStaffSubscriber" (
    "id" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "chatId" TEXT NOT NULL,
    "chatType" TEXT NOT NULL,
    "username" TEXT,
    "title" TEXT,
    "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "TelegramStaffSubscriber_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Plan" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "price" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'RUB',
    "interval" TEXT NOT NULL,
    "features" JSONB NOT NULL,
    "maxTransactions" INTEGER,
    "maxCustomers" INTEGER,
    "maxOutlets" INTEGER,
    "webhooksEnabled" BOOLEAN NOT NULL DEFAULT true,
    "customBranding" BOOLEAN NOT NULL DEFAULT false,
    "prioritySupport" BOOLEAN NOT NULL DEFAULT false,
    "apiAccess" BOOLEAN NOT NULL DEFAULT true,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Plan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Subscription" (
    "id" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "currentPeriodStart" TIMESTAMP(3) NOT NULL,
    "currentPeriodEnd" TIMESTAMP(3) NOT NULL,
    "cancelAt" TIMESTAMP(3),
    "canceledAt" TIMESTAMP(3),
    "trialEnd" TIMESTAMP(3),
    "metadata" JSONB,
    "autoRenew" BOOLEAN NOT NULL DEFAULT true,
    "lastPaymentId" TEXT,
    "reminderSent7Days" BOOLEAN NOT NULL DEFAULT false,
    "reminderSent1Day" BOOLEAN NOT NULL DEFAULT false,
    "lastPaymentDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Subscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."SegmentCustomer" (
    "id" TEXT NOT NULL,
    "segmentId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SegmentCustomer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."EmailNotification" (
    "id" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "customerId" TEXT,
    "campaignId" TEXT,
    "to" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "template" TEXT NOT NULL,
    "variables" JSONB,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "messageId" TEXT,
    "sentAt" TIMESTAMP(3),
    "error" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailNotification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."PushDevice" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "merchantId" TEXT,
    "outletId" TEXT,
    "token" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "deviceInfo" JSONB,
    "lastActiveAt" TIMESTAMP(3),
    "lastUsed" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PushDevice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."PushNotification" (
    "id" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "customerId" TEXT,
    "outletId" TEXT,
    "deviceToken" TEXT,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "type" TEXT,
    "campaignId" TEXT,
    "data" JSONB,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "messageId" TEXT,
    "sentAt" TIMESTAMP(3),
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PushNotification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."CommunicationTemplate" (
    "id" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "channel" "public"."CommunicationChannel" NOT NULL,
    "subject" TEXT,
    "content" JSONB NOT NULL,
    "preview" JSONB,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "createdById" TEXT,
    "updatedById" TEXT,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CommunicationTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."CommunicationTask" (
    "id" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "channel" "public"."CommunicationChannel" NOT NULL,
    "templateId" TEXT,
    "audienceId" TEXT,
    "audienceName" TEXT,
    "audienceSnapshot" JSONB,
    "promotionId" TEXT,
    "createdById" TEXT,
    "status" TEXT NOT NULL DEFAULT 'SCHEDULED',
    "scheduledAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),
    "payload" JSONB,
    "filters" JSONB,
    "stats" JSONB,
    "media" JSONB,
    "timezone" TEXT,
    "archivedAt" TIMESTAMP(3),
    "totalRecipients" INTEGER NOT NULL DEFAULT 0,
    "sentCount" INTEGER NOT NULL DEFAULT 0,
    "failedCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CommunicationTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."CommunicationTaskRecipient" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "customerId" TEXT,
    "channel" "public"."CommunicationChannel" NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "sentAt" TIMESTAMP(3),
    "error" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CommunicationTaskRecipient_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."OtpCode" (
    "id" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "type" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "merchantId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OtpCode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."CustomerConsent" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "grantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CustomerConsent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."MerchantStats" (
    "id" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "smsSent" INTEGER NOT NULL DEFAULT 0,
    "smsCost" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "pushSent" INTEGER NOT NULL DEFAULT 0,
    "pushFailed" INTEGER NOT NULL DEFAULT 0,
    "emailSent" INTEGER NOT NULL DEFAULT 0,
    "lastUpdated" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MerchantStats_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ReferralProgram" (
    "id" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "referrerReward" DOUBLE PRECISION NOT NULL,
    "refereeReward" DOUBLE PRECISION NOT NULL,
    "maxReferrals" INTEGER,
    "validUntil" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "minPurchaseAmount" INTEGER NOT NULL DEFAULT 0,
    "expiryDays" INTEGER NOT NULL DEFAULT 30,
    "rewardTrigger" TEXT NOT NULL DEFAULT 'first',
    "rewardType" TEXT NOT NULL DEFAULT 'FIXED',
    "multiLevel" BOOLEAN NOT NULL DEFAULT false,
    "levelRewards" JSONB,
    "stackWithRegistration" BOOLEAN NOT NULL DEFAULT false,
    "messageTemplate" TEXT,
    "placeholders" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReferralProgram_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Referral" (
    "id" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "referrerId" TEXT NOT NULL,
    "refereeId" TEXT,
    "code" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "activatedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "purchaseAmount" INTEGER,
    "refereePhone" TEXT,
    "refereeEmail" TEXT,
    "channel" TEXT,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Referral_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."PersonalReferralCode" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "programId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PersonalReferralCode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."PromoCode" (
    "id" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "segmentId" TEXT,
    "code" TEXT NOT NULL,
    "name" TEXT,
    "description" TEXT,
    "status" "public"."PromoCodeStatus" NOT NULL DEFAULT 'DRAFT',
    "usageLimitType" "public"."PromoCodeUsageLimitType" NOT NULL DEFAULT 'UNLIMITED',
    "usageLimitValue" INTEGER,
    "cooldownDays" INTEGER,
    "perCustomerLimit" INTEGER,
    "requireVisit" BOOLEAN NOT NULL DEFAULT false,
    "visitLookbackHours" INTEGER,
    "grantPoints" BOOLEAN NOT NULL DEFAULT false,
    "pointsAmount" INTEGER,
    "pointsExpireInDays" INTEGER,
    "assignTierId" TEXT,
    "upgradeTierId" TEXT,
    "autoArchiveAt" TIMESTAMP(3),
    "activeFrom" TIMESTAMP(3),
    "activeUntil" TIMESTAMP(3),
    "isHighlighted" BOOLEAN NOT NULL DEFAULT false,
    "metadata" JSONB,
    "createdById" TEXT,
    "updatedById" TEXT,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PromoCode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."PromoCodeUsage" (
    "id" TEXT NOT NULL,
    "promoCodeId" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "customerId" TEXT,
    "staffId" TEXT,
    "outletId" TEXT,
    "orderId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'USED',
    "pointsIssued" INTEGER,
    "pointsExpireAt" TIMESTAMP(3),
    "reward" JSONB,
    "metadata" JSONB,
    "usedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PromoCodeUsage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."PromoCodeMetric" (
    "id" TEXT NOT NULL,
    "promoCodeId" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "totalIssued" INTEGER NOT NULL DEFAULT 0,
    "totalRedeemed" INTEGER NOT NULL DEFAULT 0,
    "totalPointsIssued" INTEGER NOT NULL DEFAULT 0,
    "totalCustomers" INTEGER NOT NULL DEFAULT 0,
    "usageByStatus" JSONB,
    "usageByPeriod" JSONB,
    "lastUsedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PromoCodeMetric_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."loyalty_promotions" (
    "id" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "segmentId" TEXT,
    "targetTierId" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "status" "public"."PromotionStatus" NOT NULL DEFAULT 'DRAFT',
    "rewardType" "public"."PromotionRewardType" NOT NULL,
    "rewardValue" INTEGER,
    "rewardMetadata" JSONB,
    "pointsExpireInDays" INTEGER,
    "pushTemplateStartId" TEXT,
    "pushTemplateReminderId" TEXT,
    "pushOnStart" BOOLEAN NOT NULL DEFAULT false,
    "pushReminderEnabled" BOOLEAN NOT NULL DEFAULT false,
    "reminderOffsetHours" INTEGER,
    "autoLaunch" BOOLEAN NOT NULL DEFAULT false,
    "startAt" TIMESTAMP(3),
    "endAt" TIMESTAMP(3),
    "launchedAt" TIMESTAMP(3),
    "archivedAt" TIMESTAMP(3),
    "createdById" TEXT,
    "updatedById" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "loyalty_promotions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."PromotionParticipant" (
    "id" TEXT NOT NULL,
    "promotionId" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "outletId" TEXT,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "firstPurchaseAt" TIMESTAMP(3),
    "lastPurchaseAt" TIMESTAMP(3),
    "purchasesCount" INTEGER NOT NULL DEFAULT 0,
    "totalSpent" INTEGER NOT NULL DEFAULT 0,
    "pointsIssued" INTEGER NOT NULL DEFAULT 0,
    "pointsRedeemed" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PromotionParticipant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."LoyaltyPromotionMetric" (
    "id" TEXT NOT NULL,
    "promotionId" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "participantsCount" INTEGER NOT NULL DEFAULT 0,
    "revenueGenerated" INTEGER NOT NULL DEFAULT 0,
    "revenueRedeemed" INTEGER NOT NULL DEFAULT 0,
    "pointsIssued" INTEGER NOT NULL DEFAULT 0,
    "pointsRedeemed" INTEGER NOT NULL DEFAULT 0,
    "charts" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LoyaltyPromotionMetric_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."LoyaltyMechanic" (
    "id" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "type" "public"."LoyaltyMechanicType" NOT NULL,
    "name" TEXT,
    "description" TEXT,
    "status" "public"."MechanicStatus" NOT NULL DEFAULT 'DISABLED',
    "settings" JSONB,
    "createdById" TEXT,
    "updatedById" TEXT,
    "enabledAt" TIMESTAMP(3),
    "disabledAt" TIMESTAMP(3),
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LoyaltyMechanic_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."LoyaltyMechanicLog" (
    "id" TEXT NOT NULL,
    "mechanicId" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "actorId" TEXT,
    "action" TEXT NOT NULL,
    "payload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LoyaltyMechanicLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."LoyaltyTier" (
    "id" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "thresholdAmount" INTEGER NOT NULL DEFAULT 0,
    "earnRateBps" INTEGER NOT NULL DEFAULT 500,
    "redeemRateBps" INTEGER,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "isHidden" BOOLEAN NOT NULL DEFAULT false,
    "isInitial" BOOLEAN NOT NULL DEFAULT false,
    "color" TEXT,
    "iconUrl" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LoyaltyTier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."LoyaltyTierBenefit" (
    "id" TEXT NOT NULL,
    "tierId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "value" JSONB,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LoyaltyTierBenefit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."LoyaltyTierAssignment" (
    "id" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "tierId" TEXT NOT NULL,
    "assignedById" TEXT,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),
    "source" TEXT DEFAULT 'auto',
    "notes" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LoyaltyTierAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Payment" (
    "id" TEXT NOT NULL,
    "subscriptionId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'RUB',
    "status" TEXT NOT NULL,
    "paymentMethod" TEXT,
    "invoiceId" TEXT,
    "receiptUrl" TEXT,
    "failureReason" TEXT,
    "paidAt" TIMESTAMP(3),
    "provider" TEXT,
    "merchantId" TEXT,
    "metadata" JSONB,
    "refundedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."FraudCheck" (
    "id" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "transactionId" TEXT,
    "riskScore" INTEGER NOT NULL,
    "riskLevel" TEXT NOT NULL,
    "factors" TEXT[],
    "blocked" BOOLEAN NOT NULL DEFAULT false,
    "reviewed" BOOLEAN NOT NULL DEFAULT false,
    "reviewedBy" TEXT,
    "reviewNotes" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FraudCheck_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Integration" (
    "id" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "config" JSONB NOT NULL,
    "credentials" JSONB,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastSync" TIMESTAMP(3),
    "errorCount" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Integration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."SyncLog" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "merchantId" TEXT,
    "integrationId" TEXT,
    "provider" TEXT,
    "direction" TEXT NOT NULL,
    "endpoint" TEXT,
    "status" TEXT,
    "request" JSONB,
    "response" JSONB,
    "error" TEXT,
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "nextRetryAt" TIMESTAMP(3),

    CONSTRAINT "SyncLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."CustomerSegment" (
    "id" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "type" TEXT NOT NULL DEFAULT 'DYNAMIC',
    "rules" JSONB NOT NULL,
    "filters" JSONB,
    "metricsSnapshot" JSONB,
    "customerCount" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "color" TEXT,
    "definitionVersion" INTEGER NOT NULL DEFAULT 1,
    "source" TEXT DEFAULT 'builder',
    "createdById" TEXT,
    "updatedById" TEXT,
    "archivedAt" TIMESTAMP(3),
    "lastEvaluatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomerSegment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Review" (
    "id" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "orderId" TEXT,
    "transactionId" TEXT,
    "rating" INTEGER NOT NULL,
    "title" TEXT,
    "comment" TEXT NOT NULL,
    "photos" TEXT[],
    "tags" TEXT[],
    "isAnonymous" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "helpfulCount" INTEGER NOT NULL DEFAULT 0,
    "notHelpfulCount" INTEGER NOT NULL DEFAULT 0,
    "rewardPoints" INTEGER NOT NULL DEFAULT 0,
    "moderatedAt" TIMESTAMP(3),
    "moderatedBy" TEXT,
    "moderationReason" TEXT,
    "metadata" JSONB,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Review_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ReviewResponse" (
    "id" TEXT NOT NULL,
    "reviewId" TEXT NOT NULL,
    "staffId" TEXT,
    "message" TEXT NOT NULL,
    "merchantId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReviewResponse_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ReviewReaction" (
    "id" TEXT NOT NULL,
    "reviewId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReviewReaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."CustomerStats" (
    "merchantId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastOrderAt" TIMESTAMP(3),
    "visits" INTEGER NOT NULL DEFAULT 0,
    "totalSpent" INTEGER NOT NULL DEFAULT 0,
    "avgCheck" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "rfmR" INTEGER,
    "rfmF" INTEGER,
    "rfmM" INTEGER,
    "rfmScore" INTEGER,
    "rfmClass" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomerStats_pkey" PRIMARY KEY ("merchantId","customerId")
);

-- CreateTable
CREATE TABLE "public"."MerchantKpiDaily" (
    "id" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "revenue" INTEGER NOT NULL DEFAULT 0,
    "transactionCount" INTEGER NOT NULL DEFAULT 0,
    "averageCheck" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "newCustomers" INTEGER NOT NULL DEFAULT 0,
    "activeCustomers" INTEGER NOT NULL DEFAULT 0,
    "pointsIssued" INTEGER NOT NULL DEFAULT 0,
    "pointsRedeemed" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MerchantKpiDaily_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."OutletKpiDaily" (
    "id" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "outletId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "revenue" INTEGER NOT NULL DEFAULT 0,
    "transactionCount" INTEGER NOT NULL DEFAULT 0,
    "averageCheck" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "pointsIssued" INTEGER NOT NULL DEFAULT 0,
    "pointsRedeemed" INTEGER NOT NULL DEFAULT 0,
    "customers" INTEGER NOT NULL DEFAULT 0,
    "newCustomers" INTEGER NOT NULL DEFAULT 0,
    "stampsIssued" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OutletKpiDaily_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."StaffKpiDaily" (
    "id" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "staffId" TEXT NOT NULL,
    "outletId" TEXT,
    "date" TIMESTAMP(3) NOT NULL,
    "performanceScore" INTEGER NOT NULL DEFAULT 0,
    "salesCount" INTEGER NOT NULL DEFAULT 0,
    "salesAmount" INTEGER NOT NULL DEFAULT 0,
    "averageCheck" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "pointsIssued" INTEGER NOT NULL DEFAULT 0,
    "pointsRedeemed" INTEGER NOT NULL DEFAULT 0,
    "giftsIssued" INTEGER NOT NULL DEFAULT 0,
    "newCustomers" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StaffKpiDaily_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."SegmentMetricSnapshot" (
    "id" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "segmentId" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "metrics" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SegmentMetricSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."DataImportJob" (
    "id" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "type" "public"."DataImportType" NOT NULL,
    "status" "public"."DataImportStatus" NOT NULL DEFAULT 'UPLOADED',
    "sourceFileName" TEXT NOT NULL,
    "sourceFileSize" INTEGER,
    "sourceMimeType" TEXT,
    "uploadedById" TEXT,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "processedAt" TIMESTAMP(3),
    "totalRows" INTEGER NOT NULL DEFAULT 0,
    "successRows" INTEGER NOT NULL DEFAULT 0,
    "failedRows" INTEGER NOT NULL DEFAULT 0,
    "skippedRows" INTEGER NOT NULL DEFAULT 0,
    "settings" JSONB,
    "errorSummary" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DataImportJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."DataImportRow" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "rowNumber" INTEGER NOT NULL,
    "rawData" JSONB NOT NULL,
    "normalizedData" JSONB,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DataImportRow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."DataImportError" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "rowNumber" INTEGER,
    "columnKey" TEXT,
    "code" TEXT,
    "message" TEXT NOT NULL,
    "details" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DataImportError_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."DataImportMetric" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "stats" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DataImportMetric_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Gift_merchantId_active_idx" ON "public"."Gift"("merchantId", "active");

-- CreateIndex
CREATE UNIQUE INDEX "GiftRedemption_code_key" ON "public"."GiftRedemption"("code");

-- CreateIndex
CREATE INDEX "GiftRedemption_merchantId_customerId_createdAt_idx" ON "public"."GiftRedemption"("merchantId", "customerId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Merchant_portalEmail_key" ON "public"."Merchant"("portalEmail");

-- CreateIndex
CREATE UNIQUE INDEX "Merchant_cashierLogin_key" ON "public"."Merchant"("cashierLogin");

-- CreateIndex
CREATE INDEX "IdempotencyKey_merchantId_createdAt_idx" ON "public"."IdempotencyKey"("merchantId", "createdAt");

-- CreateIndex
CREATE INDEX "IdempotencyKey_expiresAt_idx" ON "public"."IdempotencyKey"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "IdempotencyKey_merchantId_key_key" ON "public"."IdempotencyKey"("merchantId", "key");

-- CreateIndex
CREATE UNIQUE INDEX "Customer_phone_key" ON "public"."Customer"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "Customer_tgId_key" ON "public"."Customer"("tgId");

-- CreateIndex
CREATE UNIQUE INDEX "Customer_email_key" ON "public"."Customer"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Wallet_customerId_merchantId_type_key" ON "public"."Wallet"("customerId", "merchantId", "type");

-- CreateIndex
CREATE UNIQUE INDEX "Hold_qrJti_key" ON "public"."Hold"("qrJti");

-- CreateIndex
CREATE INDEX "Hold_customerId_status_idx" ON "public"."Hold"("customerId", "status");

-- CreateIndex
CREATE INDEX "Hold_merchantId_status_idx" ON "public"."Hold"("merchantId", "status");

-- CreateIndex
CREATE INDEX "Hold_merchantId_outletId_idx" ON "public"."Hold"("merchantId", "outletId");

-- CreateIndex
CREATE INDEX "Hold_merchantId_staffId_idx" ON "public"."Hold"("merchantId", "staffId");

-- CreateIndex
CREATE INDEX "Receipt_merchantId_createdAt_idx" ON "public"."Receipt"("merchantId", "createdAt");

-- CreateIndex
CREATE INDEX "Receipt_merchantId_outletId_idx" ON "public"."Receipt"("merchantId", "outletId");

-- CreateIndex
CREATE INDEX "Receipt_merchantId_staffId_idx" ON "public"."Receipt"("merchantId", "staffId");

-- CreateIndex
CREATE UNIQUE INDEX "Receipt_merchantId_orderId_key" ON "public"."Receipt"("merchantId", "orderId");

-- CreateIndex
CREATE INDEX "Transaction_customerId_createdAt_idx" ON "public"."Transaction"("customerId", "createdAt");

-- CreateIndex
CREATE INDEX "Transaction_merchantId_createdAt_idx" ON "public"."Transaction"("merchantId", "createdAt");

-- CreateIndex
CREATE INDEX "Transaction_merchantId_outletId_idx" ON "public"."Transaction"("merchantId", "outletId");

-- CreateIndex
CREATE INDEX "Transaction_merchantId_staffId_idx" ON "public"."Transaction"("merchantId", "staffId");

-- CreateIndex
CREATE INDEX "Transaction_merchantId_customerId_type_createdAt_idx" ON "public"."Transaction"("merchantId", "customerId", "type", "createdAt");

-- CreateIndex
CREATE INDEX "QrNonce_merchantId_usedAt_idx" ON "public"."QrNonce"("merchantId", "usedAt");

-- CreateIndex
CREATE INDEX "EventOutbox_status_nextRetryAt_idx" ON "public"."EventOutbox"("status", "nextRetryAt");

-- CreateIndex
CREATE INDEX "EventOutbox_merchantId_createdAt_idx" ON "public"."EventOutbox"("merchantId", "createdAt");

-- CreateIndex
CREATE INDEX "Outlet_merchantId_idx" ON "public"."Outlet"("merchantId");

-- CreateIndex
CREATE INDEX "Outlet_merchantId_status_idx" ON "public"."Outlet"("merchantId", "status");

-- CreateIndex
CREATE INDEX "Outlet_merchantId_hidden_idx" ON "public"."Outlet"("merchantId", "hidden");

-- CreateIndex
CREATE UNIQUE INDEX "Outlet_merchantId_externalId_key" ON "public"."Outlet"("merchantId", "externalId");

-- CreateIndex
CREATE UNIQUE INDEX "Outlet_merchantId_code_key" ON "public"."Outlet"("merchantId", "code");

-- CreateIndex
CREATE INDEX "OutletSchedule_outletId_idx" ON "public"."OutletSchedule"("outletId");

-- CreateIndex
CREATE UNIQUE INDEX "OutletSchedule_outletId_dayOfWeek_key" ON "public"."OutletSchedule"("outletId", "dayOfWeek");

-- CreateIndex
CREATE INDEX "Staff_merchantId_idx" ON "public"."Staff"("merchantId");

-- CreateIndex
CREATE INDEX "Staff_merchantId_apiKeyHash_idx" ON "public"."Staff"("merchantId", "apiKeyHash");

-- CreateIndex
CREATE UNIQUE INDEX "Staff_merchantId_login_key" ON "public"."Staff"("merchantId", "login");

-- CreateIndex
CREATE INDEX "StaffOutletAccess_merchantId_outletId_idx" ON "public"."StaffOutletAccess"("merchantId", "outletId");

-- CreateIndex
CREATE INDEX "StaffOutletAccess_staffId_status_idx" ON "public"."StaffOutletAccess"("staffId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "StaffOutletAccess_merchantId_staffId_outletId_key" ON "public"."StaffOutletAccess"("merchantId", "staffId", "outletId");

-- CreateIndex
CREATE INDEX "AccessGroup_merchantId_scope_idx" ON "public"."AccessGroup"("merchantId", "scope");

-- CreateIndex
CREATE UNIQUE INDEX "AccessGroup_merchantId_name_scope_key" ON "public"."AccessGroup"("merchantId", "name", "scope");

-- CreateIndex
CREATE INDEX "AccessGroupPermission_groupId_idx" ON "public"."AccessGroupPermission"("groupId");

-- CreateIndex
CREATE UNIQUE INDEX "AccessGroupPermission_groupId_resource_action_key" ON "public"."AccessGroupPermission"("groupId", "resource", "action");

-- CreateIndex
CREATE INDEX "StaffAccessGroup_groupId_idx" ON "public"."StaffAccessGroup"("groupId");

-- CreateIndex
CREATE INDEX "StaffAccessGroup_merchantId_idx" ON "public"."StaffAccessGroup"("merchantId");

-- CreateIndex
CREATE UNIQUE INDEX "StaffAccessGroup_staffId_groupId_key" ON "public"."StaffAccessGroup"("staffId", "groupId");

-- CreateIndex
CREATE UNIQUE INDEX "StaffInvitation_token_key" ON "public"."StaffInvitation"("token");

-- CreateIndex
CREATE INDEX "StaffInvitation_merchantId_status_idx" ON "public"."StaffInvitation"("merchantId", "status");

-- CreateIndex
CREATE INDEX "StaffInvitation_merchantId_email_idx" ON "public"."StaffInvitation"("merchantId", "email");

-- CreateIndex
CREATE UNIQUE INDEX "StaffInvitation_staffId_key" ON "public"."StaffInvitation"("staffId");

-- CreateIndex
CREATE INDEX "StaffAccessLog_merchantId_createdAt_idx" ON "public"."StaffAccessLog"("merchantId", "createdAt");

-- CreateIndex
CREATE INDEX "StaffAccessLog_staffId_createdAt_idx" ON "public"."StaffAccessLog"("staffId", "createdAt");

-- CreateIndex
CREATE INDEX "CashierSession_merchantId_startedAt_idx" ON "public"."CashierSession"("merchantId", "startedAt");

-- CreateIndex
CREATE INDEX "CashierSession_staffId_startedAt_idx" ON "public"."CashierSession"("staffId", "startedAt");

-- CreateIndex
CREATE INDEX "ProductCategory_merchantId_order_idx" ON "public"."ProductCategory"("merchantId", "order");

-- CreateIndex
CREATE INDEX "ProductCategory_merchantId_parentId_idx" ON "public"."ProductCategory"("merchantId", "parentId");

-- CreateIndex
CREATE UNIQUE INDEX "ProductCategory_merchantId_slug_key" ON "public"."ProductCategory"("merchantId", "slug");

-- CreateIndex
CREATE INDEX "Product_merchantId_categoryId_idx" ON "public"."Product"("merchantId", "categoryId");

-- CreateIndex
CREATE INDEX "Product_merchantId_order_idx" ON "public"."Product"("merchantId", "order");

-- CreateIndex
CREATE UNIQUE INDEX "Product_merchantId_sku_key" ON "public"."Product"("merchantId", "sku");

-- CreateIndex
CREATE INDEX "ProductImage_productId_position_idx" ON "public"."ProductImage"("productId", "position");

-- CreateIndex
CREATE INDEX "ProductVariant_productId_position_idx" ON "public"."ProductVariant"("productId", "position");

-- CreateIndex
CREATE INDEX "ProductStock_productId_idx" ON "public"."ProductStock"("productId");

-- CreateIndex
CREATE INDEX "ProductStock_productId_outletId_idx" ON "public"."ProductStock"("productId", "outletId");

-- CreateIndex
CREATE INDEX "ProductAttribute_productId_key_idx" ON "public"."ProductAttribute"("productId", "key");

-- CreateIndex
CREATE UNIQUE INDEX "ProductAttribute_productId_key_locale_key" ON "public"."ProductAttribute"("productId", "key", "locale");

-- CreateIndex
CREATE INDEX "ProductOption_productId_position_idx" ON "public"."ProductOption"("productId", "position");

-- CreateIndex
CREATE INDEX "ProductOptionValue_optionId_position_idx" ON "public"."ProductOptionValue"("optionId", "position");

-- CreateIndex
CREATE INDEX "ProductVariantOption_optionValueId_idx" ON "public"."ProductVariantOption"("optionValueId");

-- CreateIndex
CREATE UNIQUE INDEX "ProductVariantOption_variantId_optionId_key" ON "public"."ProductVariantOption"("variantId", "optionId");

-- CreateIndex
CREATE INDEX "LedgerEntry_merchantId_createdAt_idx" ON "public"."LedgerEntry"("merchantId", "createdAt");

-- CreateIndex
CREATE INDEX "LedgerEntry_merchantId_customerId_createdAt_idx" ON "public"."LedgerEntry"("merchantId", "customerId", "createdAt");

-- CreateIndex
CREATE INDEX "EarnLot_merchantId_customerId_earnedAt_idx" ON "public"."EarnLot"("merchantId", "customerId", "earnedAt");

-- CreateIndex
CREATE INDEX "EarnLot_merchantId_expiresAt_idx" ON "public"."EarnLot"("merchantId", "expiresAt");

-- CreateIndex
CREATE INDEX "AdminAudit_merchantId_createdAt_idx" ON "public"."AdminAudit"("merchantId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "TelegramBot_merchantId_key" ON "public"."TelegramBot"("merchantId");

-- CreateIndex
CREATE UNIQUE INDEX "TelegramBot_botToken_key" ON "public"."TelegramBot"("botToken");

-- CreateIndex
CREATE UNIQUE INDEX "TelegramBot_botUsername_key" ON "public"."TelegramBot"("botUsername");

-- CreateIndex
CREATE UNIQUE INDEX "TelegramStaffInvite_token_key" ON "public"."TelegramStaffInvite"("token");

-- CreateIndex
CREATE INDEX "TelegramStaffInvite_merchantId_createdAt_idx" ON "public"."TelegramStaffInvite"("merchantId", "createdAt");

-- CreateIndex
CREATE INDEX "TelegramStaffInvite_expiresAt_idx" ON "public"."TelegramStaffInvite"("expiresAt");

-- CreateIndex
CREATE INDEX "TelegramStaffSubscriber_merchantId_isActive_idx" ON "public"."TelegramStaffSubscriber"("merchantId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "TelegramStaffSubscriber_merchantId_chatId_key" ON "public"."TelegramStaffSubscriber"("merchantId", "chatId");

-- CreateIndex
CREATE UNIQUE INDEX "Subscription_merchantId_key" ON "public"."Subscription"("merchantId");

-- CreateIndex
CREATE UNIQUE INDEX "SegmentCustomer_segmentId_customerId_key" ON "public"."SegmentCustomer"("segmentId", "customerId");

-- CreateIndex
CREATE UNIQUE INDEX "PushDevice_token_key" ON "public"."PushDevice"("token");

-- CreateIndex
CREATE INDEX "PushDevice_customerId_idx" ON "public"."PushDevice"("customerId");

-- CreateIndex
CREATE UNIQUE INDEX "PushDevice_customerId_outletId_key" ON "public"."PushDevice"("customerId", "outletId");

-- CreateIndex
CREATE INDEX "CommunicationTemplate_merchantId_channel_idx" ON "public"."CommunicationTemplate"("merchantId", "channel");

-- CreateIndex
CREATE INDEX "CommunicationTask_merchantId_status_idx" ON "public"."CommunicationTask"("merchantId", "status");

-- CreateIndex
CREATE INDEX "CommunicationTask_channel_idx" ON "public"."CommunicationTask"("channel");

-- CreateIndex
CREATE INDEX "CommunicationTaskRecipient_taskId_status_idx" ON "public"."CommunicationTaskRecipient"("taskId", "status");

-- CreateIndex
CREATE INDEX "CommunicationTaskRecipient_merchantId_channel_idx" ON "public"."CommunicationTaskRecipient"("merchantId", "channel");

-- CreateIndex
CREATE INDEX "OtpCode_phone_idx" ON "public"."OtpCode"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "CustomerConsent_customerId_merchantId_channel_key" ON "public"."CustomerConsent"("customerId", "merchantId", "channel");

-- CreateIndex
CREATE UNIQUE INDEX "MerchantStats_merchantId_key" ON "public"."MerchantStats"("merchantId");

-- CreateIndex
CREATE UNIQUE INDEX "Referral_code_key" ON "public"."Referral"("code");

-- CreateIndex
CREATE UNIQUE INDEX "PersonalReferralCode_code_key" ON "public"."PersonalReferralCode"("code");

-- CreateIndex
CREATE UNIQUE INDEX "PersonalReferralCode_customerId_merchantId_key" ON "public"."PersonalReferralCode"("customerId", "merchantId");

-- CreateIndex
CREATE INDEX "PromoCode_merchantId_status_idx" ON "public"."PromoCode"("merchantId", "status");

-- CreateIndex
CREATE INDEX "PromoCode_segmentId_idx" ON "public"."PromoCode"("segmentId");

-- CreateIndex
CREATE UNIQUE INDEX "PromoCode_merchantId_code_key" ON "public"."PromoCode"("merchantId", "code");

-- CreateIndex
CREATE INDEX "PromoCodeUsage_promoCodeId_usedAt_idx" ON "public"."PromoCodeUsage"("promoCodeId", "usedAt");

-- CreateIndex
CREATE INDEX "PromoCodeUsage_merchantId_usedAt_idx" ON "public"."PromoCodeUsage"("merchantId", "usedAt");

-- CreateIndex
CREATE INDEX "PromoCodeUsage_customerId_idx" ON "public"."PromoCodeUsage"("customerId");

-- CreateIndex
CREATE UNIQUE INDEX "PromoCodeMetric_promoCodeId_key" ON "public"."PromoCodeMetric"("promoCodeId");

-- CreateIndex
CREATE INDEX "PromoCodeMetric_merchantId_idx" ON "public"."PromoCodeMetric"("merchantId");

-- CreateIndex
CREATE INDEX "loyalty_promotions_merchantId_status_idx" ON "public"."loyalty_promotions"("merchantId", "status");

-- CreateIndex
CREATE INDEX "loyalty_promotions_segmentId_idx" ON "public"."loyalty_promotions"("segmentId");

-- CreateIndex
CREATE INDEX "loyalty_promotions_merchantId_archivedAt_idx" ON "public"."loyalty_promotions"("merchantId", "archivedAt");

-- CreateIndex
CREATE INDEX "PromotionParticipant_merchantId_status_idx" ON "public"."PromotionParticipant"("merchantId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "PromotionParticipant_promotionId_customerId_key" ON "public"."PromotionParticipant"("promotionId", "customerId");

-- CreateIndex
CREATE UNIQUE INDEX "LoyaltyPromotionMetric_promotionId_key" ON "public"."LoyaltyPromotionMetric"("promotionId");

-- CreateIndex
CREATE INDEX "LoyaltyPromotionMetric_merchantId_idx" ON "public"."LoyaltyPromotionMetric"("merchantId");

-- CreateIndex
CREATE INDEX "LoyaltyMechanic_merchantId_type_idx" ON "public"."LoyaltyMechanic"("merchantId", "type");

-- CreateIndex
CREATE INDEX "LoyaltyMechanicLog_mechanicId_createdAt_idx" ON "public"."LoyaltyMechanicLog"("mechanicId", "createdAt");

-- CreateIndex
CREATE INDEX "LoyaltyMechanicLog_merchantId_createdAt_idx" ON "public"."LoyaltyMechanicLog"("merchantId", "createdAt");

-- CreateIndex
CREATE INDEX "LoyaltyTier_merchantId_order_idx" ON "public"."LoyaltyTier"("merchantId", "order");

-- CreateIndex
CREATE UNIQUE INDEX "LoyaltyTier_merchantId_name_key" ON "public"."LoyaltyTier"("merchantId", "name");

-- CreateIndex
CREATE INDEX "LoyaltyTierBenefit_tierId_order_idx" ON "public"."LoyaltyTierBenefit"("tierId", "order");

-- CreateIndex
CREATE INDEX "LoyaltyTierAssignment_tierId_idx" ON "public"."LoyaltyTierAssignment"("tierId");

-- CreateIndex
CREATE UNIQUE INDEX "LoyaltyTierAssignment_merchantId_customerId_key" ON "public"."LoyaltyTierAssignment"("merchantId", "customerId");

-- CreateIndex
CREATE INDEX "SyncLog_merchantId_createdAt_idx" ON "public"."SyncLog"("merchantId", "createdAt");

-- CreateIndex
CREATE INDEX "SyncLog_integrationId_createdAt_idx" ON "public"."SyncLog"("integrationId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Review_transactionId_key" ON "public"."Review"("transactionId");

-- CreateIndex
CREATE UNIQUE INDEX "ReviewResponse_reviewId_key" ON "public"."ReviewResponse"("reviewId");

-- CreateIndex
CREATE UNIQUE INDEX "ReviewReaction_reviewId_customerId_key" ON "public"."ReviewReaction"("reviewId", "customerId");

-- CreateIndex
CREATE INDEX "CustomerStats_merchantId_updatedAt_idx" ON "public"."CustomerStats"("merchantId", "updatedAt");

-- CreateIndex
CREATE INDEX "MerchantKpiDaily_merchantId_date_idx" ON "public"."MerchantKpiDaily"("merchantId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "MerchantKpiDaily_merchantId_date_key" ON "public"."MerchantKpiDaily"("merchantId", "date");

-- CreateIndex
CREATE INDEX "OutletKpiDaily_merchantId_date_idx" ON "public"."OutletKpiDaily"("merchantId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "OutletKpiDaily_outletId_date_key" ON "public"."OutletKpiDaily"("outletId", "date");

-- CreateIndex
CREATE INDEX "StaffKpiDaily_merchantId_date_idx" ON "public"."StaffKpiDaily"("merchantId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "StaffKpiDaily_staffId_outletId_date_key" ON "public"."StaffKpiDaily"("staffId", "outletId", "date");

-- CreateIndex
CREATE INDEX "SegmentMetricSnapshot_segmentId_periodStart_idx" ON "public"."SegmentMetricSnapshot"("segmentId", "periodStart");

-- CreateIndex
CREATE INDEX "SegmentMetricSnapshot_merchantId_periodStart_idx" ON "public"."SegmentMetricSnapshot"("merchantId", "periodStart");

-- CreateIndex
CREATE INDEX "DataImportJob_merchantId_type_idx" ON "public"."DataImportJob"("merchantId", "type");

-- CreateIndex
CREATE INDEX "DataImportJob_status_idx" ON "public"."DataImportJob"("status");

-- CreateIndex
CREATE INDEX "DataImportRow_jobId_status_idx" ON "public"."DataImportRow"("jobId", "status");

-- CreateIndex
CREATE INDEX "DataImportError_jobId_idx" ON "public"."DataImportError"("jobId");

-- CreateIndex
CREATE UNIQUE INDEX "DataImportMetric_jobId_key" ON "public"."DataImportMetric"("jobId");

-- AddForeignKey
ALTER TABLE "public"."Gift" ADD CONSTRAINT "Gift_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "public"."Merchant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."GiftRedemption" ADD CONSTRAINT "GiftRedemption_giftId_fkey" FOREIGN KEY ("giftId") REFERENCES "public"."Gift"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."GiftRedemption" ADD CONSTRAINT "GiftRedemption_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "public"."Merchant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."GiftRedemption" ADD CONSTRAINT "GiftRedemption_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "public"."Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."MerchantSettings" ADD CONSTRAINT "MerchantSettings_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "public"."Merchant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Consent" ADD CONSTRAINT "Consent_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "public"."Merchant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Consent" ADD CONSTRAINT "Consent_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "public"."Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Wallet" ADD CONSTRAINT "Wallet_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "public"."Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Wallet" ADD CONSTRAINT "Wallet_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "public"."Merchant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Hold" ADD CONSTRAINT "Hold_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "public"."Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Hold" ADD CONSTRAINT "Hold_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "public"."Merchant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Hold" ADD CONSTRAINT "Hold_outletId_fkey" FOREIGN KEY ("outletId") REFERENCES "public"."Outlet"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Hold" ADD CONSTRAINT "Hold_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "public"."Staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Receipt" ADD CONSTRAINT "Receipt_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "public"."Merchant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Receipt" ADD CONSTRAINT "Receipt_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "public"."Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Receipt" ADD CONSTRAINT "Receipt_outletId_fkey" FOREIGN KEY ("outletId") REFERENCES "public"."Outlet"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Receipt" ADD CONSTRAINT "Receipt_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "public"."Staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Transaction" ADD CONSTRAINT "Transaction_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "public"."Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Transaction" ADD CONSTRAINT "Transaction_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "public"."Merchant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Transaction" ADD CONSTRAINT "Transaction_outletId_fkey" FOREIGN KEY ("outletId") REFERENCES "public"."Outlet"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Transaction" ADD CONSTRAINT "Transaction_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "public"."Staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Outlet" ADD CONSTRAINT "Outlet_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "public"."Merchant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."OutletSchedule" ADD CONSTRAINT "OutletSchedule_outletId_fkey" FOREIGN KEY ("outletId") REFERENCES "public"."Outlet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Staff" ADD CONSTRAINT "Staff_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "public"."Merchant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."StaffOutletAccess" ADD CONSTRAINT "StaffOutletAccess_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "public"."Merchant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."StaffOutletAccess" ADD CONSTRAINT "StaffOutletAccess_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "public"."Staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."StaffOutletAccess" ADD CONSTRAINT "StaffOutletAccess_outletId_fkey" FOREIGN KEY ("outletId") REFERENCES "public"."Outlet"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."StaffOutletAccess" ADD CONSTRAINT "StaffOutletAccess_pinIssuedById_fkey" FOREIGN KEY ("pinIssuedById") REFERENCES "public"."Staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."StaffOutletAccess" ADD CONSTRAINT "StaffOutletAccess_revokedById_fkey" FOREIGN KEY ("revokedById") REFERENCES "public"."Staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."AccessGroup" ADD CONSTRAINT "AccessGroup_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "public"."Merchant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."AccessGroup" ADD CONSTRAINT "AccessGroup_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "public"."Staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."AccessGroup" ADD CONSTRAINT "AccessGroup_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "public"."Staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."AccessGroupPermission" ADD CONSTRAINT "AccessGroupPermission_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "public"."AccessGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."StaffAccessGroup" ADD CONSTRAINT "StaffAccessGroup_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "public"."Staff"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."StaffAccessGroup" ADD CONSTRAINT "StaffAccessGroup_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "public"."AccessGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."StaffAccessGroup" ADD CONSTRAINT "StaffAccessGroup_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "public"."Merchant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."StaffAccessGroup" ADD CONSTRAINT "StaffAccessGroup_assignedById_fkey" FOREIGN KEY ("assignedById") REFERENCES "public"."Staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."StaffInvitation" ADD CONSTRAINT "StaffInvitation_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "public"."Merchant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."StaffInvitation" ADD CONSTRAINT "StaffInvitation_accessGroupId_fkey" FOREIGN KEY ("accessGroupId") REFERENCES "public"."AccessGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."StaffInvitation" ADD CONSTRAINT "StaffInvitation_invitedById_fkey" FOREIGN KEY ("invitedById") REFERENCES "public"."Staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."StaffInvitation" ADD CONSTRAINT "StaffInvitation_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "public"."Staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."StaffAccessLog" ADD CONSTRAINT "StaffAccessLog_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "public"."Merchant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."StaffAccessLog" ADD CONSTRAINT "StaffAccessLog_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "public"."Staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."StaffAccessLog" ADD CONSTRAINT "StaffAccessLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "public"."Staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."CashierSession" ADD CONSTRAINT "CashierSession_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "public"."Merchant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."CashierSession" ADD CONSTRAINT "CashierSession_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "public"."Staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."CashierSession" ADD CONSTRAINT "CashierSession_outletId_fkey" FOREIGN KEY ("outletId") REFERENCES "public"."Outlet"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."CashierSession" ADD CONSTRAINT "CashierSession_pinAccessId_fkey" FOREIGN KEY ("pinAccessId") REFERENCES "public"."StaffOutletAccess"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ProductCategory" ADD CONSTRAINT "ProductCategory_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "public"."Merchant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ProductCategory" ADD CONSTRAINT "ProductCategory_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "public"."ProductCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Product" ADD CONSTRAINT "Product_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "public"."Merchant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Product" ADD CONSTRAINT "Product_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "public"."ProductCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ProductImage" ADD CONSTRAINT "ProductImage_productId_fkey" FOREIGN KEY ("productId") REFERENCES "public"."Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ProductVariant" ADD CONSTRAINT "ProductVariant_productId_fkey" FOREIGN KEY ("productId") REFERENCES "public"."Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ProductStock" ADD CONSTRAINT "ProductStock_productId_fkey" FOREIGN KEY ("productId") REFERENCES "public"."Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ProductStock" ADD CONSTRAINT "ProductStock_outletId_fkey" FOREIGN KEY ("outletId") REFERENCES "public"."Outlet"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ProductAttribute" ADD CONSTRAINT "ProductAttribute_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "public"."Merchant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ProductAttribute" ADD CONSTRAINT "ProductAttribute_productId_fkey" FOREIGN KEY ("productId") REFERENCES "public"."Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ProductOption" ADD CONSTRAINT "ProductOption_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "public"."Merchant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ProductOption" ADD CONSTRAINT "ProductOption_productId_fkey" FOREIGN KEY ("productId") REFERENCES "public"."Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ProductOptionValue" ADD CONSTRAINT "ProductOptionValue_optionId_fkey" FOREIGN KEY ("optionId") REFERENCES "public"."ProductOption"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ProductVariantOption" ADD CONSTRAINT "ProductVariantOption_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "public"."ProductVariant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ProductVariantOption" ADD CONSTRAINT "ProductVariantOption_optionId_fkey" FOREIGN KEY ("optionId") REFERENCES "public"."ProductOption"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ProductVariantOption" ADD CONSTRAINT "ProductVariantOption_optionValueId_fkey" FOREIGN KEY ("optionValueId") REFERENCES "public"."ProductOptionValue"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."TelegramBot" ADD CONSTRAINT "TelegramBot_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "public"."Merchant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."TelegramStaffInvite" ADD CONSTRAINT "TelegramStaffInvite_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "public"."Merchant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."TelegramStaffInvite" ADD CONSTRAINT "TelegramStaffInvite_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "public"."Staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."TelegramStaffSubscriber" ADD CONSTRAINT "TelegramStaffSubscriber_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "public"."Merchant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Subscription" ADD CONSTRAINT "Subscription_planId_fkey" FOREIGN KEY ("planId") REFERENCES "public"."Plan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Subscription" ADD CONSTRAINT "Subscription_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "public"."Merchant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."SegmentCustomer" ADD CONSTRAINT "SegmentCustomer_segmentId_fkey" FOREIGN KEY ("segmentId") REFERENCES "public"."CustomerSegment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."SegmentCustomer" ADD CONSTRAINT "SegmentCustomer_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "public"."Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."PushDevice" ADD CONSTRAINT "PushDevice_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "public"."Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."PushDevice" ADD CONSTRAINT "PushDevice_outletId_fkey" FOREIGN KEY ("outletId") REFERENCES "public"."Outlet"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."CommunicationTemplate" ADD CONSTRAINT "CommunicationTemplate_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "public"."Merchant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."CommunicationTemplate" ADD CONSTRAINT "CommunicationTemplate_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "public"."Staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."CommunicationTemplate" ADD CONSTRAINT "CommunicationTemplate_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "public"."Staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."CommunicationTask" ADD CONSTRAINT "CommunicationTask_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "public"."Merchant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."CommunicationTask" ADD CONSTRAINT "CommunicationTask_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "public"."CommunicationTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."CommunicationTask" ADD CONSTRAINT "CommunicationTask_audienceId_fkey" FOREIGN KEY ("audienceId") REFERENCES "public"."CustomerSegment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."CommunicationTask" ADD CONSTRAINT "CommunicationTask_promotionId_fkey" FOREIGN KEY ("promotionId") REFERENCES "public"."loyalty_promotions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."CommunicationTask" ADD CONSTRAINT "CommunicationTask_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "public"."Staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."CommunicationTaskRecipient" ADD CONSTRAINT "CommunicationTaskRecipient_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "public"."CommunicationTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."CommunicationTaskRecipient" ADD CONSTRAINT "CommunicationTaskRecipient_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "public"."Merchant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."CommunicationTaskRecipient" ADD CONSTRAINT "CommunicationTaskRecipient_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "public"."Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ReferralProgram" ADD CONSTRAINT "ReferralProgram_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "public"."Merchant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Referral" ADD CONSTRAINT "Referral_programId_fkey" FOREIGN KEY ("programId") REFERENCES "public"."ReferralProgram"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Referral" ADD CONSTRAINT "Referral_referrerId_fkey" FOREIGN KEY ("referrerId") REFERENCES "public"."Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Referral" ADD CONSTRAINT "Referral_refereeId_fkey" FOREIGN KEY ("refereeId") REFERENCES "public"."Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."PersonalReferralCode" ADD CONSTRAINT "PersonalReferralCode_programId_fkey" FOREIGN KEY ("programId") REFERENCES "public"."ReferralProgram"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."PromoCode" ADD CONSTRAINT "PromoCode_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "public"."Merchant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."PromoCode" ADD CONSTRAINT "PromoCode_segmentId_fkey" FOREIGN KEY ("segmentId") REFERENCES "public"."CustomerSegment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."PromoCode" ADD CONSTRAINT "PromoCode_assignTierId_fkey" FOREIGN KEY ("assignTierId") REFERENCES "public"."LoyaltyTier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."PromoCode" ADD CONSTRAINT "PromoCode_upgradeTierId_fkey" FOREIGN KEY ("upgradeTierId") REFERENCES "public"."LoyaltyTier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."PromoCode" ADD CONSTRAINT "PromoCode_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "public"."Staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."PromoCode" ADD CONSTRAINT "PromoCode_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "public"."Staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."PromoCodeUsage" ADD CONSTRAINT "PromoCodeUsage_promoCodeId_fkey" FOREIGN KEY ("promoCodeId") REFERENCES "public"."PromoCode"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."PromoCodeUsage" ADD CONSTRAINT "PromoCodeUsage_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "public"."Merchant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."PromoCodeUsage" ADD CONSTRAINT "PromoCodeUsage_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "public"."Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."PromoCodeUsage" ADD CONSTRAINT "PromoCodeUsage_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "public"."Staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."PromoCodeUsage" ADD CONSTRAINT "PromoCodeUsage_outletId_fkey" FOREIGN KEY ("outletId") REFERENCES "public"."Outlet"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."PromoCodeMetric" ADD CONSTRAINT "PromoCodeMetric_promoCodeId_fkey" FOREIGN KEY ("promoCodeId") REFERENCES "public"."PromoCode"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."PromoCodeMetric" ADD CONSTRAINT "PromoCodeMetric_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "public"."Merchant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."loyalty_promotions" ADD CONSTRAINT "loyalty_promotions_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "public"."Merchant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."loyalty_promotions" ADD CONSTRAINT "loyalty_promotions_segmentId_fkey" FOREIGN KEY ("segmentId") REFERENCES "public"."CustomerSegment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."loyalty_promotions" ADD CONSTRAINT "loyalty_promotions_targetTierId_fkey" FOREIGN KEY ("targetTierId") REFERENCES "public"."LoyaltyTier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."loyalty_promotions" ADD CONSTRAINT "loyalty_promotions_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "public"."Staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."loyalty_promotions" ADD CONSTRAINT "loyalty_promotions_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "public"."Staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."loyalty_promotions" ADD CONSTRAINT "loyalty_promotions_pushTemplateStartId_fkey" FOREIGN KEY ("pushTemplateStartId") REFERENCES "public"."CommunicationTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."loyalty_promotions" ADD CONSTRAINT "loyalty_promotions_pushTemplateReminderId_fkey" FOREIGN KEY ("pushTemplateReminderId") REFERENCES "public"."CommunicationTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."PromotionParticipant" ADD CONSTRAINT "PromotionParticipant_promotionId_fkey" FOREIGN KEY ("promotionId") REFERENCES "public"."loyalty_promotions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."PromotionParticipant" ADD CONSTRAINT "PromotionParticipant_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "public"."Merchant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."PromotionParticipant" ADD CONSTRAINT "PromotionParticipant_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "public"."Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."PromotionParticipant" ADD CONSTRAINT "PromotionParticipant_outletId_fkey" FOREIGN KEY ("outletId") REFERENCES "public"."Outlet"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."LoyaltyPromotionMetric" ADD CONSTRAINT "LoyaltyPromotionMetric_promotionId_fkey" FOREIGN KEY ("promotionId") REFERENCES "public"."loyalty_promotions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."LoyaltyPromotionMetric" ADD CONSTRAINT "LoyaltyPromotionMetric_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "public"."Merchant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."LoyaltyMechanic" ADD CONSTRAINT "LoyaltyMechanic_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "public"."Merchant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."LoyaltyMechanic" ADD CONSTRAINT "LoyaltyMechanic_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "public"."Staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."LoyaltyMechanic" ADD CONSTRAINT "LoyaltyMechanic_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "public"."Staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."LoyaltyMechanicLog" ADD CONSTRAINT "LoyaltyMechanicLog_mechanicId_fkey" FOREIGN KEY ("mechanicId") REFERENCES "public"."LoyaltyMechanic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."LoyaltyMechanicLog" ADD CONSTRAINT "LoyaltyMechanicLog_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "public"."Merchant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."LoyaltyMechanicLog" ADD CONSTRAINT "LoyaltyMechanicLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "public"."Staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."LoyaltyTier" ADD CONSTRAINT "LoyaltyTier_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "public"."Merchant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."LoyaltyTierBenefit" ADD CONSTRAINT "LoyaltyTierBenefit_tierId_fkey" FOREIGN KEY ("tierId") REFERENCES "public"."LoyaltyTier"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."LoyaltyTierAssignment" ADD CONSTRAINT "LoyaltyTierAssignment_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "public"."Merchant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."LoyaltyTierAssignment" ADD CONSTRAINT "LoyaltyTierAssignment_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "public"."Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."LoyaltyTierAssignment" ADD CONSTRAINT "LoyaltyTierAssignment_tierId_fkey" FOREIGN KEY ("tierId") REFERENCES "public"."LoyaltyTier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."LoyaltyTierAssignment" ADD CONSTRAINT "LoyaltyTierAssignment_assignedById_fkey" FOREIGN KEY ("assignedById") REFERENCES "public"."Staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Payment" ADD CONSTRAINT "Payment_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "public"."Subscription"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."FraudCheck" ADD CONSTRAINT "FraudCheck_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "public"."Merchant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Integration" ADD CONSTRAINT "Integration_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "public"."Merchant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."CustomerSegment" ADD CONSTRAINT "CustomerSegment_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "public"."Merchant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."CustomerSegment" ADD CONSTRAINT "CustomerSegment_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "public"."Staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."CustomerSegment" ADD CONSTRAINT "CustomerSegment_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "public"."Staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Review" ADD CONSTRAINT "Review_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "public"."Merchant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Review" ADD CONSTRAINT "Review_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "public"."Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Review" ADD CONSTRAINT "Review_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "public"."Transaction"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ReviewResponse" ADD CONSTRAINT "ReviewResponse_reviewId_fkey" FOREIGN KEY ("reviewId") REFERENCES "public"."Review"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ReviewResponse" ADD CONSTRAINT "ReviewResponse_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "public"."Staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ReviewReaction" ADD CONSTRAINT "ReviewReaction_reviewId_fkey" FOREIGN KEY ("reviewId") REFERENCES "public"."Review"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ReviewReaction" ADD CONSTRAINT "ReviewReaction_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "public"."Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."CustomerStats" ADD CONSTRAINT "CustomerStats_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "public"."Merchant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."CustomerStats" ADD CONSTRAINT "CustomerStats_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "public"."Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."MerchantKpiDaily" ADD CONSTRAINT "MerchantKpiDaily_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "public"."Merchant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."OutletKpiDaily" ADD CONSTRAINT "OutletKpiDaily_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "public"."Merchant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."OutletKpiDaily" ADD CONSTRAINT "OutletKpiDaily_outletId_fkey" FOREIGN KEY ("outletId") REFERENCES "public"."Outlet"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."StaffKpiDaily" ADD CONSTRAINT "StaffKpiDaily_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "public"."Merchant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."StaffKpiDaily" ADD CONSTRAINT "StaffKpiDaily_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "public"."Staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."StaffKpiDaily" ADD CONSTRAINT "StaffKpiDaily_outletId_fkey" FOREIGN KEY ("outletId") REFERENCES "public"."Outlet"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."SegmentMetricSnapshot" ADD CONSTRAINT "SegmentMetricSnapshot_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "public"."Merchant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."SegmentMetricSnapshot" ADD CONSTRAINT "SegmentMetricSnapshot_segmentId_fkey" FOREIGN KEY ("segmentId") REFERENCES "public"."CustomerSegment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."DataImportJob" ADD CONSTRAINT "DataImportJob_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "public"."Merchant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."DataImportJob" ADD CONSTRAINT "DataImportJob_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "public"."Staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."DataImportRow" ADD CONSTRAINT "DataImportRow_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "public"."DataImportJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."DataImportError" ADD CONSTRAINT "DataImportError_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "public"."DataImportJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."DataImportMetric" ADD CONSTRAINT "DataImportMetric_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "public"."DataImportJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;
