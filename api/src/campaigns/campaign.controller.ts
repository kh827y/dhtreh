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
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { CampaignService } from './campaign.service';
import type { CreateCampaignDto } from './campaign.service';
import { ApiKeyGuard } from '../guards/api-key.guard';

@ApiTags('Campaigns')
@Controller('campaigns')
@UseGuards(ApiKeyGuard)
@ApiBearerAuth()
export class CampaignController {
  constructor(private readonly campaignService: CampaignService) {}

  /**
   * Создать новую кампанию
   */
  @Post()
  @ApiOperation({ summary: 'Создать маркетинговую кампанию' })
  @ApiResponse({ status: 201, description: 'Кампания создана' })
  @ApiResponse({ status: 400, description: 'Неверные данные' })
  async createCampaign(@Body() dto: CreateCampaignDto) {
    return this.campaignService.createCampaign(dto);
  }

  /**
   * Получить список кампаний
   */
  @Get('merchant/:merchantId')
  @ApiOperation({ summary: 'Получить список кампаний мерчанта' })
  @ApiResponse({ status: 200, description: 'Список кампаний' })
  async getCampaigns(
    @Param('merchantId') merchantId: string,
    @Query('status') status?: string,
  ) {
    return this.campaignService.getCampaigns(merchantId, status);
  }

  /**
   * Получить детали кампании
   */
  @Get(':campaignId')
  @ApiOperation({ summary: 'Получить детальную информацию о кампании' })
  @ApiResponse({ status: 200, description: 'Информация о кампании' })
  @ApiResponse({ status: 404, description: 'Кампания не найдена' })
  async getCampaign(@Param('campaignId') campaignId: string) {
    return this.campaignService.getCampaign(campaignId);
  }

  /**
   * Обновить кампанию
   */
  @Put(':campaignId')
  @ApiOperation({ summary: 'Обновить кампанию' })
  @ApiResponse({ status: 200, description: 'Кампания обновлена' })
  @ApiResponse({ status: 404, description: 'Кампания не найдена' })
  async updateCampaign(
    @Param('campaignId') campaignId: string,
    @Body() dto: Partial<CreateCampaignDto>,
  ) {
    return this.campaignService.updateCampaign(campaignId, dto);
  }

  /**
   * Удалить кампанию
   */
  @Delete(':campaignId')
  @ApiOperation({ summary: 'Удалить кампанию' })
  @ApiResponse({ status: 200, description: 'Кампания удалена' })
  @ApiResponse({ status: 404, description: 'Кампания не найдена' })
  async deleteCampaign(@Param('campaignId') campaignId: string) {
    await this.campaignService.updateCampaign(campaignId, { status: 'COMPLETED' });
    return { success: true };
  }

  /**
   * Применить кампании к транзакции
   */
  @Post('apply')
  @ApiOperation({ summary: 'Применить подходящие кампании к транзакции' })
  @ApiResponse({ status: 200, description: 'Список примененных кампаний' })
  async applyCampaigns(
    @Body() dto: {
      merchantId: string;
      customerId: string;
      amount: number;
      orderId: string;
      outletId?: string;
      productCategories?: string[];
      metadata?: any;
    },
  ) {
    return this.campaignService.applyCampaign(
      dto.merchantId,
      dto.customerId,
      {
        amount: dto.amount,
        orderId: dto.orderId,
        outletId: dto.outletId,
        productCategories: dto.productCategories,
        metadata: dto.metadata,
      },
    );
  }

  /**
   * Популярные шаблоны кампаний для малого бизнеса
   */
  @Get('templates/popular')
  @ApiOperation({ summary: 'Получить популярные шаблоны кампаний' })
  @ApiResponse({ status: 200, description: 'Список шаблонов' })
  async getPopularTemplates() {
    return [
      {
        id: 'welcome',
        name: 'Приветственный бонус',
        description: 'Бонус новым клиентам при первой покупке',
        type: 'FIRST_PURCHASE',
        reward: { type: 'POINTS', value: 500 },
        rules: { customerStatus: ['NEW'] },
      },
      {
        id: 'birthday',
        name: 'Подарок на день рождения',
        description: 'Скидка или подарок в день рождения клиента',
        type: 'BIRTHDAY',
        reward: { type: 'PERCENT', value: 20, maxValue: 1000 },
        rules: { birthdayRange: 7 },
      },
      {
        id: 'happy_hours',
        name: 'Счастливые часы',
        description: 'Двойные баллы в определенное время',
        type: 'BONUS',
        reward: { type: 'POINTS', multiplier: 2 },
        rules: { 
          timeFrom: '14:00',
          timeTo: '16:00',
          dayOfWeek: [1, 2, 3, 4, 5], // Будни
        },
      },
      {
        id: 'big_purchase',
        name: 'Бонус за крупную покупку',
        description: 'Дополнительные баллы при покупке от 3000 руб',
        type: 'CASHBACK',
        reward: { type: 'PERCENT', value: 10, maxValue: 500 },
        rules: { minPurchaseAmount: 3000 },
      },
      {
        id: 'referral',
        name: 'Приведи друга',
        description: 'Бонус за приглашение нового клиента',
        type: 'REFERRAL',
        reward: { type: 'POINTS', value: 300 },
        rules: {},
      },
      {
        id: 'weekend',
        name: 'Выходные скидки',
        description: 'Повышенный кэшбэк в выходные',
        type: 'CASHBACK',
        reward: { type: 'PERCENT', value: 7 },
        rules: { dayOfWeek: [6, 7] }, // Выходные
      },
    ];
  }
}
