import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { ConfigService } from '@nestjs/config';
import * as ExcelJS from 'exceljs';
import * as PDFDocument from 'pdfkit';
import { AnalyticsService, DashboardPeriod } from '../analytics/analytics.service';

export interface ReportOptions {
  merchantId: string;
  type: 'transactions' | 'customers' | 'loyalty' | 'campaigns' | 'financial' | 'full';
  format: 'excel' | 'pdf' | 'csv';
  period: DashboardPeriod;
  language?: 'ru' | 'en';
}

@Injectable()
export class ReportService {
  constructor(
    private prisma: PrismaService,
    private configService: ConfigService,
    private analyticsService: AnalyticsService,
  ) {}

  /**
   * Генерация отчета
   */
  async generateReport(options: ReportOptions): Promise<Buffer> {
    switch (options.format) {
      case 'excel':
        return this.generateExcelReport(options);
      case 'pdf':
        return this.generatePdfReport(options);
      case 'csv':
        return this.generateCsvReport(options);
      default:
        throw new Error(`Unsupported format: ${options.format}`);
    }
  }

  /**
   * Excel отчет
   */
  private async generateExcelReport(options: ReportOptions): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Loyalty System';
    workbook.created = new Date();

    // Получаем данные мерчанта
    const merchant = await this.prisma.merchant.findUnique({
      where: { id: options.merchantId },
    });

    // Добавляем листы в зависимости от типа отчета
    switch (options.type) {
      case 'transactions':
        await this.addTransactionsSheet(workbook, options);
        break;
      case 'customers':
        await this.addCustomersSheet(workbook, options);
        break;
      case 'loyalty':
        await this.addLoyaltySheet(workbook, options);
        break;
      case 'campaigns':
        await this.addCampaignsSheet(workbook, options);
        break;
      case 'financial':
        await this.addFinancialSheet(workbook, options);
        break;
      case 'full':
        // Полный отчет - все листы
        await Promise.all([
          this.addTransactionsSheet(workbook, options),
          this.addCustomersSheet(workbook, options),
          this.addLoyaltySheet(workbook, options),
          this.addCampaignsSheet(workbook, options),
          this.addFinancialSheet(workbook, options),
        ]);
        break;
    }

    // Генерируем буфер
    return workbook.xlsx.writeBuffer() as unknown as Promise<Buffer>;
  }

  /**
   * Лист транзакций
   */
  private async addTransactionsSheet(workbook: ExcelJS.Workbook, options: ReportOptions) {
    const sheet = workbook.addWorksheet('Транзакции');
    
    // Заголовки
    sheet.columns = [
      { header: 'Дата', key: 'date', width: 20 },
      { header: 'Время', key: 'time', width: 10 },
      { header: 'Тип', key: 'type', width: 15 },
      { header: 'Клиент', key: 'customer', width: 20 },
      { header: 'Телефон', key: 'phone', width: 15 },
      { header: 'Сумма', key: 'amount', width: 12 },
      { header: 'Баллы', key: 'points', width: 12 },
      { header: 'Баланс после', key: 'balance', width: 12 },
      { header: 'Точка', key: 'outlet', width: 20 },
      { header: 'Сотрудник', key: 'staff', width: 20 },
      { header: 'ID заказа', key: 'orderId', width: 20 },
    ];

    // Стиль заголовков
    sheet.getRow(1).font = { bold: true };
    sheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFE0E0E0' },
    };

    // Получаем транзакции
    const transactions = await this.prisma.transaction.findMany({
      where: {
        merchantId: options.merchantId,
        createdAt: {
          gte: options.period.from,
          lte: options.period.to,
        },
      },
      include: {
        customer: true,
        outlet: true,
        staff: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    // Добавляем данные
    transactions.forEach(t => {
      const row = sheet.addRow({
        date: t.createdAt.toLocaleDateString('ru-RU'),
        time: t.createdAt.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }),
        type: this.getTransactionTypeLabel(t.type),
        customer: t.customer.name || 'Без имени',
        phone: t.customer.phone || '',
        amount: t.type === 'EARN' ? Math.abs(t.amount) : 0,
        points: t.type !== 'EARN' ? t.amount : 0,
        balance: 0,
        outlet: t.outlet?.name || '',
        staff: t.staff?.login || t.staff?.email || '',
        orderId: t.orderId || '',
      });

      // Форматирование чисел
      row.getCell('amount').numFmt = '#,##0.00₽';
      row.getCell('points').numFmt = '#,##0';
      row.getCell('balance').numFmt = '#,##0';
    });

    // Автофильтр
    sheet.autoFilter = {
      from: 'A1',
      to: `K${transactions.length + 1}`,
    };

    // Итоги
    const summaryRow = sheet.addRow({
      date: 'ИТОГО:',
      amount: { formula: `SUM(F2:F${transactions.length + 1})` },
      points: { formula: `SUM(G2:G${transactions.length + 1})` },
    });
    summaryRow.font = { bold: true };
    summaryRow.getCell('amount').numFmt = '#,##0.00₽';
    summaryRow.getCell('points').numFmt = '#,##0';
  }

  /**
   * Лист клиентов
   */
  private async addCustomersSheet(workbook: ExcelJS.Workbook, options: ReportOptions) {
    const sheet = workbook.addWorksheet('Клиенты');
    
    sheet.columns = [
      { header: 'ID', key: 'id', width: 10 },
      { header: 'Имя', key: 'name', width: 20 },
      { header: 'Телефон', key: 'phone', width: 15 },
      { header: 'Email', key: 'email', width: 25 },
      { header: 'Баланс баллов', key: 'balance', width: 15 },
      { header: 'Всего потрачено', key: 'totalSpent', width: 15 },
      { header: 'Кол-во покупок', key: 'purchases', width: 15 },
      { header: 'Средний чек', key: 'avgCheck', width: 15 },
      { header: 'Последняя покупка', key: 'lastPurchase', width: 20 },
      { header: 'Дата регистрации', key: 'registeredAt', width: 20 },
      { header: 'Статус', key: 'status', width: 15 },
    ];

    sheet.getRow(1).font = { bold: true };
    sheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFE0E0E0' },
    };

    // Получаем клиентов
    const customers = await this.prisma.customer.findMany({
      where: {
        wallets: {
          some: { merchantId: options.merchantId },
        },
      },
      include: {
        wallets: {
          where: { merchantId: options.merchantId },
        },
        transactions: {
          where: {
            merchantId: options.merchantId,
            createdAt: {
              gte: options.period.from,
              lte: options.period.to,
            },
          },
        },
      },
    });

    // Добавляем данные
    customers.forEach(c => {
      const wallet = c.wallets[0];
      const totalSpent = c.transactions
        .filter(t => t.type === 'EARN')
        .reduce((sum, t) => sum + Math.abs(t.amount), 0);
      const purchases = c.transactions.filter(t => t.type === 'EARN').length;
      const avgCheck = purchases > 0 ? totalSpent / purchases : 0;
      const lastPurchase = c.transactions
        .filter(t => t.type === 'EARN')
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];

      const row = sheet.addRow({
        id: c.id.substring(0, 8),
        name: c.name || 'Без имени',
        phone: c.phone || '',
        email: c.email || '',
        balance: wallet?.balance || 0,
        totalSpent,
        purchases,
        avgCheck,
        lastPurchase: lastPurchase?.createdAt.toLocaleDateString('ru-RU') || '',
        registeredAt: wallet?.createdAt.toLocaleDateString('ru-RU') || '',
        status: this.getCustomerStatus(purchases),
      });

      row.getCell('balance').numFmt = '#,##0';
      row.getCell('totalSpent').numFmt = '#,##0.00₽';
      row.getCell('avgCheck').numFmt = '#,##0.00₽';
    });

    sheet.autoFilter = {
      from: 'A1',
      to: `K${customers.length + 1}`,
    };
  }

  /**
   * Лист программы лояльности
   */
  private async addLoyaltySheet(workbook: ExcelJS.Workbook, options: ReportOptions) {
    const sheet = workbook.addWorksheet('Программа лояльности');
    
    // Получаем метрики
    const metrics = await this.analyticsService.getLoyaltyMetrics(
      options.merchantId,
      options.period
    );

    // Сводка
    const summaryData = [
      ['Показатель', 'Значение'],
      ['Начислено баллов', metrics.totalPointsIssued],
      ['Списано баллов', metrics.totalPointsRedeemed],
      ['Процент использования', `${metrics.pointsRedemptionRate}%`],
      ['Средний баланс', metrics.averageBalance],
      ['Активных кошельков', metrics.activeWallets],
      ['ROI программы', `${metrics.programROI}%`],
      ['Конверсия с баллами', `${metrics.conversionRate}%`],
    ];

    summaryData.forEach((row, index) => {
      const excelRow = sheet.addRow(row);
      if (index === 0) {
        excelRow.font = { bold: true };
        excelRow.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFE0E0E0' },
        };
      }
    });

    sheet.getColumn(1).width = 30;
    sheet.getColumn(2).width = 20;
  }

  /**
   * Лист кампаний
   */
  private async addCampaignsSheet(workbook: ExcelJS.Workbook, options: ReportOptions) {
    const sheet = workbook.addWorksheet('Акции');
    
    sheet.columns = [
      { header: 'Название', key: 'name', width: 30 },
      { header: 'Тип', key: 'type', width: 20 },
      { header: 'Статус', key: 'status', width: 15 },
      { header: 'Начало', key: 'startDate', width: 15 },
      { header: 'Окончание', key: 'endDate', width: 15 },
      { header: 'Использований', key: 'usages', width: 15 },
      { header: 'Выдано наград', key: 'rewards', width: 15 },
      { header: 'ROI', key: 'roi', width: 10 },
    ];

    sheet.getRow(1).font = { bold: true };
    sheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFE0E0E0' },
    };

    const campaigns = await this.prisma.campaign.findMany({
      where: { merchantId: options.merchantId },
      include: {
        usages: {
          where: {
            usedAt: {
              gte: options.period.from,
              lte: options.period.to,
            },
          },
        },
      },
    });

    campaigns.forEach(c => {
      const totalRewards = c.usages.reduce((sum, u) => sum + (u.rewardValue || 0), 0);
      
      const row = sheet.addRow({
        name: c.name,
        type: this.getCampaignTypeLabel(c.type),
        status: this.getCampaignStatusLabel(c.status),
        startDate: c.startDate?.toLocaleDateString('ru-RU') || '',
        endDate: c.endDate?.toLocaleDateString('ru-RU') || '',
        usages: c.usages.length,
        rewards: totalRewards,
        roi: '0%',
      });

      row.getCell('rewards').numFmt = '#,##0';
    });
  }

  /**
   * Финансовый лист
   */
  private async addFinancialSheet(workbook: ExcelJS.Workbook, options: ReportOptions) {
    const sheet = workbook.addWorksheet('Финансы');
    
    const metrics = await this.analyticsService.getRevenueMetrics(
      options.merchantId,
      options.period
    );

    // Ежедневная выручка
    sheet.addRow(['Дата', 'Выручка', 'Транзакций', 'Клиентов', 'Средний чек']);
    sheet.getRow(1).font = { bold: true };
    sheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFE0E0E0' },
    };

    metrics.dailyRevenue.forEach(day => {
      const row = sheet.addRow([
        day.date,
        day.revenue,
        day.transactions,
        day.customers,
        day.transactions > 0 ? day.revenue / day.transactions : 0,
      ]);
      
      row.getCell(2).numFmt = '#,##0.00₽';
      row.getCell(5).numFmt = '#,##0.00₽';
    });

    // Итоги
    const totalRow = sheet.addRow([
      'ИТОГО:',
      { formula: `SUM(B2:B${metrics.dailyRevenue.length + 1})` },
      { formula: `SUM(C2:C${metrics.dailyRevenue.length + 1})` },
      { formula: `SUM(D2:D${metrics.dailyRevenue.length + 1})` },
      { formula: `AVERAGE(E2:E${metrics.dailyRevenue.length + 1})` },
    ]);
    totalRow.font = { bold: true };
    totalRow.getCell(2).numFmt = '#,##0.00₽';
    totalRow.getCell(5).numFmt = '#,##0.00₽';

    sheet.getColumn(1).width = 15;
    sheet.getColumn(2).width = 15;
    sheet.getColumn(3).width = 12;
    sheet.getColumn(4).width = 12;
    sheet.getColumn(5).width = 15;
  }

  /**
   * PDF отчет
   */
  private async generatePdfReport(options: ReportOptions): Promise<Buffer> {
    const doc = new PDFDocument({ margin: 50, size: 'A4' });
    const chunks: Buffer[] = [];
    
    doc.on('data', chunk => chunks.push(chunk));
    
    // Заголовок
    doc.font('Helvetica-Bold').fontSize(20).text('Отчет по программе лояльности', { align: 'center' });
    doc.moveDown();
    
    // Информация о периоде
    doc.font('Helvetica').fontSize(12)
      .text(`Период: ${options.period.from.toLocaleDateString('ru-RU')} - ${options.period.to.toLocaleDateString('ru-RU')}`)
      .moveDown();

    // Получаем данные
    const [revenue, customers, loyalty] = await Promise.all([
      this.analyticsService.getRevenueMetrics(options.merchantId, options.period),
      this.analyticsService.getCustomerMetrics(options.merchantId, options.period),
      this.analyticsService.getLoyaltyMetrics(options.merchantId, options.period),
    ]);

    // Секция выручки
    doc.font('Helvetica-Bold').fontSize(16).text('Финансовые показатели').moveDown(0.5);
    doc.font('Helvetica').fontSize(11)
      .text(`Общая выручка: ${this.formatCurrency(revenue.totalRevenue)}`)
      .text(`Количество транзакций: ${revenue.transactionCount}`)
      .text(`Средний чек: ${this.formatCurrency(revenue.averageCheck)}`)
      .text(`Рост выручки: ${revenue.revenueGrowth}%`)
      .moveDown();

    // Секция клиентов
    doc.font('Helvetica-Bold').fontSize(16).text('Клиентская база').moveDown(0.5);
    doc.font('Helvetica').fontSize(11)
      .text(`Всего клиентов: ${customers.totalCustomers}`)
      .text(`Новых клиентов: ${customers.newCustomers}`)
      .text(`Активных клиентов: ${customers.activeCustomers}`)
      .text(`Удержание: ${customers.retentionRate}%`)
      .text(`Средний LTV: ${this.formatCurrency(customers.customerLifetimeValue)}`)
      .moveDown();

    // Секция лояльности
    doc.font('Helvetica-Bold').fontSize(16).text('Программа лояльности').moveDown(0.5);
    doc.font('Helvetica').fontSize(11)
      .text(`Начислено баллов: ${loyalty.totalPointsIssued}`)
      .text(`Списано баллов: ${loyalty.totalPointsRedeemed}`)
      .text(`Процент использования: ${loyalty.pointsRedemptionRate}%`)
      .text(`Активных кошельков: ${loyalty.activeWallets}`)
      .text(`ROI программы: ${loyalty.programROI}%`)
      .moveDown();

    doc.end();
    
    return new Promise((resolve) => {
      doc.on('end', () => {
        resolve(Buffer.concat(chunks));
      });
    });
  }

  /**
   * CSV отчет
   */
  private async generateCsvReport(options: ReportOptions): Promise<Buffer> {
    const transactions = await this.prisma.transaction.findMany({
      where: {
        merchantId: options.merchantId,
        createdAt: {
          gte: options.period.from,
          lte: options.period.to,
        },
      },
      include: {
        customer: true,
        outlet: true,
        staff: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    const headers = ['Дата', 'Время', 'Тип', 'Клиент', 'Телефон', 'Сумма', 'Баллы', 'Точка', 'Сотрудник', 'ID заказа'];
    const rows = transactions.map(t => [
      t.createdAt.toLocaleDateString('ru-RU'),
      t.createdAt.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }),
      this.getTransactionTypeLabel(t.type),
      t.customer.name || 'Без имени',
      t.customer.phone || '',
      t.type === 'EARN' ? Math.abs(t.amount).toString() : '0',
      t.type !== 'EARN' ? t.amount.toString() : '0',
      t.outlet?.name || '',
      t.staff?.login || t.staff?.email || '',
      t.orderId || '',
    ]);

    const csv = [headers, ...rows]
      .map(row => row.map(cell => `"${cell}"`).join(','))
      .join('\n');

    return Buffer.from('\ufeff' + csv, 'utf-8'); // BOM для корректного отображения в Excel
  }

  // Вспомогательные методы
  
  private getTransactionTypeLabel(type: string): string {
    const labels: Record<string, string> = {
      EARN: 'Начисление',
      REDEEM: 'Списание',
      REFUND: 'Возврат',
      CAMPAIGN: 'Акция',
      REFERRAL: 'Реферал',
      MANUAL: 'Ручное',
    };
    return labels[type] || type;
  }

  private getCampaignTypeLabel(type: string): string {
    const labels: Record<string, string> = {
      BONUS: 'Бонусы',
      DISCOUNT: 'Скидка',
      CASHBACK: 'Кэшбэк',
      BIRTHDAY: 'День рождения',
      REFERRAL: 'Реферальная',
      FIRST_PURCHASE: 'Первая покупка',
    };
    return labels[type] || type;
  }

  private getCampaignStatusLabel(status: string): string {
    const labels: Record<string, string> = {
      DRAFT: 'Черновик',
      ACTIVE: 'Активна',
      PAUSED: 'Приостановлена',
      COMPLETED: 'Завершена',
    };
    return labels[status] || status;
  }

  private getCustomerStatus(purchases: number): string {
    if (purchases === 0) return 'Новый';
    if (purchases < 5) return 'Обычный';
    if (purchases < 20) return 'Постоянный';
    return 'VIP';
  }

  private formatCurrency(amount: number): string {
    return new Intl.NumberFormat('ru-RU', {
      style: 'currency',
      currency: 'RUB',
      minimumFractionDigits: 0,
    }).format(amount);
  }
}
