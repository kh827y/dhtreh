import { Body, Controller, Get, Param, Post, Put, UseGuards } from '@nestjs/common';
import { ApiHeader, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { AdminGuard } from '../admin.guard';
import { AdminIpGuard } from '../admin-ip.guard';
import { GiftsService } from './gifts.service';
import type { CreateGiftDto, UpdateGiftDto } from './dto';

@ApiTags('gifts')
@Controller('gifts')
export class GiftsController {
  constructor(private readonly gifts: GiftsService) {}

  // Публичный для мини-аппы список доступных подарков
  @Get(':merchantId')
  @ApiOkResponse({ description: 'Список доступных подарков' })
  async list(@Param('merchantId') merchantId: string) {
    return this.gifts.listGifts(merchantId);
  }

  // Админ: создать подарок
  @Post()
  @UseGuards(AdminGuard, AdminIpGuard)
  @ApiHeader({ name: 'X-Admin-Key', required: true })
  async create(@Body() dto: CreateGiftDto) {
    return this.gifts.createGift(dto);
  }

  // Админ: обновить подарок
  @Put(':giftId')
  @UseGuards(AdminGuard, AdminIpGuard)
  @ApiHeader({ name: 'X-Admin-Key', required: true })
  async update(@Param('giftId') giftId: string, @Body() dto: UpdateGiftDto) {
    return this.gifts.updateGift(giftId, dto);
  }

  // Мини-аппа: погашение подарка (списание баллов)
  @Post(':merchantId/:giftId/redeem')
  async redeem(
    @Param('merchantId') merchantId: string,
    @Param('giftId') giftId: string,
    @Body('customerId') customerId: string,
  ) {
    return this.gifts.redeemGift(merchantId, customerId, giftId);
  }
}
