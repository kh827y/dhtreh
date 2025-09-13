import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  Headers,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { PaymentService } from './payment.service';
import { ApiKeyGuard } from '../guards/api-key.guard';

@ApiTags('Payments')
@Controller('payment')
export class PaymentController {
  constructor(private readonly paymentService: PaymentService) {}

  /**
   * Создать платеж для подписки
   */
  @Post('subscription/:merchantId/:subscriptionId')
  @UseGuards(ApiKeyGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Создать платеж для подписки' })
  @ApiResponse({ status: 201, description: 'Платеж создан' })
  @ApiResponse({ status: 400, description: 'Ошибка создания платежа' })
  async createSubscriptionPayment(
    @Param('merchantId') merchantId: string,
    @Param('subscriptionId') subscriptionId: string,
  ) {
    return this.paymentService.createSubscriptionPayment(merchantId, subscriptionId);
  }

  /**
   * Webhook для обработки событий платежной системы
   */
  @Post('webhook/:provider')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Webhook платежной системы' })
  @ApiResponse({ status: 200, description: 'Webhook обработан' })
  async handleWebhook(
    @Param('provider') provider: string,
    @Body() body: any,
    @Headers() headers: any,
  ) {
    // В будущем можно добавить разные провайдеры
    return this.paymentService.handleWebhook(body, headers);
  }

  /**
   * Проверить статус платежа
   */
  @Get('status/:paymentId')
  @UseGuards(ApiKeyGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Получить статус платежа' })
  @ApiResponse({ status: 200, description: 'Статус платежа' })
  async getPaymentStatus(@Param('paymentId') paymentId: string) {
    return this.paymentService.checkPaymentStatus(paymentId);
  }

  /**
   * Создать возврат
   */
  @Post('refund/:paymentId')
  @UseGuards(ApiKeyGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Создать возврат платежа' })
  @ApiResponse({ status: 200, description: 'Возврат создан' })
  @ApiResponse({ status: 400, description: 'Ошибка создания возврата' })
  async refundPayment(
    @Param('paymentId') paymentId: string,
    @Body() body: { amount?: number },
  ) {
    return this.paymentService.refundPayment(paymentId, body.amount);
  }

  /**
   * Получить доступные методы оплаты
   */
  @Get('methods')
  @ApiOperation({ summary: 'Получить список доступных методов оплаты' })
  @ApiResponse({ status: 200, description: 'Список методов оплаты' })
  async getPaymentMethods() {
    return this.paymentService.getAvailablePaymentMethods();
  }
}
