import { PrismaClient, PromotionRewardType, PromotionStatus } from '@prisma/client';

const prisma = new PrismaClient();

function mapStatus(status?: string | null): PromotionStatus {
  switch (status?.toUpperCase()) {
    case 'ACTIVE':
      return PromotionStatus.ACTIVE;
    case 'PAUSED':
      return PromotionStatus.PAUSED;
    case 'COMPLETED':
      return PromotionStatus.COMPLETED;
    default:
      return PromotionStatus.DRAFT;
  }
}

function mapRewardType(reward: any): PromotionRewardType {
  switch (reward?.type) {
    case 'POINTS':
      return PromotionRewardType.POINTS;
    case 'PERCENT':
      return PromotionRewardType.CASHBACK;
    case 'FIXED':
      return PromotionRewardType.DISCOUNT;
    case 'PRODUCT':
      return PromotionRewardType.CUSTOM;
    default:
      return PromotionRewardType.CUSTOM;
  }
}

function normalizeNumber(value: any): number | null {
  if (value == null) return null;
  const num = Number(value);
  return Number.isFinite(num) ? Math.round(num) : null;
}

function buildLegacyMetadata(campaign: any, reward: any) {
  return {
    legacyCampaign: {
      type: campaign.type,
      status: campaign.status,
      rules: campaign.content ?? {},
      reward,
      budget: campaign.budget ?? null,
      maxUsagePerCustomer: campaign.maxUsagePerCustomer ?? null,
      maxUsageTotal: campaign.maxUsageTotal ?? null,
      notificationChannels: campaign.notificationChannels ?? [],
      schedule: campaign.schedule ?? null,
      targetSegmentId: campaign.targetSegmentId ?? campaign.segmentId ?? null,
      startDate: campaign.startDate ?? campaign.startAt ?? null,
      endDate: campaign.endDate ?? campaign.endAt ?? null,
      metricsSnapshot: campaign.metrics ?? null,
    },
  };
}

async function main() {
  const campaigns = await prisma.campaign.findMany();
  if (!campaigns.length) {
    console.log('No campaigns found — nothing to migrate.');
    return;
  }

  let migrated = 0;
  for (const campaign of campaigns) {
    const reward = (campaign.reward as any) ?? {};
    const rewardType = mapRewardType(reward);
    const rewardValue = normalizeNumber(reward?.value);

    const data = {
      merchantId: campaign.merchantId,
      segmentId: campaign.targetSegmentId ?? campaign.segmentId ?? null,
      targetTierId: null,
      name: campaign.name,
      description: campaign.description ?? null,
      status: mapStatus(campaign.status),
      rewardType,
      rewardValue,
      rewardMetadata: { legacyReward: reward },
      pointsExpireInDays: null,
      pushTemplateStartId: null,
      pushTemplateReminderId: null,
      pushOnStart: false,
      pushReminderEnabled: false,
      reminderOffsetHours: null,
      autoLaunch: false,
      startAt: campaign.startDate ?? campaign.startAt ?? null,
      endAt: campaign.endDate ?? campaign.endAt ?? null,
      launchedAt: campaign.status === 'ACTIVE' ? campaign.startDate ?? campaign.startAt ?? new Date() : null,
      archivedAt: campaign.archivedAt ?? null,
      createdById: null,
      updatedById: null,
      metadata: buildLegacyMetadata(campaign, reward),
      createdAt: campaign.createdAt,
      updatedAt: campaign.updatedAt,
    } as const;

    await prisma.loyaltyPromotion.upsert({
      where: { id: campaign.id },
      update: data,
      create: {
        id: campaign.id,
        ...data,
      },
    });
    migrated += 1;
  }

  console.log(`Migrated ${migrated} campaigns into loyalty promotions.`);
}

main()
  .catch((err) => {
    console.error('Failed to migrate campaigns:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
