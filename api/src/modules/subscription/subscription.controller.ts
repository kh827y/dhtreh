import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
  NotFoundException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { SubscriptionService } from './subscription.service';
import { ApiKeyGuard } from '../../core/guards/api-key.guard';
import {
  CreateSubscriptionRequestDto,
  PlanRefDto,
  UpdateSubscriptionRequestDto,
} from './dto';

@ApiTags('Subscriptions')
@Controller('subscription')
@UseGuards(ApiKeyGuard)
@ApiBearerAuth()
export class SubscriptionController {
  constructor(private readonly subscriptionService: SubscriptionService) {}

  /**
   * Получить доступные планы подписки
   */
  @Get('plans')
  @ApiOperation({ summary: 'Получить список доступных планов' })
  @ApiResponse({ status: 200, description: 'Список планов' })
  async getPlans() {
    return this.subscriptionService.getAvailablePlans();
  }

  /**
   * Создать подписку для мерчанта
   */
  @Post('create')
  @ApiOperation({ summary: 'Создать новую подписку' })
  @ApiResponse({ status: 201, description: 'Подписка создана' })
  @ApiResponse({ status: 400, description: 'Неверные данные' })
  async createSubscription(
    @Body()
    dto: CreateSubscriptionRequestDto,
  ) {
    return this.subscriptionService.createSubscription(dto);
  }

  /**
   * Получить текущую подписку мерчанта
   */
  @Get(':merchantId')
  @ApiOperation({ summary: 'Получить информацию о подписке' })
  @ApiResponse({ status: 200, description: 'Информация о подписке' })
  @ApiResponse({ status: 404, description: 'Подписка не найдена' })
  async getSubscription(@Param('merchantId') merchantId: string) {
    const subscription =
      await this.subscriptionService.getSubscription(merchantId);
    if (!subscription) {
      throw new NotFoundException('Подписка не найдена');
    }
    return subscription;
  }

  /**
   * Обновить подписку (смена плана)
   */
  @Put(':merchantId')
  @ApiOperation({ summary: 'Обновить подписку' })
  @ApiResponse({ status: 200, description: 'Подписка обновлена' })
  @ApiResponse({ status: 404, description: 'Подписка не найдена' })
  async updateSubscription(
    @Param('merchantId') merchantId: string,
    @Body()
    dto: UpdateSubscriptionRequestDto,
  ) {
    return this.subscriptionService.updateSubscription(merchantId, dto);
  }

  /**
   * Отменить подписку
   */
  @Delete(':merchantId')
  @ApiOperation({ summary: 'Отменить подписку' })
  @ApiResponse({ status: 200, description: 'Подписка отменена' })
  @ApiResponse({ status: 404, description: 'Подписка не найдена' })
  async cancelSubscription(
    @Param('merchantId') merchantId: string,
    @Query('immediately') immediately?: string,
  ) {
    const normalized = String(immediately || '').toLowerCase();
    const cancelImmediately = normalized === '1' || normalized === 'true';
    return this.subscriptionService.cancelSubscription(
      merchantId,
      cancelImmediately,
    );
  }

  /**
   * Проверить доступность функции
   */
  @Get(':merchantId/feature/:feature')
  @ApiOperation({ summary: 'Проверить доступность функции для плана' })
  @ApiResponse({ status: 200, description: 'Статус доступности' })
  async checkFeature(
    @Param('merchantId') merchantId: string,
    @Param('feature') feature: string,
  ) {
    const hasAccess = await this.subscriptionService.checkFeatureAccess(
      merchantId,
      feature,
    );
    return { feature, hasAccess };
  }

  /**
   * Получить статистику использования
   */
  @Get(':merchantId/usage')
  @ApiOperation({ summary: 'Получить статистику использования лимитов' })
  @ApiResponse({ status: 200, description: 'Статистика использования' })
  @ApiResponse({ status: 404, description: 'Подписка не найдена' })
  async getUsageStatistics(@Param('merchantId') merchantId: string) {
    return this.subscriptionService.getUsageStatistics(merchantId);
  }

  /**
   * Проверить лимиты плана
   */
  @Post(':merchantId/validate-limits')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Проверить соответствие текущего использования лимитам плана',
  })
  @ApiResponse({ status: 200, description: 'Лимиты соблюдены' })
  @ApiResponse({ status: 400, description: 'Превышены лимиты плана' })
  async validatePlanLimits(
    @Param('merchantId') merchantId: string,
    @Body() plan?: PlanRefDto | null,
  ) {
    const subscription =
      await this.subscriptionService.getSubscription(merchantId);
    if (!subscription) {
      throw new NotFoundException('Подписка не найдена');
    }

    // Если план не передан или не содержит id, используем текущий план подписки
    const targetPlan =
      plan && typeof plan.id === 'string' && plan.id
        ? await this.subscriptionService.ensurePlan(plan.id)
        : subscription.plan;
    const isValid = this.subscriptionService.validatePlanLimits(
      merchantId,
      targetPlan,
    );

    const planId =
      targetPlan?.id || subscription.plan?.id || subscription.planId;

    return {
      valid: isValid,
      merchantId,
      planId,
    };
  }
}
