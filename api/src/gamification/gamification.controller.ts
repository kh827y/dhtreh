import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { GamificationService } from './gamification.service';
import type {
  CreateAchievementDto,
  CreateChallengeDto,
  CreateLevelDto
} from './gamification.service';
import { ApiKeyGuard } from '../guards/api-key.guard';

@ApiTags('Gamification')
@Controller('gamification')
@UseGuards(ApiKeyGuard)
@ApiBearerAuth()
export class GamificationController {
  constructor(private readonly gamificationService: GamificationService) {}

  /**
   * Создать достижение
   */
  @Post('achievements')
  @ApiOperation({ summary: 'Создать новое достижение' })
  @ApiResponse({ status: 201, description: 'Достижение создано' })
  async createAchievement(@Body() dto: CreateAchievementDto) {
    return this.gamificationService.createAchievement(dto);
  }

  /**
   * Получить достижения клиента
   */
  @Get('achievements/customer/:customerId')
  @ApiOperation({ summary: 'Получить достижения клиента' })
  async getCustomerAchievements(
    @Param('customerId') customerId: string,
    @Query('merchantId') merchantId: string,
  ) {
    return this.gamificationService.getCustomerAchievements(customerId, merchantId);
  }

  /**
   * Проверить и выдать достижения
   */
  @Post('achievements/check')
  @ApiOperation({ summary: 'Проверить и выдать новые достижения клиенту' })
  async checkAchievements(
    @Body() dto: {
      customerId: string;
      merchantId: string;
      trigger?: string;
    },
  ) {
    return this.gamificationService.checkAndAwardAchievements(
      dto.customerId,
      dto.merchantId,
      dto.trigger,
    );
  }

  /**
   * Создать челлендж
   */
  @Post('challenges')
  @ApiOperation({ summary: 'Создать новый челлендж' })
  @ApiResponse({ status: 201, description: 'Челлендж создан' })
  async createChallenge(@Body() dto: CreateChallengeDto) {
    return this.gamificationService.createChallenge(dto);
  }

  /**
   * Получить активные челленджи
   */
  @Get('challenges/active')
  @ApiOperation({ summary: 'Получить список активных челленджей' })
  async getActiveChallenges(
    @Query('merchantId') merchantId: string,
    @Query('customerId') customerId?: string,
  ) {
    return this.gamificationService.getActiveChallenges(merchantId, customerId);
  }

  /**
   * Участвовать в челлендже
   */
  @Post('challenges/:challengeId/join')
  @ApiOperation({ summary: 'Присоединиться к челленджу' })
  async joinChallenge(
    @Param('challengeId') challengeId: string,
    @Body() dto: { customerId: string },
  ) {
    return this.gamificationService.joinChallenge(challengeId, dto.customerId);
  }

  /**
   * Обновить прогресс челленджа
   */
  @Post('challenges/progress')
  @ApiOperation({ summary: 'Обновить прогресс выполнения челленджа' })
  async updateChallengeProgress(
    @Body() dto: {
      customerId: string;
      merchantId: string;
      metric: string;
      value: number;
    },
  ) {
    return this.gamificationService.updateChallengeProgress(
      dto.customerId,
      dto.merchantId,
      dto.metric,
      dto.value,
    );
  }

  /**
   * Создать уровень
   */
  @Post('levels')
  @ApiOperation({ summary: 'Создать новый уровень лояльности' })
  @ApiResponse({ status: 201, description: 'Уровень создан' })
  async createLevel(@Body() dto: CreateLevelDto) {
    return this.gamificationService.createLevel(dto);
  }

  /**
   * Получить уровень клиента
   */
  @Get('levels/customer/:customerId')
  @ApiOperation({ summary: 'Получить текущий уровень клиента' })
  async getCustomerLevel(
    @Param('customerId') customerId: string,
    @Query('merchantId') merchantId: string,
  ) {
    return this.gamificationService.getCustomerLevel(customerId, merchantId);
  }

  /**
   * Таблица лидеров
   */
  @Get('leaderboard')
  @ApiOperation({ summary: 'Получить таблицу лидеров' })
  async getLeaderboard(
    @Query('merchantId') merchantId: string,
    @Query('period') period: 'ALL_TIME' | 'MONTHLY' | 'WEEKLY' = 'ALL_TIME',
    @Query('limit') limit?: string,
  ) {
    return this.gamificationService.getLeaderboard(
      merchantId,
      period,
      limit ? parseInt(limit) : 10,
    );
  }

  /**
   * Шаблоны достижений
   */
  @Get('templates/achievements')
  @ApiOperation({ summary: 'Получить готовые шаблоны достижений' })
  async getAchievementTemplates() {
    return [
      {
        code: 'first_purchase',
        name: 'Первая покупка',
        description: 'Совершите свою первую покупку',
        category: 'MILESTONE',
        type: 'BRONZE',
        conditions: {
          metric: 'transactions_count',
          operator: 'gte',
          value: 1,
        },
        reward: {
          type: 'POINTS',
          value: 100,
        },
      },
      {
        code: 'loyal_customer',
        name: 'Постоянный покупатель',
        description: 'Совершите 10 покупок',
        category: 'MILESTONE',
        type: 'SILVER',
        conditions: {
          metric: 'transactions_count',
          operator: 'gte',
          value: 10,
        },
        reward: {
          type: 'POINTS',
          value: 500,
        },
      },
      {
        code: 'big_spender',
        name: 'Крупный покупатель',
        description: 'Потратьте более 10,000 баллов',
        category: 'PURCHASE',
        type: 'GOLD',
        conditions: {
          metric: 'total_spent',
          operator: 'gte',
          value: 10000,
        },
        reward: {
          type: 'MULTIPLIER',
          value: 2,
        },
      },
      {
        code: 'social_butterfly',
        name: 'Социальная бабочка',
        description: 'Пригласите 5 друзей',
        category: 'SOCIAL',
        type: 'SILVER',
        conditions: {
          metric: 'referrals_count',
          operator: 'gte',
          value: 5,
        },
        reward: {
          type: 'POINTS',
          value: 1000,
        },
      },
      {
        code: 'reviewer',
        name: 'Критик',
        description: 'Оставьте 3 отзыва',
        category: 'SOCIAL',
        type: 'BRONZE',
        conditions: {
          metric: 'reviews_count',
          operator: 'gte',
          value: 3,
        },
        reward: {
          type: 'POINTS',
          value: 300,
        },
      },
    ];
  }

  /**
   * Шаблоны челленджей
   */
  @Get('templates/challenges')
  @ApiOperation({ summary: 'Получить готовые шаблоны челленджей' })
  async getChallengeTemplates() {
    return [
      {
        name: 'Ежедневный визит',
        description: 'Посещайте магазин каждый день недели',
        type: 'WEEKLY',
        tasks: [
          {
            name: 'Понедельник',
            description: 'Совершите покупку в понедельник',
            target: 1,
            metric: 'monday_visits',
            reward: 50,
          },
          {
            name: 'Вторник',
            description: 'Совершите покупку во вторник',
            target: 1,
            metric: 'tuesday_visits',
            reward: 50,
          },
          {
            name: 'Среда',
            description: 'Совершите покупку в среду',
            target: 1,
            metric: 'wednesday_visits',
            reward: 50,
          },
          {
            name: 'Четверг',
            description: 'Совершите покупку в четверг',
            target: 1,
            metric: 'thursday_visits',
            reward: 50,
          },
          {
            name: 'Пятница',
            description: 'Совершите покупку в пятницу',
            target: 1,
            metric: 'friday_visits',
            reward: 50,
          },
          {
            name: 'Суббота',
            description: 'Совершите покупку в субботу',
            target: 1,
            metric: 'saturday_visits',
            reward: 50,
          },
          {
            name: 'Воскресенье',
            description: 'Совершите покупку в воскресенье',
            target: 1,
            metric: 'sunday_visits',
            reward: 50,
          },
        ],
        totalReward: 700,
      },
      {
        name: 'Месячный марафон',
        description: 'Совершите 20 покупок за месяц',
        type: 'MONTHLY',
        tasks: [
          {
            name: 'Покупки',
            description: 'Совершите 20 покупок',
            target: 20,
            metric: 'purchases_count',
            reward: 1000,
          },
        ],
        totalReward: 1000,
      },
      {
        name: 'Социальный челлендж',
        description: 'Привлеките друзей и получите отзывы',
        type: 'SPECIAL',
        tasks: [
          {
            name: 'Рефералы',
            description: 'Пригласите 3 друзей',
            target: 3,
            metric: 'referrals_count',
            reward: 500,
          },
          {
            name: 'Отзывы',
            description: 'Получите 5 отзывов',
            target: 5,
            metric: 'reviews_count',
            reward: 500,
          },
        ],
        totalReward: 1500,
      },
    ];
  }

  /**
   * Шаблоны уровней
   */
  @Get('templates/levels')
  @ApiOperation({ summary: 'Получить готовые шаблоны уровней' })
  async getLevelTemplates() {
    return [
      {
        level: 1,
        name: 'Новичок',
        minPoints: 0,
        maxPoints: 999,
        benefits: ['Базовое начисление баллов'],
        multiplier: 1.0,
        color: '#808080',
      },
      {
        level: 2,
        name: 'Бронза',
        minPoints: 1000,
        maxPoints: 4999,
        benefits: ['Начисление баллов x1.1', 'Эксклюзивные предложения'],
        multiplier: 1.1,
        color: '#CD7F32',
      },
      {
        level: 3,
        name: 'Серебро',
        minPoints: 5000,
        maxPoints: 14999,
        benefits: ['Начисление баллов x1.25', 'Приоритетная поддержка', 'Ранний доступ к распродажам'],
        multiplier: 1.25,
        color: '#C0C0C0',
      },
      {
        level: 4,
        name: 'Золото',
        minPoints: 15000,
        maxPoints: 49999,
        benefits: ['Начисление баллов x1.5', 'VIP поддержка', 'Подарки на день рождения', 'Бесплатная доставка'],
        multiplier: 1.5,
        color: '#FFD700',
      },
      {
        level: 5,
        name: 'Платина',
        minPoints: 50000,
        maxPoints: 999999,
        benefits: ['Начисление баллов x2', 'Персональный менеджер', 'Эксклюзивные мероприятия', 'Специальные подарки'],
        multiplier: 2.0,
        color: '#E5E4E2',
      },
    ];
  }
}
