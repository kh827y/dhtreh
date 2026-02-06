import { Controller, Post, Get, Body, Param, UseGuards } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { EmailService } from './email.service';
import { ApiKeyGuard } from '../../../core/guards/api-key.guard';
import {
  SendCampaignEmailDto,
  SendEmailRequestDto,
  SendReportEmailDto,
  SendTestEmailDto,
  SendTransactionEmailDto,
  SendWelcomeEmailDto,
} from './email.dto';

@ApiTags('Email Notifications')
@Controller('email')
@UseGuards(ApiKeyGuard)
@ApiBearerAuth()
export class EmailController {
  constructor(private readonly emailService: EmailService) {}

  /**
   * Отправить email
   */
  @Post('send')
  @ApiOperation({ summary: 'Отправить email уведомление' })
  @ApiResponse({ status: 200, description: 'Email отправлен' })
  @ApiResponse({ status: 400, description: 'Ошибка отправки' })
  async sendEmail(@Body() dto: SendEmailRequestDto) {
    const result = await this.emailService.sendEmail(dto);
    return { success: result };
  }

  /**
   * Отправить приветственное письмо
   */
  @Post('welcome')
  @ApiOperation({ summary: 'Отправить приветственное письмо новому клиенту' })
  async sendWelcomeEmail(@Body() dto: SendWelcomeEmailDto) {
    await this.emailService.sendWelcomeEmail(
      dto.merchantId,
      dto.customerId,
      dto.email,
    );
    return { success: true };
  }

  /**
   * Отправить уведомление о транзакции
   */
  @Post('transaction/:transactionId')
  @ApiOperation({ summary: 'Отправить email о транзакции' })
  async sendTransactionEmail(
    @Param('transactionId') transactionId: string,
    @Body() dto: SendTransactionEmailDto,
  ) {
    await this.emailService.sendTransactionEmail(transactionId, dto.type);
    return { success: true };
  }

  /**
   * Массовая рассылка по кампании
   */
  @Post('campaign')
  @ApiOperation({ summary: 'Отправить массовую рассылку по кампании' })
  async sendCampaignEmail(
    @Body()
    dto: SendCampaignEmailDto,
  ) {
    return this.emailService.sendCampaignEmail(
      dto.campaignId,
      dto.customerIds,
      dto.subject,
      dto.content,
    );
  }

  /**
   * Отправить отчет
   */
  @Post('report')
  @ApiOperation({ summary: 'Отправить отчет на email' })
  async sendReportEmail(
    @Body()
    dto: SendReportEmailDto,
  ) {
    const buffer = Buffer.from(dto.reportBuffer, 'base64');
    await this.emailService.sendReportEmail(
      dto.merchantId,
      dto.email,
      dto.reportType,
      buffer,
      dto.format,
    );
    return { success: true };
  }

  /**
   * Напоминание о баллах
   */
  @Post('reminder/:customerId')
  @ApiOperation({ summary: 'Отправить напоминание о неиспользованных баллах' })
  async sendPointsReminder(@Param('customerId') customerId: string) {
    await this.emailService.sendPointsReminder(customerId);
    return { success: true };
  }

  /**
   * Получить шаблоны писем
   */
  @Get('templates')
  @ApiOperation({ summary: 'Получить список шаблонов email' })
  @ApiResponse({ status: 200, description: 'Список шаблонов' })
  getEmailTemplates() {
    return this.emailService.getEmailTemplates();
  }

  /**
   * Тестовое письмо
   */
  @Post('test')
  @ApiOperation({ summary: 'Отправить тестовое письмо' })
  async sendTestEmail(@Body() dto: SendTestEmailDto) {
    const result = await this.emailService.sendEmail({
      to: dto.to,
      subject: 'Тестовое письмо - Система лояльности',
      template: dto.template || 'welcome',
      data: {
        customerName: 'Тестовый клиент',
        merchantName: 'Тестовый магазин',
        bonusPoints: 100,
        balance: 500,
        points: 250,
        campaignName: 'Тестовая акция',
        content:
          'Это тестовое сообщение для проверки работы email уведомлений.',
        reportType: 'test',
        reportDate: new Date().toLocaleDateString('ru-RU'),
        format: 'PDF',
        expiryDate: new Date(
          Date.now() + 30 * 24 * 60 * 60 * 1000,
        ).toLocaleDateString('ru-RU'),
        transactionDate: new Date().toLocaleDateString('ru-RU'),
      },
    });

    return {
      success: result,
      message: result ? 'Тестовое письмо отправлено' : 'Ошибка отправки',
    };
  }
}
