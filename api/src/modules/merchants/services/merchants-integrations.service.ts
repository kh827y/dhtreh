import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../core/prisma/prisma.service';

@Injectable()
export class MerchantsIntegrationsService {
  constructor(private readonly prisma: PrismaService) {}

  async listIntegrations(merchantId: string) {
    return this.prisma.integration.findMany({
      where: { merchantId },
      orderBy: { updatedAt: 'desc' },
      select: {
        id: true,
        type: true,
        provider: true,
        isActive: true,
        lastSync: true,
        errorCount: true,
      },
    });
  }
}
