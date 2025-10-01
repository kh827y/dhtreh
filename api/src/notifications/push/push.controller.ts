import {
  Controller,
  Post,
  Get,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { PushService } from './push.service';
import type { RegisterDeviceDto, SendPushDto } from './push.service';
import { ApiKeyGuard } from '../../guards/api-key.guard';

@ApiTags('Push Notifications')
@Controller('push')
@UseGuards(ApiKeyGuard)
@ApiBearerAuth()
export class PushController {
  constructor(private readonly pushService: PushService) {}

  /**
   * Регистрация устройства
   */
  @Post('device/register')
  @ApiOperation({ summary: 'Регистрация устройства для push-уведомлений' })
  @ApiResponse({ status: 200, description: 'Устройство зарегистрировано' })
  async registerDevice(@Body() dto: RegisterDeviceDto) {
    return this.pushService.registerDevice(dto);
  }

  /**
   * Отправить push-уведомление
   */
  @Post('send')
  @ApiOperation({ summary: 'Отправить push-уведомление' })
  @ApiResponse({ status: 200, description: 'Уведомление отправлено' })
  async sendPush(@Body() dto: SendPushDto) {
    return this.pushService.sendPush(dto);
  }

  /**
   * Отправить уведомление по топику
   */
  @Post('topic/:merchantId')
  @ApiOperation({ summary: 'Отправить уведомление всем подписчикам мерчанта' })
  @ApiResponse({ status: 200, description: 'Уведомление отправлено' })
  async sendToTopic(
    @Param('merchantId') merchantId: string,
    @Body() dto: {
      title: string;
      body: string;
      data?: Record<string, string>;
    },
  ) {
    return this.pushService.sendToTopic(merchantId, dto.title, dto.body, dto.data);
  }

  /**
   * Деактивировать устройство
   */
  @Delete('device/:outletId')
  @ApiOperation({ summary: 'Деактивировать устройство' })
  @ApiResponse({ status: 200, description: 'Устройство деактивировано' })
  async deactivateDevice(@Param('outletId') outletId: string) {
    await this.pushService.deactivateDevice(outletId);
    return { success: true };
  }

  /**
   * Получить статистику push-уведомлений
   */
  @Get('stats/:merchantId')
  @ApiOperation({ summary: 'Получить статистику push-уведомлений' })
  @ApiResponse({ status: 200, description: 'Статистика push' })
  async getPushStats(
    @Param('merchantId') merchantId: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const period = from && to ? {
      from: new Date(from),
      to: new Date(to),
    } : undefined;

    return this.pushService.getPushStats(merchantId, period);
  }

  /**
   * Получить шаблоны push-уведомлений
   */
  @Get('templates')
  @ApiOperation({ summary: 'Получить готовые шаблоны push-уведомлений' })
  @ApiResponse({ status: 200, description: 'Список шаблонов' })
  async getPushTemplates() {
    return this.pushService.getPushTemplates();
  }

  /**
   * Тестовое push-уведомление
   */
  @Post('test/:customerId')
  @ApiOperation({ summary: 'Отправить тестовое push-уведомление' })
  @ApiResponse({ status: 200, description: 'Тестовое уведомление отправлено' })
  async sendTestPush(@Param('customerId') customerId: string) {
    const customer = await this.pushService.getCustomerWithDevice(customerId);
    
    if (!customer) {
      return { 
        success: false, 
        message: 'Клиент не найден или нет зарегистрированных устройств' 
      };
    }

    return this.pushService.sendPush({
      merchantId: customer.merchantId,
      customerId,
      title: '🎉 Тестовое уведомление',
      body: 'Если вы видите это сообщение, push-уведомления работают корректно!',
      type: 'SYSTEM',
      priority: 'high',
      data: {
        test: 'true',
        timestamp: new Date().toISOString(),
      },
    });
  }
}
