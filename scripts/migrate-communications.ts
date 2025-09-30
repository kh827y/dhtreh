import { PrismaClient, CommunicationChannel } from '@prisma/client';

const prisma = new PrismaClient();

async function tableExists(tableName: string) {
  const result = await prisma.$queryRaw<{ table_name: string }[]>`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = ${tableName}
  `;
  return result.length > 0;
}

function buildPushPayload(row: any) {
  return {
    text: row.text ?? '',
    metadata: row.metadata ?? null,
  };
}

function buildTelegramPayload(row: any) {
  return {
    text: row.text ?? '',
    metadata: row.metadata ?? null,
  };
}

async function migratePushCampaigns() {
  const rows = await prisma.$queryRaw<any[]>`SELECT * FROM "public"."PushCampaign"`;
  let migrated = 0;
  for (const row of rows) {
    const data = {
      merchantId: row.merchantId,
      channel: CommunicationChannel.PUSH,
      templateId: null,
      audienceId: null,
      audienceName: row.audience ?? null,
      audienceSnapshot: row.audience ? { legacyAudience: row.audience } : null,
      promotionId: null,
      createdById: null,
      status: row.status ?? 'SCHEDULED',
      scheduledAt: row.scheduledAt ?? null,
      startedAt: null,
      completedAt: null,
      failedAt: null,
      payload: buildPushPayload(row),
      filters: null,
      stats: {
        totalRecipients: row.totalRecipients ?? 0,
        sent: row.sent ?? 0,
        failed: row.failed ?? 0,
      },
      media: null,
      timezone: row.timezone ?? null,
      archivedAt: row.archivedAt ?? null,
      totalRecipients: row.totalRecipients ?? 0,
      sentCount: row.sent ?? 0,
      failedCount: row.failed ?? 0,
      createdAt: row.createdAt ?? new Date(),
      updatedAt: row.updatedAt ?? new Date(),
    } as const;

    const existing = await prisma.communicationTask.findUnique({ where: { id: row.id } });
    if (existing) {
      await prisma.communicationTask.update({
        where: { id: row.id },
        data,
      });
    } else {
      await prisma.communicationTask.create({
        data: {
          id: row.id,
          ...data,
        },
      });
    }
    migrated += 1;
  }
  return migrated;
}

async function migrateTelegramCampaigns() {
  const rows = await prisma.$queryRaw<any[]>`SELECT * FROM "public"."TelegramCampaign"`;
  let migrated = 0;
  for (const row of rows) {
    const data = {
      merchantId: row.merchantId,
      channel: CommunicationChannel.TELEGRAM,
      templateId: null,
      audienceId: row.audienceId ?? null,
      audienceName: row.audienceName ?? null,
      audienceSnapshot: {
        legacyAudienceId: row.audienceId ?? null,
        audienceName: row.audienceName ?? null,
      },
      promotionId: null,
      createdById: null,
      status: row.status ?? 'SCHEDULED',
      scheduledAt: row.scheduledAt ?? null,
      startedAt: null,
      completedAt: null,
      failedAt: null,
      payload: buildTelegramPayload(row),
      filters: null,
      stats: {
        totalRecipients: row.totalRecipients ?? 0,
        sent: row.sent ?? 0,
        failed: row.failed ?? 0,
      },
      media: row.imageUrl ? { imageUrl: row.imageUrl } : null,
      timezone: row.timezone ?? null,
      archivedAt: row.archivedAt ?? null,
      totalRecipients: row.totalRecipients ?? 0,
      sentCount: row.sent ?? 0,
      failedCount: row.failed ?? 0,
      createdAt: row.createdAt ?? new Date(),
      updatedAt: row.updatedAt ?? new Date(),
    } as const;

    const existing = await prisma.communicationTask.findUnique({ where: { id: row.id } });
    if (existing) {
      await prisma.communicationTask.update({
        where: { id: row.id },
        data,
      });
    } else {
      await prisma.communicationTask.create({
        data: {
          id: row.id,
          ...data,
        },
      });
    }
    migrated += 1;
  }
  return migrated;
}

async function main() {
  const hasPush = await tableExists('PushCampaign');
  const hasTelegram = await tableExists('TelegramCampaign');
  if (!hasPush && !hasTelegram) {
    console.log('Legacy communication campaign tables are not present — nothing to migrate.');
    return;
  }

  const results: string[] = [];
  if (hasPush) {
    const count = await migratePushCampaigns();
    results.push(`migrated ${count} push campaigns`);
  }
  if (hasTelegram) {
    const count = await migrateTelegramCampaigns();
    results.push(`migrated ${count} telegram campaigns`);
  }
  console.log(`Communication migration complete: ${results.join(', ')}`);
}

main()
  .catch((err) => {
    console.error('Failed to migrate communications:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
