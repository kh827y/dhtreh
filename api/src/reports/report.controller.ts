import {
  Controller,
  Get,
  Query,
  Param,
  UseGuards,
  Res,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import type { Response } from 'express';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { ReportService, ReportOptions } from './report.service';
import { ApiKeyGuard } from '../guards/api-key.guard';

@ApiTags('Reports')
@Controller('reports')
@UseGuards(ApiKeyGuard)
@ApiBearerAuth()
export class ReportController {
  constructor(private readonly reportService: ReportService) {}

  /**
   * Экспорт отчета
   */
  @Get('export/:merchantId')
  @ApiOperation({ summary: 'Экспортировать отчет в Excel/PDF/CSV' })
  @ApiQuery({ name: 'type', enum: ['transactions', 'customers', 'loyalty', 'campaigns', 'financial', 'full'], required: true })
  @ApiQuery({ name: 'format', enum: ['excel', 'pdf', 'csv'], required: true })
  @ApiQuery({ name: 'period', enum: ['day', 'week', 'month', 'quarter', 'year'], required: false })
  @ApiQuery({ name: 'from', type: String, required: false, description: 'ISO date string' })
  @ApiQuery({ name: 'to', type: String, required: false, description: 'ISO date string' })
  @ApiResponse({ status: 200, description: 'Файл отчета' })
  async exportReport(
    @Param('merchantId') merchantId: string,
    @Query('type') type: string,
    @Query('format') format: string,
    @Query('period') periodType?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Res() res?: Response,
  ) {
    try {
      const period = this.getPeriod(periodType, from, to);
      
      const options: ReportOptions = {
        merchantId,
        type: type as ReportOptions['type'],
        format: format as ReportOptions['format'],
        period,
        language: 'ru',
      };

      const buffer = await this.reportService.generateReport(options);

      // Устанавливаем заголовки для скачивания
      const filename = this.getFilename(type, format, period);
      const contentType = this.getContentType(format);

      res!.set({
        'Content-Type': contentType,
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': buffer.length.toString(),
      });

      res!.send(buffer);
    } catch (error) {
      throw new HttpException(
        error.message || 'Ошибка генерации отчета',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Готовые шаблоны отчетов
   */
  @Get('templates')
  @ApiOperation({ summary: 'Получить список готовых шаблонов отчетов' })
  @ApiResponse({ status: 200, description: 'Список шаблонов' })
  async getReportTemplates() {
    return [
      {
        id: 'daily_sales',
        name: 'Ежедневный отчет по продажам',
        description: 'Выручка, транзакции, топ товары за день',
        type: 'financial',
        format: 'excel',
        period: 'day',
        icon: '📊',
      },
      {
        id: 'monthly_customers',
        name: 'Месячный отчет по клиентам',
        description: 'Новые клиенты, активность, сегменты',
        type: 'customers',
        format: 'excel',
        period: 'month',
        icon: '👥',
      },
      {
        id: 'loyalty_summary',
        name: 'Сводка по программе лояльности',
        description: 'Баллы, использование, ROI программы',
        type: 'loyalty',
        format: 'pdf',
        period: 'month',
        icon: '🎁',
      },
      {
        id: 'campaign_effectiveness',
        name: 'Эффективность акций',
        description: 'ROI кампаний, конверсия, использование',
        type: 'campaigns',
        format: 'excel',
        period: 'month',
        icon: '📢',
      },
      {
        id: 'full_monthly',
        name: 'Полный месячный отчет',
        description: 'Все данные за месяц в одном файле',
        type: 'full',
        format: 'excel',
        period: 'month',
        icon: '📚',
      },
      {
        id: 'tax_report',
        name: 'Налоговый отчет',
        description: 'Данные для налоговой отчетности',
        type: 'financial',
        format: 'excel',
        period: 'quarter',
        icon: '🏦',
      },
    ];
  }

  /**
   * Быстрый экспорт транзакций
   */
  @Get('quick/transactions/:merchantId')
  @ApiOperation({ summary: 'Быстрый экспорт транзакций за сегодня в CSV' })
  @ApiResponse({ status: 200, description: 'CSV файл с транзакциями' })
  async quickTransactionsExport(
    @Param('merchantId') merchantId: string,
    @Res() res?: Response,
  ) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const options: ReportOptions = {
      merchantId,
      type: 'transactions',
      format: 'csv',
      period: {
        from: today,
        to: tomorrow,
        type: 'day',
      },
      language: 'ru',
    };

    const buffer = await this.reportService.generateReport(options);
    const filename = `transactions_${today.toISOString().split('T')[0]}.csv`;

    res!.set({
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Length': buffer.length.toString(),
    });

    res!.send(buffer);
  }

  /**
   * Планировщик отчетов
   */
  @Get('schedule/:merchantId')
  @ApiOperation({ summary: 'Получить расписание автоматических отчетов' })
  @ApiResponse({ status: 200, description: 'Расписание отчетов' })
  async getReportSchedule(@Param('merchantId') merchantId: string) {
    // TODO: Реализовать хранение и управление расписанием
    return {
      merchantId,
      schedules: [
        {
          id: 'daily_1',
          name: 'Ежедневный отчет',
          type: 'financial',
          format: 'excel',
          period: 'day',
          frequency: 'daily',
          time: '09:00',
          email: 'owner@business.ru',
          enabled: true,
        },
        {
          id: 'weekly_1',
          name: 'Недельная сводка',
          type: 'full',
          format: 'pdf',
          period: 'week',
          frequency: 'weekly',
          dayOfWeek: 1, // Понедельник
          time: '10:00',
          email: 'owner@business.ru',
          enabled: true,
        },
        {
          id: 'monthly_1',
          name: 'Месячный отчет',
          type: 'full',
          format: 'excel',
          period: 'month',
          frequency: 'monthly',
          dayOfMonth: 1,
          time: '08:00',
          email: 'owner@business.ru',
          enabled: false,
        },
      ],
    };
  }

  // Вспомогательные методы

  private getPeriod(
    periodType?: string,
    fromStr?: string,
    toStr?: string,
  ): ReportOptions['period'] {
    const now = new Date();
    let from = new Date();
    let to = new Date();

    if (fromStr && toStr) {
      from = new Date(fromStr);
      to = new Date(toStr);
      return { from, to, type: 'custom' };
    }

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
        to.setDate(0);
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
      type: (periodType as any) || 'month',
    };
  }

  private getFilename(type: string, format: string, period: any): string {
    const date = new Date().toISOString().split('T')[0];
    const typeLabels: Record<string, string> = {
      transactions: 'транзакции',
      customers: 'клиенты',
      loyalty: 'лояльность',
      campaigns: 'акции',
      financial: 'финансы',
      full: 'полный_отчет',
    };
    
    const extension = format === 'excel' ? 'xlsx' : format;
    return `${typeLabels[type] || type}_${date}.${extension}`;
  }

  private getContentType(format: string): string {
    switch (format) {
      case 'excel':
        return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
      case 'pdf':
        return 'application/pdf';
      case 'csv':
        return 'text/csv; charset=utf-8';
      default:
        return 'application/octet-stream';
    }
  }
}
