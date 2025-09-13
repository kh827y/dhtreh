import {
  Controller,
  Post,
  Get,
  Body,
  Query,
  Param,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { SmsService } from './sms.service';
import type { SendNotificationDto } from './sms.service';
import { ApiKeyGuard } from '../../guards/api-key.guard';

@ApiTags('SMS Notifications')
@Controller('sms')
@UseGuards(ApiKeyGuard)
@ApiBearerAuth()
export class SmsController {
  constructor(private readonly smsService: SmsService) {}

  /**
   * Отправить SMS уведомление
   */
  @Post('send')
  @ApiOperation({ summary: 'Отправить SMS уведомление клиенту' })
  @ApiResponse({ status: 200, description: 'SMS отправлено' })
  @ApiResponse({ status: 400, description: 'Ошибка отправки' })
  async sendSms(@Body() dto: SendNotificationDto) {
    return this.smsService.sendNotification(dto);
  }

  /**
   * Массовая рассылка
   */
  @Post('bulk')
  @ApiOperation({ summary: 'Отправить массовую SMS рассылку' })
  @ApiResponse({ status: 200, description: 'Рассылка запущена' })
  async sendBulkSms(
    @Body() dto: {
      merchantId: string;
      customerIds: string[];
      message: string;
      campaignId?: string;
    },
  ) {
    return this.smsService.sendBulkNotification(
      dto.merchantId,
      dto.customerIds,
      dto.message,
      dto.campaignId,
    );
  }

  /**
   * Отправить OTP код
   */
  @Post('otp')
  @ApiOperation({ summary: 'Отправить OTP код для верификации' })
  @ApiResponse({ status: 200, description: 'OTP отправлен' })
  async sendOtp(
    @Body() dto: {
      phone: string;
      merchantId?: string;
    },
  ) {
    // Генерируем 6-значный код
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    return this.smsService.sendOtp(dto.phone, code, dto.merchantId);
  }

  /**
   * Получить статистику SMS
   */
  @Get('stats/:merchantId')
  @ApiOperation({ summary: 'Получить статистику SMS рассылок' })
  @ApiResponse({ status: 200, description: 'Статистика SMS' })
  async getSmsStats(
    @Param('merchantId') merchantId: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const period = from && to ? {
      from: new Date(from),
      to: new Date(to),
    } : undefined;

    return this.smsService.getSmsStats(merchantId, period);
  }

  /**
   * Получить шаблоны SMS
   */
  @Get('templates')
  @ApiOperation({ summary: 'Получить готовые шаблоны SMS для малого бизнеса' })
  @ApiResponse({ status: 200, description: 'Список шаблонов' })
  async getSmsTemplates() {
    return this.smsService.getSmsTemplates();
  }
}
