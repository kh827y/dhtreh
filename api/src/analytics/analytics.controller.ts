import {
  Controller,
  Get,
  Query,
  Param,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { AnalyticsService, DashboardPeriod } from './analytics.service';
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
  @ApiQuery({ name: 'period', enum: ['day', 'week', 'month', 'quarter', 'year'], required: false })
  @ApiQuery({ name: 'from', type: String, required: false, description: 'ISO date string' })
  @ApiQuery({ name: 'to', type: String, required: false, description: 'ISO date string' })
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
   * Метрики выручки
   */
  @Get('revenue/:merchantId')
  @ApiOperation({ summary: 'Получить метрики выручки' })
  @ApiQuery({ name: 'period', enum: ['day', 'week', 'month', 'quarter', 'year'], required: false })
  async getRevenueMetrics(
    @Param('merchantId') merchantId: string,
    @Query('period') periodType?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const period = this.getPeriod(periodType, from, to);
    return this.analyticsService.getRevenueMetrics(merchantId, period);
  }

  /**
   * Метрики клиентов
   */
  @Get('customers/:merchantId')
  @ApiOperation({ summary: 'Получить метрики клиентов' })
  @ApiQuery({ name: 'period', enum: ['day', 'week', 'month', 'quarter', 'year'], required: false })
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
  @ApiQuery({ name: 'period', enum: ['day', 'week', 'month', 'quarter', 'year'], required: false })
  async getLoyaltyMetrics(
    @Param('merchantId') merchantId: string,
    @Query('period') periodType?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const period = this.getPeriod(periodType, from, to);
    return this.analyticsService.getLoyaltyMetrics(merchantId, period);
  }

  /**
   * Метрики кампаний
   */
  @Get('campaigns/:merchantId')
  @ApiOperation({ summary: 'Получить метрики маркетинговых кампаний' })
  @ApiQuery({ name: 'period', enum: ['day', 'week', 'month', 'quarter', 'year'], required: false })
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
   * Операционные метрики
   */
  @Get('operations/:merchantId')
  @ApiOperation({ summary: 'Получить операционные метрики (точки, персонал, устройства)' })
  @ApiQuery({ name: 'period', enum: ['day', 'week', 'month', 'quarter', 'year'], required: false })
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

    const [revenue, customers, loyalty] = await Promise.all([
      this.analyticsService.getRevenueMetrics(merchantId, period),
      this.analyticsService.getCustomerMetrics(merchantId, period),
      this.analyticsService.getLoyaltyMetrics(merchantId, period),
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
    const now = new Date();
    let from = new Date();
    let to = new Date();

    if (fromStr && toStr) {
      // Custom период
      from = new Date(fromStr);
      to = new Date(toStr);
      return { from, to, type: 'custom' };
    }

    // Предустановленные периоды
    switch (periodType) {
      case 'day':
        from.setHours(0, 0, 0, 0);
        to.setHours(23, 59, 59, 999);
        break;
      
      case 'week':
        const dayOfWeek = from.getDay();
        const diff = from.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1);
        from.setDate(diff);
        from.setHours(0, 0, 0, 0);
        to = new Date(from);
        to.setDate(to.getDate() + 6);
        to.setHours(23, 59, 59, 999);
        break;
      
      case 'month':
        from.setDate(1);
        from.setHours(0, 0, 0, 0);
        to = new Date(from);
        to.setMonth(to.getMonth() + 1);
        to.setDate(0); // Последний день месяца
        to.setHours(23, 59, 59, 999);
        break;
      
      case 'quarter':
        const quarter = Math.floor(from.getMonth() / 3);
        from.setMonth(quarter * 3);
        from.setDate(1);
        from.setHours(0, 0, 0, 0);
        to = new Date(from);
        to.setMonth(to.getMonth() + 3);
        to.setDate(0);
        to.setHours(23, 59, 59, 999);
        break;
      
      case 'year':
        from.setMonth(0);
        from.setDate(1);
        from.setHours(0, 0, 0, 0);
        to.setMonth(11);
        to.setDate(31);
        to.setHours(23, 59, 59, 999);
        break;
      
      default:
        // По умолчанию - текущий месяц
        from.setDate(1);
        from.setHours(0, 0, 0, 0);
        to = new Date(from);
        to.setMonth(to.getMonth() + 1);
        to.setDate(0);
        to.setHours(23, 59, 59, 999);
    }

    return {
      from,
      to,
      type: (periodType as DashboardPeriod['type']) || 'month',
    };
  }
}
