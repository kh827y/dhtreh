import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiOkResponse, ApiTags, getSchemaPath } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { LoyaltyService } from '../services/loyalty.service';
import { LevelsService } from '../../levels/levels.service';
import { PrismaService } from '../../../core/prisma/prisma.service';
import { LookupCacheService } from '../../../core/cache/lookup-cache.service';
import { CashierGuard } from '../../../core/guards/cashier.guard';
import { SubscriptionGuard } from '../../../core/guards/subscription.guard';
import {
  ConsentGetRespDto,
  OkDto,
  PublicOutletDto,
  PublicStaffDto,
  TransactionsRespDto,
} from '../dto/dto';
import { LoyaltyControllerBase } from './loyalty.controller-base';

@ApiTags('loyalty')
@UseGuards(CashierGuard, SubscriptionGuard)
@Controller('loyalty')
export class LoyaltyMetaController extends LoyaltyControllerBase {
  constructor(
    private readonly service: LoyaltyService,
    prisma: PrismaService,
    private readonly levelsService: LevelsService,
    cache: LookupCacheService,
  ) {
    super(prisma, cache);
  }

  @Get('transactions')
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @ApiOkResponse({ schema: { $ref: getSchemaPath(TransactionsRespDto) } })
  transactions(
    @Query('merchantId') merchantId: string,
    @Query('customerId') customerId: string,
    @Query('limit') limitStr?: string,
    @Query('before') beforeStr?: string,
    @Query('outletId') outletId?: string,
    @Query('staffId') staffId?: string,
  ) {
    const limit = limitStr
      ? Math.min(Math.max(parseInt(limitStr, 10) || 20, 1), 100)
      : 20;
    const before = beforeStr ? new Date(beforeStr) : undefined;
    if (beforeStr && Number.isNaN(before?.getTime() ?? NaN)) {
      throw new BadRequestException('before is invalid');
    }
    return this.service.transactions(merchantId, customerId, limit, before, {
      outletId,
      staffId,
    });
  }

  // Публичные списки для фронтов (без AdminGuard)
  @Get('outlets/:merchantId')
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @ApiOkResponse({
    schema: { type: 'array', items: { $ref: getSchemaPath(PublicOutletDto) } },
  })
  async publicOutlets(@Param('merchantId') merchantId: string) {
    const items = await this.prisma.outlet.findMany({
      where: { merchantId },
      orderBy: { name: 'asc' },
    });
    return items.map((o) => ({
      id: o.id,
      name: o.name,
    }));
  }

  @Get('staff/:merchantId')
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @ApiOkResponse({
    schema: { type: 'array', items: { $ref: getSchemaPath(PublicStaffDto) } },
  })
  async publicStaff(@Param('merchantId') merchantId: string) {
    const items = await this.prisma.staff.findMany({
      where: { merchantId, status: 'ACTIVE' },
      orderBy: { createdAt: 'asc' },
    });
    return items.map((s) => ({
      id: s.id,
      role: s.role,
    }));
  }

  // Согласия на коммуникации
  @Get('consent')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @ApiOkResponse({ schema: { $ref: getSchemaPath(ConsentGetRespDto) } })
  async getConsent(
    @Query('merchantId') merchantId: string,
    @Query('customerId') customerId: string,
  ) {
    const customer = await this.ensureCustomer(merchantId, customerId);
    const c = await this.prisma.consent.findUnique({
      where: { merchantId_customerId: { merchantId, customerId: customer.id } },
    });
    return { granted: !!c, consentAt: c?.consentAt?.toISOString() };
  }

  @Get('bootstrap')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  async bootstrap(
    @Query('merchantId') merchantId: string,
    @Query('customerId') customerId: string,
    @Query('transactionsLimit') txLimitStr?: string,
  ) {
    const limit = txLimitStr
      ? Math.min(Math.max(parseInt(txLimitStr, 10) || 20, 1), 100)
      : 20;
    const customer = await this.ensureCustomer(merchantId, customerId);
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
        this.listPromotionsForCustomer(merchantId, customerId),
      ]);
    return {
      profile: this.toProfileDto(customer),
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

  @Post('consent')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @ApiOkResponse({ schema: { $ref: getSchemaPath(OkDto) } })
  async setConsent(
    @Body()
    body: {
      merchantId?: string;
      customerId?: string;
      granted?: boolean;
    },
  ) {
    if (!body?.merchantId || !body?.customerId)
      throw new BadRequestException('merchantId and customerId required');
    const customer = await this.ensureCustomer(
      body.merchantId,
      body.customerId,
    );
    if (body.granted) {
      await this.prisma.consent.upsert({
        where: {
          merchantId_customerId: {
            merchantId: body.merchantId,
            customerId: customer.id,
          },
        },
        update: { consentAt: new Date() },
        create: {
          merchantId: body.merchantId,
          customerId: customer.id,
          consentAt: new Date(),
        },
      });
    } else {
      try {
        await this.prisma.consent.delete({
          where: {
            merchantId_customerId: {
              merchantId: body.merchantId,
              customerId: customer.id,
            },
          },
        });
      } catch {}
    }
    return { ok: true };
  }
}
