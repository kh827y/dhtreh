import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../../core/prisma/prisma.service';
import { LookupCacheService } from '../../../core/cache/lookup-cache.service';
import { UpdateOutletDto } from '../dto';

@Injectable()
export class MerchantsOutletsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: LookupCacheService,
  ) {}

  async listOutlets(merchantId: string) {
    const items = await this.prisma.outlet.findMany({
      where: { merchantId },
      orderBy: { createdAt: 'asc' },
    });
    return items.map((out) => this.mapOutlet(out));
  }

  async createOutlet(merchantId: string, name: string) {
    await this.ensureMerchant(merchantId);
    await this.assertOutletLimit(merchantId);
    const created = await this.prisma.outlet.create({
      data: { merchantId, name },
    });
    this.cache.invalidateOutlet(merchantId, created.id);
    return this.mapOutlet(created);
  }

  async updateOutlet(
    merchantId: string,
    outletId: string,
    dto: UpdateOutletDto,
  ) {
    await this.ensureOutlet(merchantId, outletId);
    const updated = await this.prisma.outlet.update({
      where: { id: outletId },
      data: {
        name:
          dto.name != null && String(dto.name).trim()
            ? String(dto.name).trim()
            : undefined,
      },
    });
    this.cache.invalidateOutlet(merchantId, outletId);
    return this.mapOutlet(updated);
  }

  async deleteOutlet(merchantId: string, outletId: string) {
    await this.ensureOutlet(merchantId, outletId);
    await this.prisma.$transaction(async (tx) => {
      await tx.staffOutletAccess.deleteMany({
        where: { merchantId, outletId },
      });
      await tx.cashierSession.deleteMany({ where: { merchantId, outletId } });
      await tx.promoCodeUsage.deleteMany({ where: { merchantId, outletId } });
      await tx.promotionParticipant.deleteMany({
        where: { merchantId, outletId },
      });
      await tx.staffKpiDaily.deleteMany({ where: { outletId } });
      await tx.staffMotivationEntry.deleteMany({ where: { outletId } });
      await tx.outletKpiDaily.deleteMany({ where: { outletId } });
      await tx.pushDevice.deleteMany({ where: { outletId } });
      await tx.device.deleteMany({ where: { outletId } });
      await tx.outlet.delete({ where: { id: outletId } });
    });
    this.cache.invalidateOutlet(merchantId, outletId);
    return { ok: true };
  }

  async updateOutletStatus(
    merchantId: string,
    outletId: string,
    status: 'ACTIVE' | 'INACTIVE',
  ) {
    if (status !== 'ACTIVE' && status !== 'INACTIVE')
      throw new BadRequestException('Invalid status');
    await this.ensureOutlet(merchantId, outletId);
    const updated = await this.prisma.outlet.update({
      where: { id: outletId },
      data: { status },
    });
    this.cache.invalidateOutlet(merchantId, outletId);
    return this.mapOutlet(updated);
  }

  private mapOutlet(entity: { id: string; merchantId: string; name: string }) {
    return {
      id: entity.id,
      merchantId: entity.merchantId,
      name: entity.name,
      status: (entity as { status?: string }).status,
      createdAt: (entity as { createdAt?: Date }).createdAt,
      updatedAt: (entity as { updatedAt?: Date }).updatedAt,
    } as const;
  }

  private async ensureOutlet(merchantId: string, outletId: string) {
    const outlet = await this.prisma.outlet.findUnique({
      where: { id: outletId },
    });
    if (!outlet || outlet.merchantId !== merchantId)
      throw new NotFoundException('Outlet not found');
    return outlet;
  }

  private async ensureMerchant(merchantId: string) {
    await this.prisma.merchant.upsert({
      where: { id: merchantId },
      update: {},
      create: { id: merchantId, name: merchantId, initialName: merchantId },
    });
  }

  private async assertOutletLimit(merchantId: string) {
    const settings = await this.prisma.merchantSettings.findUnique({
      where: { merchantId },
      select: { maxOutlets: true },
    });
    const limit = settings?.maxOutlets ?? null;
    if (limit == null || limit <= 0) return;
    const count = await this.prisma.outlet.count({ where: { merchantId } });
    if (count >= limit) {
      throw new BadRequestException('Вы достигли лимита торговых точек.');
    }
  }
}
