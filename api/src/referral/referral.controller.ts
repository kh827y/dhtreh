import {
  Controller,
  Get,
  Post,
  Put,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { ReferralService } from './referral.service';
import type { CreateReferralProgramDto, CreateReferralDto } from './referral.service';
import { ApiKeyGuard } from '../guards/api-key.guard';

@ApiTags('Referral Program')
@Controller('referral')
@UseGuards(ApiKeyGuard)
@ApiBearerAuth()
export class ReferralController {
  constructor(private readonly referralService: ReferralService) {}

  /**
   * Создать реферальную программу
   */
  @Post('program')
  @ApiOperation({ summary: 'Создать новую реферальную программу' })
  @ApiResponse({ status: 201, description: 'Программа создана' })
  async createProgram(@Body() dto: CreateReferralProgramDto) {
    return this.referralService.createReferralProgram(dto);
  }

  /**
   * Получить активную программу
   */
  @Get('program/:merchantId')
  @ApiOperation({ summary: 'Получить активную реферальную программу мерчанта' })
  async getProgram(@Param('merchantId') merchantId: string) {
    return this.referralService.getActiveProgram(merchantId);
  }

  /**
   * Обновить программу
   */
  @Put('program/:programId')
  @ApiOperation({ summary: 'Обновить реферальную программу' })
  async updateProgram(
    @Param('programId') programId: string,
    @Body() dto: Partial<CreateReferralProgramDto>,
  ) {
    return this.referralService.updateProgram(programId, dto);
  }

  /**
   * Создать реферальный код/ссылку
   */
  @Post('create')
  @ApiOperation({ summary: 'Создать реферальную ссылку для клиента' })
  async createReferral(@Body() dto: CreateReferralDto) {
    return this.referralService.createReferral(dto);
  }

  /**
   * Активировать реферальный код
   */
  @Post('activate')
  @ApiOperation({ summary: 'Активировать реферальный код при регистрации' })
  async activateReferral(
    @Body() dto: {
      code: string;
      refereeId: string;
    },
  ) {
    return this.referralService.activateReferral(dto.code, dto.refereeId);
  }

  /**
   * Завершить реферал после покупки
   */
  @Post('complete')
  @ApiOperation({ summary: 'Завершить реферал после первой покупки' })
  async completeReferral(
    @Body() dto: {
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
  @Get('customer/:customerId')
  @ApiOperation({ summary: 'Получить список рефералов клиента' })
  async getCustomerReferrals(
    @Param('customerId') customerId: string,
    @Query('merchantId') merchantId: string,
  ) {
    return this.referralService.getCustomerReferrals(customerId, merchantId);
  }

  /**
   * Получить персональную реферальную ссылку
   */
  @Get('link/:customerId')
  @ApiOperation({ summary: 'Получить персональную реферальную ссылку клиента' })
  async getCustomerLink(
    @Param('customerId') customerId: string,
    @Query('merchantId') merchantId: string,
  ) {
    return this.referralService.getCustomerReferralLink(customerId, merchantId);
  }

  /**
   * Проверить реферальный код
   */
  @Get('check/:code')
  @ApiOperation({ summary: 'Проверить действительность реферального кода' })
  async checkReferralCode(@Param('code') code: string) {
    return this.referralService.checkReferralCode(code);
  }

  /**
   * Топ рефереров
   */
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
