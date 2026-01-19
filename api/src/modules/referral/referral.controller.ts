import {
  Body,
  BadRequestException,
  Controller,
  Get,
  Param,
  Post,
  Put,
  Req,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { ReferralService } from './referral.service';
import type { CreateReferralProgramDto } from './referral.service';
import { ApiKeyGuard } from '../../core/guards/api-key.guard';
import { TelegramMiniappGuard } from '../../core/guards/telegram-miniapp.guard';
import type { TelegramAuthContext } from '../loyalty/telegram-auth.helper';

@ApiTags('Referral Program')
@Controller('referral')
@ApiBearerAuth()
export class ReferralController {
  constructor(private readonly referralService: ReferralService) {}

  /**
   * Создать реферальную программу
   */
  @UseGuards(ApiKeyGuard)
  @Post('program')
  @ApiOperation({ summary: 'Создать новую реферальную программу' })
  @ApiResponse({ status: 201, description: 'Программа создана' })
  async createProgram(@Body() dto: CreateReferralProgramDto) {
    return this.referralService.createReferralProgram(dto);
  }

  /**
   * Получить активную программу
   */
  @UseGuards(ApiKeyGuard)
  @Get('program/:merchantId')
  @ApiOperation({ summary: 'Получить активную реферальную программу мерчанта' })
  async getProgram(@Param('merchantId') merchantId: string) {
    return this.referralService.getActiveProgram(merchantId);
  }

  /**
   * Обновить программу
   */
  @UseGuards(ApiKeyGuard)
  @Put('program/:programId')
  @ApiOperation({ summary: 'Обновить реферальную программу' })
  async updateProgram(
    @Param('programId') programId: string,
    @Body() dto: Partial<CreateReferralProgramDto>,
  ) {
    return this.referralService.updateProgram(programId, dto);
  }

  /**
   * Активировать реферальный код
   */
  @UseGuards(TelegramMiniappGuard)
  @Post('activate')
  @ApiOperation({ summary: 'Активировать реферальный код при регистрации' })
  async activateReferral(
    @Req() req: { teleauth?: TelegramAuthContext | null },
    @Body()
    dto: {
      code: string;
      refereeId?: string;
      customerId?: string;
    },
  ) {
    const teleauthCustomerId =
      typeof req?.teleauth?.customerId === 'string'
        ? req.teleauth.customerId.trim()
        : '';
    const refereeId = teleauthCustomerId
      ? teleauthCustomerId
      : dto.customerId
        ? await this.referralService.resolveCustomerId(dto.customerId)
        : dto.refereeId;
    if (!refereeId) {
      throw new BadRequestException('refereeId or customerId required');
    }
    return this.referralService.activateReferral(dto.code, refereeId);
  }

  /**
   * Завершить реферал после покупки
   */
  @UseGuards(ApiKeyGuard)
  @Post('complete')
  @ApiOperation({ summary: 'Завершить реферал после первой покупки' })
  async completeReferral(
    @Body()
    dto: {
      refereeId: string;
      merchantId: string;
      purchaseAmount: number;
    },
  ) {
    return this.referralService.completeReferral(
      dto.refereeId,
      dto.merchantId,
      dto.purchaseAmount,
    );
  }

  /**
   * Получить статистику программы
   */
  @UseGuards(ApiKeyGuard)
  @Get('stats/:merchantId')
  @ApiOperation({ summary: 'Получить статистику реферальной программы' })
  async getStats(
    @Param('merchantId') merchantId: string,
    @Query('programId') programId?: string,
  ) {
    return this.referralService.getReferralStats(merchantId, programId);
  }

  /**
   * Получить рефералы клиента
   */
  @UseGuards(ApiKeyGuard)
  @Get('customer/:customerId')
  @ApiOperation({ summary: 'Получить список рефералов клиента' })
  async getCustomerReferrals(
    @Param('customerId') customerId: string,
    @Query('merchantId') merchantId: string,
  ) {
    const resolvedCustomerId = await this.referralService.resolveCustomerId(
      customerId,
      merchantId,
    );
    return this.referralService.getCustomerReferrals(
      resolvedCustomerId,
      merchantId,
    );
  }

  /**
   * Получить персональную реферальную ссылку
   */
  @UseGuards(TelegramMiniappGuard)
  @Get('link/:customerId')
  @ApiOperation({ summary: 'Получить персональную реферальную ссылку клиента' })
  async getCustomerLink(
    @Param('customerId') customerId: string,
    @Query('merchantId') merchantId: string,
  ) {
    const resolvedCustomerId = await this.referralService.resolveCustomerId(
      customerId,
      merchantId,
    );
    return this.referralService.getCustomerReferralLink(
      resolvedCustomerId,
      merchantId,
    );
  }

  /**
   * Топ рефереров
   */
  @UseGuards(ApiKeyGuard)
  @Get('leaderboard/:merchantId')
  @ApiOperation({ summary: 'Получить топ приглашающих клиентов' })
  async getLeaderboard(
    @Param('merchantId') merchantId: string,
    @Query('limit') limit?: string,
  ) {
    const stats = await this.referralService.getReferralStats(merchantId);
    return {
      leaderboard: stats.topReferrers.slice(0, parseInt(limit || '10')),
      totalParticipants: stats.totalReferrals,
    };
  }
}
