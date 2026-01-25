import { BadRequestException, Injectable } from '@nestjs/common';
import { LoyaltyService } from '../services/loyalty.service';
import { LevelsService } from '../../levels/levels.service';
import { PrismaService } from '../../../core/prisma/prisma.service';
import { logIgnoredError } from '../../../shared/logging/ignore-error.util';
import { LoyaltyControllerSupportService } from '../services/loyalty-controller-support.service';
import {
  parseBoundedInt,
  parseOptionalDate,
  requireTrimmed,
} from './loyalty-input.util';

@Injectable()
export class LoyaltyMetaUseCase {
  constructor(
    private readonly service: LoyaltyService,
    private readonly prisma: PrismaService,
    private readonly levelsService: LevelsService,
    private readonly support: LoyaltyControllerSupportService,
  ) {}

  transactions(
    merchantId: string,
    customerId: string,
    limitStr?: string,
    beforeStr?: string,
    outletId?: string,
    staffId?: string,
  ) {
    const limit = parseBoundedInt(limitStr, 20, 1, 100);
    const before = parseOptionalDate(beforeStr, 'before is invalid');
    return this.service.transactions(merchantId, customerId, limit, before, {
      outletId,
      staffId,
    });
  }

  async publicOutlets(merchantId: string) {
    const items = await this.prisma.outlet.findMany({
      where: { merchantId },
      orderBy: { name: 'asc' },
    });
    return items.map((o) => ({
      id: o.id,
      name: o.name,
    }));
  }

  async publicStaff(merchantId: string) {
    const items = await this.prisma.staff.findMany({
      where: { merchantId, status: 'ACTIVE' },
      orderBy: { createdAt: 'asc' },
    });
    return items.map((s) => ({
      id: s.id,
      role: s.role,
    }));
  }

  async getConsent(merchantId: string, customerId: string) {
    const customer = await this.support.ensureCustomer(merchantId, customerId);
    const c = await this.prisma.consent.findUnique({
      where: { merchantId_customerId: { merchantId, customerId: customer.id } },
    });
    return { granted: !!c, consentAt: c?.consentAt?.toISOString() };
  }

  async bootstrap(merchantId: string, customerId: string, txLimitStr?: string) {
    const limit = parseBoundedInt(txLimitStr, 20, 1, 100);
    const customer = await this.support.ensureCustomer(merchantId, customerId);
    const consent = await this.prisma.consent.findUnique({
      where: {
        merchantId_customerId: {
          merchantId,
          customerId: customer.id,
        },
      },
    });
    const [balanceResp, levelsResp, transactionsResp, promotions] =
      await Promise.all([
        this.service.balance(merchantId, customerId),
        this.levelsService.getLevel(merchantId, customerId),
        this.service.transactions(merchantId, customerId, limit, undefined, {}),
        this.support.listPromotionsForCustomer(merchantId, customerId),
      ]);
    return {
      profile: this.support.toProfileDto(customer),
      consent: {
        granted: !!consent,
        consentAt: consent?.consentAt?.toISOString() ?? null,
      },
      balance: balanceResp,
      levels: levelsResp,
      transactions: transactionsResp,
      promotions,
    };
  }

  async setConsent(body: {
    merchantId?: string;
    customerId?: string;
    granted?: boolean;
  }) {
    const merchantId = requireTrimmed(
      body?.merchantId,
      'merchantId and customerId required',
    );
    const customerId = requireTrimmed(
      body?.customerId,
      'merchantId and customerId required',
    );
    const customer = await this.support.ensureCustomer(merchantId, customerId);
    if (body.granted) {
      await this.prisma.consent.upsert({
        where: {
          merchantId_customerId: {
            merchantId,
            customerId: customer.id,
          },
        },
        update: { consentAt: new Date() },
        create: {
          merchantId,
          customerId: customer.id,
          consentAt: new Date(),
        },
      });
    } else {
      try {
        await this.prisma.consent.delete({
          where: {
            merchantId_customerId: {
              merchantId,
              customerId: customer.id,
            },
          },
        });
      } catch (err) {
        logIgnoredError(
          err,
          'LoyaltyMetaUseCase delete consent',
          undefined,
          'debug',
        );
      }
    }
    return { ok: true };
  }
}
