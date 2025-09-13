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
import { VoucherService } from './voucher.service';
import type { CreateVoucherDto, CreateGiftCardDto, RedeemVoucherDto } from './voucher.service';
import { ApiKeyGuard } from '../guards/api-key.guard';

@ApiTags('Vouchers & Gift Cards')
@Controller('vouchers')
@UseGuards(ApiKeyGuard)
@ApiBearerAuth()
export class VoucherController {
  constructor(private readonly voucherService: VoucherService) {}

  /**
   * Создать ваучер/купон
   */
  @Post('create')
  @ApiOperation({ summary: 'Создать новый ваучер или купон' })
  @ApiResponse({ status: 201, description: 'Ваучер создан' })
  async createVoucher(@Body() dto: CreateVoucherDto) {
    return this.voucherService.createVoucher(dto);
  }

  /**
   * Создать подарочную карту
   */
  @Post('gift-card')
  @ApiOperation({ summary: 'Создать подарочную карту' })
  @ApiResponse({ status: 201, description: 'Подарочная карта создана' })
  async createGiftCard(@Body() dto: CreateGiftCardDto) {
    return this.voucherService.createGiftCard(dto);
  }

  /**
   * Активировать ваучер
   */
  @Post('redeem')
  @ApiOperation({ summary: 'Активировать ваучер или подарочную карту' })
  async redeemVoucher(@Body() dto: RedeemVoucherDto) {
    return this.voucherService.redeemVoucher(dto);
  }

  /**
   * Проверить ваучер
   */
  @Get('check/:code')
  @ApiOperation({ summary: 'Проверить действительность ваучера' })
  async checkVoucher(
    @Param('code') code: string,
    @Query('merchantId') merchantId?: string,
  ) {
    return this.voucherService.checkVoucher(code, merchantId);
  }

  /**
   * Получить список ваучеров
   */
  @Get('merchant/:merchantId')
  @ApiOperation({ summary: 'Получить список ваучеров мерчанта' })
  async getVouchers(
    @Param('merchantId') merchantId: string,
    @Query('status') status?: string,
  ) {
    return this.voucherService.getVouchers(merchantId, status);
  }

  /**
   * Получить статистику ваучера
   */
  @Get('stats/:voucherId')
  @ApiOperation({ summary: 'Получить статистику использования ваучера' })
  async getVoucherStats(@Param('voucherId') voucherId: string) {
    return this.voucherService.getVoucherStats(voucherId);
  }

  /**
   * История использования ваучеров клиентом
   */
  @Get('customer/:customerId')
  @ApiOperation({ summary: 'Получить историю использования ваучеров клиентом' })
  async getCustomerVouchers(
    @Param('customerId') customerId: string,
    @Query('merchantId') merchantId?: string,
  ) {
    return this.voucherService.getCustomerVouchers(customerId, merchantId);
  }

  /**
   * Массовая генерация промокодов
   */
  @Post('generate-codes')
  @ApiOperation({ summary: 'Сгенерировать дополнительные промокоды для ваучера' })
  async generatePromoCodes(
    @Body() dto: {
      merchantId: string;
      voucherId: string;
      quantity: number;
    },
  ) {
    return this.voucherService.generatePromoCodes(
      dto.merchantId,
      dto.voucherId,
      dto.quantity,
    );
  }

  /**
   * Обновить ваучер
   */
  @Put(':voucherId')
  @ApiOperation({ summary: 'Обновить настройки ваучера' })
  async updateVoucher(
    @Param('voucherId') voucherId: string,
    @Body() dto: Partial<CreateVoucherDto>,
  ) {
    return this.voucherService.updateVoucher(voucherId, dto);
  }

  /**
   * Деактивировать ваучер
   */
  @Post(':voucherId/deactivate')
  @ApiOperation({ summary: 'Деактивировать ваучер' })
  async deactivateVoucher(@Param('voucherId') voucherId: string) {
    return this.voucherService.deactivateVoucher(voucherId);
  }

  /**
   * Шаблоны ваучеров
   */
  @Get('templates')
  @ApiOperation({ summary: 'Получить готовые шаблоны ваучеров для малого бизнеса' })
  async getVoucherTemplates() {
    return [
      {
        id: 'birthday_gift',
        name: 'Подарок на день рождения',
        type: 'VOUCHER',
        valueType: 'PERCENT',
        value: 20,
        description: 'Скидка 20% в честь дня рождения',
        validDays: 30,
        maxUsesPerCustomer: 1,
      },
      {
        id: 'welcome_coupon',
        name: 'Приветственный купон',
        type: 'COUPON',
        valueType: 'POINTS',
        value: 500,
        description: 'Бонус новым клиентам',
        validDays: 14,
        maxUsesPerCustomer: 1,
      },
      {
        id: 'gift_card_100',
        name: 'Подарочная карта 1000₽',
        type: 'GIFT_CARD',
        valueType: 'FIXED_AMOUNT',
        value: 1000,
        description: 'Подарочная карта номиналом 1000 рублей',
        validDays: 365,
      },
      {
        id: 'seasonal_sale',
        name: 'Сезонная распродажа',
        type: 'COUPON',
        valueType: 'PERCENT',
        value: 30,
        description: 'Скидка 30% на все товары',
        validDays: 7,
        quantity: 100,
      },
      {
        id: 'loyalty_reward',
        name: 'Награда за лояльность',
        type: 'VOUCHER',
        valueType: 'POINTS',
        value: 1000,
        description: 'Бонус постоянным клиентам',
        minPurchaseAmount: 5000,
        maxUsesPerCustomer: 3,
      },
    ];
  }
}
