import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { CashierGuard } from '../../../core/guards/cashier.guard';
import { SubscriptionGuard } from '../../../core/guards/subscription.guard';
import {
  CustomerPhoneStatusDto,
  CustomerProfileDto,
  CustomerProfileSaveDto,
  TeleauthDto,
} from '../dto/dto';
import { LoyaltyProfileUseCase } from '../use-cases/loyalty-profile.use-case';

@ApiTags('loyalty')
@UseGuards(CashierGuard, SubscriptionGuard)
@Controller('loyalty')
export class LoyaltyProfileController {
  constructor(private readonly useCase: LoyaltyProfileUseCase) {}

  // Telegram miniapp auth: принимает merchantId + initData, валидирует токеном бота мерчанта и возвращает customerId
  @Post('teleauth')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async teleauth(@Body() body: TeleauthDto) {
    return this.useCase.teleauth(body);
  }

  @Get('profile')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @ApiOkResponse({ type: CustomerProfileDto })
  async getProfile(
    @Query('merchantId') merchantId: string,
    @Query('customerId') customerId: string,
  ) {
    return this.useCase.getProfile(merchantId, customerId);
  }

  @Get('profile/phone-status')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @ApiOkResponse({ type: CustomerPhoneStatusDto })
  async getProfilePhoneStatus(
    @Query('merchantId') merchantId: string,
    @Query('customerId') customerId: string,
  ) {
    return this.useCase.getProfilePhoneStatus(merchantId, customerId);
  }

  @Post('profile')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOkResponse({ type: CustomerProfileDto })
  async saveProfile(@Body() body: CustomerProfileSaveDto) {
    return this.useCase.saveProfile(body);
  }
}
