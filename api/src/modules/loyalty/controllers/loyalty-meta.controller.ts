import {
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
import { CashierGuard } from '../../../core/guards/cashier.guard';
import { SubscriptionGuard } from '../../../core/guards/subscription.guard';
import {
  ConsentGetRespDto,
  OkDto,
  PublicOutletDto,
  PublicStaffDto,
  TransactionsRespDto,
} from '../dto/dto';
import { LoyaltyMetaUseCase } from '../use-cases/loyalty-meta.use-case';

@ApiTags('loyalty')
@UseGuards(CashierGuard, SubscriptionGuard)
@Controller('loyalty')
export class LoyaltyMetaController {
  constructor(private readonly useCase: LoyaltyMetaUseCase) {}

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
    return this.useCase.transactions(
      merchantId,
      customerId,
      limitStr,
      beforeStr,
      outletId,
      staffId,
    );
  }

  // Публичные списки для фронтов (без AdminGuard)
  @Get('outlets/:merchantId')
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @ApiOkResponse({
    schema: { type: 'array', items: { $ref: getSchemaPath(PublicOutletDto) } },
  })
  async publicOutlets(@Param('merchantId') merchantId: string) {
    return this.useCase.publicOutlets(merchantId);
  }

  @Get('staff/:merchantId')
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @ApiOkResponse({
    schema: { type: 'array', items: { $ref: getSchemaPath(PublicStaffDto) } },
  })
  async publicStaff(@Param('merchantId') merchantId: string) {
    return this.useCase.publicStaff(merchantId);
  }

  // Согласия на коммуникации
  @Get('consent')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @ApiOkResponse({ schema: { $ref: getSchemaPath(ConsentGetRespDto) } })
  async getConsent(
    @Query('merchantId') merchantId: string,
    @Query('customerId') customerId: string,
  ) {
    return this.useCase.getConsent(merchantId, customerId);
  }

  @Get('bootstrap')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  async bootstrap(
    @Query('merchantId') merchantId: string,
    @Query('customerId') customerId: string,
    @Query('transactionsLimit') txLimitStr?: string,
  ) {
    return this.useCase.bootstrap(merchantId, customerId, txLimitStr);
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
    return this.useCase.setConsent(body);
  }
}
