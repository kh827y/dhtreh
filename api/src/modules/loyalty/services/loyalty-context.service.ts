import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../../core/prisma/prisma.service';
import { normalizeDeviceCode } from '../../../shared/devices/device.util';
import type { CustomerContext } from '../loyalty.types';

@Injectable()
export class LoyaltyContextService {
  constructor(private readonly prisma: PrismaService) {}

  async ensureCustomerId(customerId: string) {
    const found = await this.prisma.customer.findUnique({
      where: { id: customerId },
    });
    if (!found) {
      throw new BadRequestException('customer not found');
    }
    return found;
  }

  async ensureCustomerContext(
    merchantId: string,
    customerId: string,
  ): Promise<CustomerContext> {
    const customer = await this.prisma.customer.findUnique({
      where: { id: customerId },
      select: {
        id: true,
        merchantId: true,
        accrualsBlocked: true,
        redemptionsBlocked: true,
      },
    });
    if (!customer || customer.merchantId !== merchantId) {
      throw new BadRequestException('customer not found');
    }
    return {
      customerId: customer.id,
      accrualsBlocked: Boolean(customer.accrualsBlocked),
      redemptionsBlocked: Boolean(customer.redemptionsBlocked),
    };
  }

  async ensureCustomerByTelegram(
    merchantId: string,
    tgId: string,
    _initData?: string,
  ): Promise<{ customerId: string }> {
    const existing = await this.prisma.customer.findUnique({
      where: { merchantId_tgId: { merchantId, tgId } },
      select: { id: true },
    });
    if (existing) {
      return { customerId: existing.id };
    }
    const customer = await this.prisma.customer.create({
      data: {
        merchantId,
        tgId,
      },
      select: { id: true },
    });
    return { customerId: customer.id };
  }

  async resolveOutletContext(
    merchantId: string,
    input: { outletId?: string | null },
  ) {
    const { outletId } = input;
    if (!outletId) return { outletId: null };
    try {
      const outlet = await this.prisma.outlet.findFirst({
        where: { id: outletId, merchantId },
        select: { id: true },
      });
      return { outletId: outlet?.id ?? null };
    } catch {
      return { outletId: null };
    }
  }

  async resolveDeviceContext(
    merchantId: string,
    rawDeviceId?: string | null,
    outletId?: string | null,
  ): Promise<{ id: string; code: string; outletId: string } | null> {
    if (!rawDeviceId) return null;
    const { code, normalized } = normalizeDeviceCode(String(rawDeviceId || ''));
    const device = await this.prisma.device.findFirst({
      where: {
        merchantId,
        codeNormalized: normalized,
        archivedAt: null,
      },
    });
    if (!device) {
      throw new BadRequestException('Устройство не найдено или удалено');
    }
    if (outletId && device.outletId !== outletId) {
      throw new BadRequestException(
        'Устройство привязано к другой торговой точке',
      );
    }
    return { id: device.id, code, outletId: device.outletId };
  }
}
