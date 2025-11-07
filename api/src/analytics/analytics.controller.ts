import { Controller, Get, Query, Param, UseGuards } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiQuery,
} from '@nestjs/swagger';
import {
  AnalyticsService,
  DashboardPeriod,
  RecencyGrouping,
  TimeGrouping,
} from './analytics.service';
import { ApiKeyGuard } from '../guards/api-key.guard';

@ApiTags('Analytics')
@Controller('analytics')
@UseGuards(ApiKeyGuard)
@ApiBearerAuth()
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  /**
   * Получить полный дашборд
   */
  @Get('dashboard/:merchantId')
  @ApiOperation({ summary: 'Получить полную аналитику для владельца бизнеса' })
  @ApiQuery({
    name: 'period',
    enum: ['yesterday', 'day', 'week', 'month', 'quarter', 'year'],
    required: false,
  })
  @ApiQuery({
    name: 'from',
    type: String,
    required: false,
    description: 'ISO date string',
  })
  @ApiQuery({
    name: 'to',
    type: String,
    required: false,
    description: 'ISO date string',
  })
  @ApiResponse({ status: 200, description: 'Дашборд с метриками' })
  async getDashboard(
    @Param('merchantId') merchantId: string,
    @Query('period') periodType?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const period = this.getPeriod(periodType, from, to);
    return this.analyticsService.getDashboard(merchantId, period);
  }

  /**
   * Портрет клиента (пол, возраст, пол×возраст)
   */
  @Get('portrait/:merchantId')
  @ApiOperation({ summary: 'Портрет клиента: пол, возраст, пол×возраст' })
  @ApiQuery({
    name: 'period',
    enum: ['yesterday', 'day', 'week', 'month', 'quarter', 'year'],
    required: false,
  })
  @ApiQuery({ name: 'from', type: String, required: false })
  @ApiQuery({ name: 'to', type: String, required: false })
  @ApiQuery({ name: 'segmentId', type: String, required: false })
  async getCustomerPortrait(
    @Param('merchantId') merchantId: string,
    @Query('period') periodType?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('segmentId') segmentId?: string,
  ) {
    const period = this.getPeriod(periodType, from, to);
    return this.analyticsService.getCustomerPortrait(
      merchantId,
      period,
      segmentId,
    );
  }

  /**
   * Повторные покупки
   */
  @Get('repeat/:merchantId')
  @ApiOperation({ summary: 'Повторные покупки и распределение покупок' })
  @ApiQuery({
    name: 'period',
    enum: ['yesterday', 'day', 'week', 'month', 'quarter', 'year'],
    required: false,
  })
  @ApiQuery({ name: 'from', type: String, required: false })
  @ApiQuery({ name: 'to', type: String, required: false })
  @ApiQuery({ name: 'outletId', type: String, required: false })
  async getRepeatPurchases(
    @Param('merchantId') merchantId: string,
    @Query('period') periodType?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('outletId') outletId?: string,
  ) {
    const period = this.getPeriod(periodType, from, to);
    return this.analyticsService.getRepeatPurchases(
      merchantId,
      period,
      outletId,
    );
  }

  /**
   * Ближайшие дни рождения
   */
  @Get('birthdays/:merchantId')
  @ApiOperation({ summary: 'Список ближайших дней рождения клиентов мерчанта' })
  @ApiQuery({ name: 'withinDays', type: Number, required: false })
  @ApiQuery({ name: 'limit', type: Number, required: false })
  async getBirthdays(
    @Param('merchantId') merchantId: string,
    @Query('withinDays') withinDays?: string,
    @Query('limit') limit?: string,
  ) {
    const d = Math.max(
      1,
      Math.min(parseInt(withinDays || '30', 10) || 30, 365),
    );
    const l = Math.max(1, Math.min(parseInt(limit || '100', 10) || 100, 1000));
    return this.analyticsService.getBirthdays(merchantId, d, l);
  }

  /**
   * Реферальная сводка за период
   */
  @Get('referral/:merchantId')
  @ApiOperation({ summary: 'Сводка реферальной программы за период' })
  @ApiQuery({
    name: 'period',
    enum: ['yesterday', 'day', 'week', 'month', 'quarter', 'year'],
    required: false,
  })
  @ApiQuery({ name: 'from', type: String, required: false })
  @ApiQuery({ name: 'to', type: String, required: false })
  async getReferralSummary(
    @Param('merchantId') merchantId: string,
    @Query('period') periodType?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const period = this.getPeriod(periodType, from, to);
    return this.analyticsService.getReferralSummary(merchantId, period);
  }

  /**
   * Бизнес‑метрики (средний чек у клиентов с >= N покупок)
   */
  @Get('business/:merchantId')
  @ApiOperation({
    summary: 'Бизнес‑метрики: средний чек покупателей с N+ покупок',
  })
  @ApiQuery({
    name: 'period',
    enum: ['yesterday', 'day', 'week', 'month', 'quarter', 'year'],
    required: false,
  })
  @ApiQuery({ name: 'from', type: String, required: false })
  @ApiQuery({ name: 'to', type: String, required: false })
  @ApiQuery({ name: 'minPurchases', type: Number, required: false })
  async getBusinessMetrics(
    @Param('merchantId') merchantId: string,
    @Query('period') periodType?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('minPurchases') minPurchases?: string,
  ) {
    const period = this.getPeriod(periodType, from, to);
    const n = Math.max(
      1,
      Math.min(parseInt(minPurchases || '3', 10) || 3, 100),
    );
    return this.analyticsService.getBusinessMetrics(merchantId, period, n);
  }

  /**
   * Метрики выручки
   */
  @Get('revenue/:merchantId')
  @ApiOperation({ summary: 'Получить метрики выручки' })
  @ApiQuery({
    name: 'period',
    enum: ['yesterday', 'day', 'week', 'month', 'quarter', 'year'],
    required: false,
  })
  @ApiQuery({
    name: 'group',
    enum: ['day', 'week', 'month'],
    required: false,
  })
  async getRevenueMetrics(
    @Param('merchantId') merchantId: string,
    @Query('period') periodType?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('group') group?: string,
  ) {
    const period = this.getPeriod(periodType, from, to);
    return this.analyticsService.getRevenueMetrics(
      merchantId,
      period,
      this.normalizeGrouping(group),
    );
  }

  /**
   * Метрики клиентов
   */
  @Get('customers/:merchantId')
  @ApiOperation({ summary: 'Получить метрики клиентов' })
  @ApiQuery({
    name: 'period',
    enum: ['yesterday', 'day', 'week', 'month', 'quarter', 'year'],
    required: false,
  })
  async getCustomerMetrics(
    @Param('merchantId') merchantId: string,
    @Query('period') periodType?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const period = this.getPeriod(periodType, from, to);
    return this.analyticsService.getCustomerMetrics(merchantId, period);
  }

  /**
   * Метрики программы лояльности
   */
  @Get('loyalty/:merchantId')
  @ApiOperation({ summary: 'Получить метрики программы лояльности' })
  @ApiQuery({
    name: 'period',
    enum: ['yesterday', 'day', 'week', 'month', 'quarter', 'year'],
    required: false,
  })
  @ApiQuery({
    name: 'group',
    enum: ['day', 'week', 'month'],
    required: false,
  })
  async getLoyaltyMetrics(
    @Param('merchantId') merchantId: string,
    @Query('period') periodType?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('group') group?: string,
  ) {
    const period = this.getPeriod(periodType, from, to);
    return this.analyticsService.getLoyaltyMetrics(
      merchantId,
      period,
      this.normalizeGrouping(group),
    );
  }

  /**
   * Автовозврат клиентов
   */
  @Get('auto-return/:merchantId')
  @ApiOperation({ summary: 'Статистика механики автовозврата клиентов' })
  @ApiQuery({
    name: 'period',
    enum: ['yesterday', 'day', 'week', 'month', 'quarter', 'year'],
    required: false,
  })
  @ApiQuery({ name: 'from', type: String, required: false })
  @ApiQuery({ name: 'to', type: String, required: false })
  @ApiQuery({ name: 'outletId', type: String, required: false })
  async getAutoReturnMetrics(
    @Param('merchantId') merchantId: string,
    @Query('period') periodType?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('outletId') outletId?: string,
  ) {
    const period = this.getPeriod(periodType, from, to);
    return this.analyticsService.getAutoReturnMetrics(
      merchantId,
      period,
      outletId,
    );
  }

  /**
   * Поздравления с днём рождения
   */
  @Get('birthday-mechanic/:merchantId')
  @ApiOperation({ summary: 'Статистика механики поздравлений с днём рождения' })
  @ApiQuery({
    name: 'period',
    enum: ['yesterday', 'day', 'week', 'month', 'quarter', 'year'],
    required: false,
  })
  @ApiQuery({ name: 'from', type: String, required: false })
  @ApiQuery({ name: 'to', type: String, required: false })
  @ApiQuery({ name: 'outletId', type: String, required: false })
  async getBirthdayMechanicMetrics(
    @Param('merchantId') merchantId: string,
    @Query('period') periodType?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('outletId') outletId?: string,
  ) {
    const period = this.getPeriod(periodType, from, to);
    return this.analyticsService.getBirthdayMechanicMetrics(
      merchantId,
      period,
      outletId,
    );
  }

  /**
   * Метрики кампаний
   */
  @Get('campaigns/:merchantId')
  @ApiOperation({ summary: 'Получить метрики маркетинговых кампаний' })
  @ApiQuery({
    name: 'period',
    enum: ['yesterday', 'day', 'week', 'month', 'quarter', 'year'],
    required: false,
  })
  async getCampaignMetrics(
    @Param('merchantId') merchantId: string,
    @Query('period') periodType?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const period = this.getPeriod(periodType, from, to);
    return this.analyticsService.getCampaignMetrics(merchantId, period);
  }

  /**
   * Давность последней покупки по клиентам
   */
  @Get('time/recency/:merchantId')
  @ApiOperation({
    summary: 'Распределение клиентов по давности последней покупки',
  })
  @ApiQuery({
    name: 'group',
    enum: ['day', 'week', 'month'],
    required: false,
    description: 'Группировка: day | week | month (по умолчанию day)',
  })
  @ApiQuery({
    name: 'limit',
    type: Number,
    required: false,
    description: 'Количество отображаемых интервалов (в пределах допустимого)',
  })
  async getRecencyDistribution(
    @Param('merchantId') merchantId: string,
    @Query('group') group?: string,
    @Query('limit') limit?: string,
  ) {
    const grouping: RecencyGrouping =
      group === 'week' || group === 'month' ? group : 'day';
    const parsedLimit = Number.parseInt(String(limit ?? ''), 10);
    const effectiveLimit = Number.isFinite(parsedLimit)
      ? parsedLimit
      : undefined;
    return this.analyticsService.getPurchaseRecencyDistribution(
      merchantId,
      grouping,
      effectiveLimit,
    );
  }

  /**
   * Активность по дням недели и часам
   */
  @Get('time/activity/:merchantId')
  @ApiOperation({
    summary: 'Активность клиентов по дням недели, часам и тепловая карта',
  })
  @ApiQuery({
    name: 'period',
    enum: ['yesterday', 'day', 'week', 'month', 'quarter', 'year'],
    required: false,
  })
  @ApiQuery({ name: 'from', type: String, required: false })
  @ApiQuery({ name: 'to', type: String, required: false })
  async getTimeActivity(
    @Param('merchantId') merchantId: string,
    @Query('period') periodType?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const period = this.getPeriod(periodType, from, to);
    return this.analyticsService.getTimeActivityMetrics(merchantId, period);
  }

  /**
   * Когорты удержания (Retention cohorts)
   */
  @Get('cohorts/:merchantId')
  @ApiOperation({
    summary: 'Когорты удержания по месяцам/неделям (как в GetMeBack)',
  })
  @ApiQuery({
    name: 'by',
    required: false,
    enum: ['month', 'week'],
    description: 'Группировка когорт: month|week (по умолчанию month)',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    description: 'Количество когорт, по умолчанию 6',
  })
  async getRetentionCohorts(
    @Param('merchantId') merchantId: string,
    @Query('by') by?: 'month' | 'week',
    @Query('limit') limitStr?: string,
  ) {
    const limit = Math.min(Math.max(parseInt(limitStr || '6', 10) || 6, 1), 24);
    return this.analyticsService.getRetentionCohorts(
      merchantId,
      by === 'week' ? 'week' : 'month',
      limit,
    );
  }

  /**
   * Тепловая карта RFM (5x5)
   */
  @Get('rfm/:merchantId/heatmap')
  @ApiOperation({ summary: 'RFM heatmap 5x5 (как в GetMeBack)' })
  async getRfmHeatmap(@Param('merchantId') merchantId: string) {
    return this.analyticsService.getRfmHeatmap(merchantId);
  }

  /**
   * Операционные метрики
   */
  @Get('operations/:merchantId')
  @ApiOperation({
    summary: 'Получить операционные метрики (точки, персонал, устройства)',
  })
  @ApiQuery({
    name: 'period',
    enum: ['yesterday', 'day', 'week', 'month', 'quarter', 'year'],
    required: false,
  })
  async getOperationalMetrics(
    @Param('merchantId') merchantId: string,
    @Query('period') periodType?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const period = this.getPeriod(periodType, from, to);
    return this.analyticsService.getOperationalMetrics(merchantId, period);
  }

  /**
   * Готовые отчеты для малого бизнеса
   */
  @Get('reports/templates')
  @ApiOperation({ summary: 'Получить список готовых шаблонов отчетов' })
  @ApiResponse({ status: 200, description: 'Список шаблонов' })
  async getReportTemplates() {
    return [
      {
        id: 'daily_summary',
        name: 'Ежедневная сводка',
        description: 'Выручка, количество чеков, новые клиенты за день',
        period: 'day',
      },
      {
        id: 'weekly_performance',
        name: 'Недельная эффективность',
        description: 'Динамика продаж, топ товары, активность клиентов',
        period: 'week',
      },
      {
        id: 'monthly_loyalty',
        name: 'Месячный отчет по лояльности',
        description: 'Начисления, списания, активность программы лояльности',
        period: 'month',
      },
      {
        id: 'customer_analysis',
        name: 'Анализ клиентской базы',
        description: 'Сегменты, LTV, частота покупок, отток',
        period: 'month',
      },
      {
        id: 'campaign_roi',
        name: 'Эффективность акций',
        description: 'ROI кампаний, конверсия, использование',
        period: 'custom',
      },
      {
        id: 'staff_performance',
        name: 'Эффективность персонала',
        description: 'Продажи по сотрудникам, средний чек',
        period: 'month',
      },
    ];
  }

  /**
   * Быстрые метрики для виджетов
   */
  @Get('widgets/:merchantId')
  @ApiOperation({ summary: 'Получить данные для виджетов дашборда' })
  @ApiResponse({ status: 200, description: 'Данные виджетов' })
  async getWidgetData(@Param('merchantId') merchantId: string) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const period: DashboardPeriod = {
      from: today,
      to: tomorrow,
      type: 'day',
    };

    const timezone = await this.analyticsService.resolveTimezone(merchantId);
    const [revenue, customers, loyalty] = await Promise.all([
      this.analyticsService.getRevenueMetrics(
        merchantId,
        period,
        undefined,
        timezone,
      ),
      this.analyticsService.getCustomerMetrics(merchantId, period),
      this.analyticsService.getLoyaltyMetrics(
        merchantId,
        period,
        undefined,
        timezone,
      ),
    ]);

    return {
      todayRevenue: revenue.totalRevenue,
      todayTransactions: revenue.transactionCount,
      todayAverageCheck: revenue.averageCheck,
      totalCustomers: customers.totalCustomers,
      newCustomersToday: customers.newCustomers,
      activeWallets: loyalty.activeWallets,
      totalPoints: loyalty.totalPointsIssued - loyalty.totalPointsRedeemed,
      revenueGrowth: revenue.revenueGrowth,
    };
  }

  /**
   * Helper: получить период из параметров
   */
  private getPeriod(
    periodType?: string,
    fromStr?: string,
    toStr?: string,
  ): DashboardPeriod {
    if (fromStr && toStr) {
      const rawFrom = new Date(fromStr);
      const rawTo = new Date(toStr);
      if (!Number.isNaN(rawFrom.getTime()) && !Number.isNaN(rawTo.getTime())) {
        let from = new Date(rawFrom);
        let to = new Date(rawTo);
        if (from.getTime() > to.getTime()) {
          const tmp = from;
          from = to;
          to = tmp;
        }
        from.setHours(0, 0, 0, 0);
        to.setHours(23, 59, 59, 999);
        return { from, to, type: 'custom' };
      }
    }

    const today = new Date();
    const from = new Date(today);
    let to = new Date(today);

    switch (periodType) {
      case 'yesterday':
        from.setDate(from.getDate() - 1);
        from.setHours(0, 0, 0, 0);
        to = new Date(from);
        to.setHours(23, 59, 59, 999);
        break;
      case 'day':
        from.setHours(0, 0, 0, 0);
        to.setHours(23, 59, 59, 999);
        break;
      case 'week': {
        const dayOfWeek = from.getDay();
        const diff = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
        from.setDate(from.getDate() + diff);
        from.setHours(0, 0, 0, 0);
        to = new Date(from);
        to.setDate(to.getDate() + 6);
        to.setHours(23, 59, 59, 999);
        break;
      }
      case 'month':
        from.setDate(1);
        from.setHours(0, 0, 0, 0);
        to = new Date(from);
        to.setMonth(to.getMonth() + 1);
        to.setDate(0);
        to.setHours(23, 59, 59, 999);
        break;
      case 'quarter': {
        const quarter = Math.floor(from.getMonth() / 3);
        from.setMonth(quarter * 3, 1);
        from.setHours(0, 0, 0, 0);
        to = new Date(from);
        to.setMonth(to.getMonth() + 3);
        to.setDate(0);
        to.setHours(23, 59, 59, 999);
        break;
      }
      case 'year':
        from.setMonth(0, 1);
        from.setHours(0, 0, 0, 0);
        to = new Date(from);
        to.setMonth(11, 31);
        to.setHours(23, 59, 59, 999);
        break;
      default:
        from.setDate(1);
        from.setHours(0, 0, 0, 0);
        to = new Date(from);
        to.setMonth(to.getMonth() + 1);
        to.setDate(0);
        to.setHours(23, 59, 59, 999);
        break;
    }

    const normalized: DashboardPeriod['type'] =
      periodType === 'yesterday' ||
      periodType === 'day' ||
      periodType === 'week' ||
      periodType === 'month' ||
      periodType === 'quarter' ||
      periodType === 'year'
        ? (periodType as DashboardPeriod['type'])
        : 'month';

    return { from, to, type: normalized };
  }

  private normalizeGrouping(value?: string): TimeGrouping | undefined {
    const normalized = String(value || '').toLowerCase();
    if (normalized === 'week') return 'week';
    if (normalized === 'month') return 'month';
    if (normalized === 'day') return 'day';
    return undefined;
  }
}
