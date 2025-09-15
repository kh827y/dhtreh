import { PrismaService } from '../prisma.service';

export async function upsertIntegration(
  prisma: PrismaService,
  merchantId: string,
  provider: string,
  config: Record<string, unknown>,
  credentials?: Record<string, unknown>
): Promise<string> {
  const p: any = prisma as any;
  const found = await p.integration.findFirst({ where: { merchantId, provider } });
  if (found) {
    await p.integration.update({
      where: { id: found.id },
      data: { config, credentials, isActive: true },
    });
    return found.id as string;
  }
  const created = await p.integration.create({
    data: {
      merchantId,
      type: 'POS',
      provider,
      config,
      credentials,
      isActive: true,
    },
  });
  return created.id as string;
}
