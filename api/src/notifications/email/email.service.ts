import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import * as handlebars from 'handlebars';
import { PrismaService } from '../../prisma.service';

export interface SendEmailDto {
  to: string | string[];
  subject: string;
  template: string;
  data?: Record<string, any>;
  attachments?: Array<{
    filename: string;
    content?: Buffer;
    path?: string;
    contentType?: string;
  }>;
  merchantId?: string;
  customerId?: string;
  campaignId?: string;
}

export interface EmailTemplate {
  id: string;
  name: string;
  subject: string;
  html: string;
  text?: string;
  variables: string[];
  category: 'transactional' | 'marketing' | 'system';
}

@Injectable()
export class EmailService {
  private transporter: nodemailer.Transporter;
  private templates: Map<string, handlebars.TemplateDelegate> = new Map();
  private defaultFrom: string;

  constructor(
    private configService: ConfigService,
    private prisma: PrismaService,
  ) {
    // Настройка транспортера
    const smtpConfig = {
      host: this.configService.get('SMTP_HOST') || 'smtp.gmail.com',
      port: parseInt(this.configService.get('SMTP_PORT') || '587'),
      secure: this.configService.get('SMTP_SECURE') === 'true',
      auth: {
        user: this.configService.get('SMTP_USER'),
        pass: this.configService.get('SMTP_PASSWORD'),
      },
    };

    this.transporter = nodemailer.createTransport(smtpConfig);
    this.defaultFrom =
      this.configService.get('SMTP_FROM') ||
      'Loyalty System <noreply@loyalty.com>';

    // Регистрация хелперов Handlebars
    this.registerHandlebarsHelpers();

    // Загрузка шаблонов
    this.loadTemplates();
  }

  /**
   * Отправка email
   */
  async sendEmail(dto: SendEmailDto): Promise<boolean> {
    try {
      const template = this.templates.get(dto.template);
      if (!template) {
        throw new Error(`Template ${dto.template} not found`);
      }

      // Добавляем базовые данные
      const emailData = {
        ...dto.data,
        year: new Date().getFullYear(),
        supportEmail:
          this.configService.get('SUPPORT_EMAIL') || 'support@loyalty.com',
        websiteUrl:
          this.configService.get('WEBSITE_URL') || 'https://loyalty.com',
      };

      // Компилируем HTML
      const html = template(emailData);

      // Генерируем текстовую версию
      const text = this.htmlToText(html);

      // Настройки письма
      const mailOptions: nodemailer.SendMailOptions = {
        from: this.defaultFrom,
        to: Array.isArray(dto.to) ? dto.to.join(', ') : dto.to,
        subject: dto.subject,
        html,
        text,
        attachments: dto.attachments,
      };

      // Отправляем
      const info = await this.transporter.sendMail(mailOptions);

      // Сохраняем в БД
      if (dto.merchantId) {
        await this.prisma.emailNotification.create({
          data: {
            merchantId: dto.merchantId,
            customerId: dto.customerId,
            campaignId: dto.campaignId,
            to: Array.isArray(dto.to) ? dto.to.join(', ') : dto.to,
            subject: dto.subject,
            template: dto.template,
            status: 'sent',
            messageId: info.messageId,
            metadata: dto.data,
          },
        });
      }

      return true;
    } catch (error) {
      console.error('Error sending email:', error);

      // Сохраняем ошибку в БД
      if (dto.merchantId) {
        await this.prisma.emailNotification.create({
          data: {
            merchantId: dto.merchantId,
            customerId: dto.customerId,
            campaignId: dto.campaignId,
            to: Array.isArray(dto.to) ? dto.to.join(', ') : dto.to,
            subject: dto.subject,
            template: dto.template,
            status: 'failed',
            error: error.message,
            metadata: dto.data,
          },
        });
      }

      return false;
    }
  }

  /**
   * Отправка приветственного письма
   */
  async sendWelcomeEmail(
    merchantId: string,
    customerId: string,
    email: string,
  ) {
    const [merchant, customer] = await Promise.all([
      this.prisma.merchant.findUnique({ where: { id: merchantId } }),
      this.prisma.customer.findUnique({ where: { id: customerId } }),
    ]);

    if (!merchant || !customer) return;

    return this.sendEmail({
      to: email,
      subject: `Добро пожаловать в программу лояльности ${merchant.name}!`,
      template: 'welcome',
      data: {
        customerName: customer.name || 'Уважаемый клиент',
        merchantName: merchant.name,
        bonusPoints: 500, // Приветственные баллы
        merchantLogo: merchant.logo,
      },
      merchantId,
      customerId,
    });
  }

  /**
   * Уведомление о транзакции
   */
  async sendTransactionEmail(
    transactionId: string,
    type: 'earn' | 'redeem' | 'refund',
  ) {
    const transaction = await this.prisma.transaction.findUnique({
      where: { id: transactionId },
      include: {
        customer: true,
        merchant: true,
      },
    });

    if (!transaction || !transaction.customer?.email) return;

    const wallet = await this.prisma.wallet.findFirst({
      where: {
        merchantId: transaction.merchantId,
        customerId: transaction.customerId,
        type: 'POINTS' as any,
      },
    });

    const templates = {
      earn: 'points_earned',
      redeem: 'points_redeemed',
      refund: 'points_refunded',
    };

    const subjects = {
      earn: `Вам начислено ${Math.abs(transaction.amount)} баллов!`,
      redeem: `Списано ${Math.abs(transaction.amount)} баллов`,
      refund: `Возврат ${Math.abs(transaction.amount)} баллов`,
    };

    return this.sendEmail({
      to: transaction.customer.email,
      subject: subjects[type],
      template: templates[type],
      data: {
        customerName: transaction.customer.name || 'Уважаемый клиент',
        merchantName: transaction.merchant.name,
        points: Math.abs(transaction.amount),
        balance: wallet?.balance || 0,
        transactionDate: transaction.createdAt.toLocaleDateString('ru-RU'),
        orderId: transaction.orderId,
      },
      merchantId: transaction.merchantId,
      customerId: transaction.customerId,
    });
  }

  /**
   * Рассылка по кампании
   */
  async sendCampaignEmail(
    campaignId: string,
    customerIds: string[],
    subject: string,
    content: string,
  ) {
    const promotion = await this.prisma.loyaltyPromotion.findUnique({
      where: { id: campaignId },
      include: { merchant: true },
    });

    if (!promotion) return;

    const rewardMeta =
      promotion.rewardMetadata && typeof promotion.rewardMetadata === 'object'
        ? (promotion.rewardMetadata as Record<string, any>)
        : {};
    const campaignType = String(
      rewardMeta.kind || promotion.rewardType || '',
    );

    const customers = await this.prisma.customer.findMany({
      where: {
        id: { in: customerIds },
        email: { not: null },
      },
    });

    const results: boolean[] = [];
    for (const customer of customers) {
      const result = await this.sendEmail({
        to: customer.email!,
        subject,
        template: 'campaign',
        data: {
          customerName: customer.name || 'Уважаемый клиент',
          merchantName: promotion.merchant.name,
          campaignName: promotion.name,
          content,
          campaignType: campaignType || 'LOYALTY_PROMOTION',
          startDate: promotion.startAt?.toLocaleDateString('ru-RU') ?? null,
          endDate: promotion.endAt?.toLocaleDateString('ru-RU') ?? null,
        },
        merchantId: promotion.merchantId,
        customerId: customer.id,
        campaignId,
      });
      results.push(result);
    }

    return {
      sent: results.filter((r) => r).length,
      failed: results.filter((r) => !r).length,
      total: results.length,
    };
  }

  /**
   * Отправка отчета
   */
  async sendReportEmail(
    merchantId: string,
    email: string,
    reportType: string,
    reportBuffer: Buffer,
    format: 'pdf' | 'excel' | 'csv',
  ) {
    const merchant = await this.prisma.merchant.findUnique({
      where: { id: merchantId },
    });

    if (!merchant) return;

    const formatNames = {
      pdf: 'PDF',
      excel: 'Excel',
      csv: 'CSV',
    };

    const extensions = {
      pdf: '.pdf',
      excel: '.xlsx',
      csv: '.csv',
    };

    const contentTypes = {
      pdf: 'application/pdf',
      excel:
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      csv: 'text/csv',
    };

    const reportDate = new Date().toLocaleDateString('ru-RU');
    const filename = `report_${reportType}_${Date.now()}${extensions[format]}`;

    return this.sendEmail({
      to: email,
      subject: `Отчет по программе лояльности за ${reportDate}`,
      template: 'report',
      data: {
        merchantName: merchant.name,
        reportType,
        reportDate,
        format: formatNames[format],
      },
      attachments: [
        {
          filename,
          content: reportBuffer,
          contentType: contentTypes[format],
        },
      ],
      merchantId,
    });
  }

  /**
   * Напоминание о неиспользованных баллах
   */
  async sendPointsReminder(customerId: string) {
    const customer = await this.prisma.customer.findUnique({
      where: { id: customerId },
      include: {
        wallets: {
          where: { balance: { gt: 0 } },
          include: { merchant: true },
        },
      },
    });

    if (!customer || !customer.email || customer.wallets.length === 0) return;

    for (const wallet of customer.wallets) {
      await this.sendEmail({
        to: customer.email,
        subject: `У вас ${wallet.balance} неиспользованных баллов!`,
        template: 'points_reminder',
        data: {
          customerName: customer.name || 'Уважаемый клиент',
          merchantName: wallet.merchant.name,
          balance: wallet.balance,
          expiryDate: new Date(
            Date.now() + 30 * 24 * 60 * 60 * 1000,
          ).toLocaleDateString('ru-RU'),
        },
        merchantId: wallet.merchantId,
        customerId,
      });
    }
  }

  /**
   * Загрузка и компиляция шаблонов
   */
  private loadTemplates() {
    const templates = this.getEmailTemplates();

    for (const template of templates) {
      const compiled = handlebars.compile(template.html);
      this.templates.set(template.id, compiled);
    }
  }

  /**
   * Регистрация хелперов Handlebars
   */
  private registerHandlebarsHelpers() {
    // Форматирование валюты
    handlebars.registerHelper('currency', (amount: number) => {
      return new Intl.NumberFormat('ru-RU', {
        style: 'currency',
        currency: 'RUB',
        minimumFractionDigits: 0,
      }).format(amount);
    });

    // Форматирование даты
    handlebars.registerHelper('date', (date: Date | string) => {
      return new Date(date).toLocaleDateString('ru-RU', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      });
    });

    // Условный оператор
    handlebars.registerHelper('ifEquals', function (arg1, arg2, options) {
      return arg1 === arg2 ? options.fn(this) : options.inverse(this);
    });
  }

  /**
   * Конвертация HTML в текст
   */
  private htmlToText(html: string): string {
    return html
      .replace(/<style[^>]*>.*?<\/style>/gi, '')
      .replace(/<script[^>]*>.*?<\/script>/gi, '')
      .replace(/<[^>]+>/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Шаблоны писем
   */
  getEmailTemplates(): EmailTemplate[] {
    return [
      {
        id: 'welcome',
        name: 'Приветственное письмо',
        subject: 'Добро пожаловать!',
        category: 'transactional',
        variables: ['customerName', 'merchantName', 'bonusPoints'],
        html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
    .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
    .button { display: inline-block; padding: 12px 30px; background: #667eea; color: white; text-decoration: none; border-radius: 5px; margin: 20px 0; }
    .footer { text-align: center; margin-top: 30px; color: #666; font-size: 12px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Добро пожаловать в {{merchantName}}!</h1>
    </div>
    <div class="content">
      <p>Здравствуйте, {{customerName}}!</p>
      <p>Поздравляем с регистрацией в программе лояльности {{merchantName}}!</p>
      <p>В качестве приветственного бонуса мы начислили вам <strong>{{bonusPoints}} баллов</strong>.</p>
      <p>Используйте их для получения скидок и специальных предложений.</p>
      <center>
        <a href="{{websiteUrl}}" class="button">Перейти в личный кабинет</a>
      </center>
    </div>
    <div class="footer">
      <p>© {{year}} {{merchantName}}. Все права защищены.</p>
      <p>Если у вас есть вопросы, напишите нам: {{supportEmail}}</p>
    </div>
  </div>
</body>
</html>
        `,
      },
      {
        id: 'points_earned',
        name: 'Начисление баллов',
        subject: 'Баллы начислены',
        category: 'transactional',
        variables: [
          'customerName',
          'merchantName',
          'points',
          'balance',
          'transactionDate',
        ],
        html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: #4CAF50; color: white; padding: 20px; text-align: center; border-radius: 10px 10px 0 0; }
    .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
    .points { font-size: 36px; color: #4CAF50; font-weight: bold; text-align: center; margin: 20px 0; }
    .balance { background: white; padding: 15px; border-radius: 5px; margin: 20px 0; }
    .footer { text-align: center; margin-top: 30px; color: #666; font-size: 12px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Баллы начислены!</h1>
    </div>
    <div class="content">
      <p>Здравствуйте, {{customerName}}!</p>
      <div class="points">+{{points}} баллов</div>
      <p>Спасибо за покупку в {{merchantName}}!</p>
      <div class="balance">
        <strong>Ваш текущий баланс:</strong> {{balance}} баллов
      </div>
      <p><small>Дата транзакции: {{transactionDate}}</small></p>
    </div>
    <div class="footer">
      <p>© {{year}} {{merchantName}}. Все права защищены.</p>
    </div>
  </div>
</body>
</html>
        `,
      },
      {
        id: 'points_redeemed',
        name: 'Списание баллов',
        subject: 'Баллы использованы',
        category: 'transactional',
        variables: ['customerName', 'merchantName', 'points', 'balance'],
        html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: #FF9800; color: white; padding: 20px; text-align: center; border-radius: 10px 10px 0 0; }
    .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
    .points { font-size: 36px; color: #FF9800; font-weight: bold; text-align: center; margin: 20px 0; }
    .balance { background: white; padding: 15px; border-radius: 5px; margin: 20px 0; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Баллы использованы</h1>
    </div>
    <div class="content">
      <p>Здравствуйте, {{customerName}}!</p>
      <div class="points">-{{points}} баллов</div>
      <p>Вы успешно использовали баллы для оплаты в {{merchantName}}.</p>
      <div class="balance">
        <strong>Остаток баллов:</strong> {{balance}}
      </div>
    </div>
  </div>
</body>
</html>
        `,
      },
      {
        id: 'campaign',
        name: 'Маркетинговая кампания',
        subject: 'Специальное предложение',
        category: 'marketing',
        variables: ['customerName', 'merchantName', 'campaignName', 'content'],
        html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
    .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
    .offer { background: white; padding: 20px; border-left: 4px solid #667eea; margin: 20px 0; }
    .button { display: inline-block; padding: 12px 30px; background: #667eea; color: white; text-decoration: none; border-radius: 5px; margin: 20px 0; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>{{campaignName}}</h1>
    </div>
    <div class="content">
      <p>Здравствуйте, {{customerName}}!</p>
      <div class="offer">
        {{{content}}}
      </div>
      <center>
        <a href="{{websiteUrl}}" class="button">Подробнее</a>
      </center>
      <p><small>Предложение от {{merchantName}}</small></p>
    </div>
  </div>
</body>
</html>
        `,
      },
      {
        id: 'points_reminder',
        name: 'Напоминание о баллах',
        subject: 'Не забудьте использовать баллы',
        category: 'marketing',
        variables: ['customerName', 'merchantName', 'balance', 'expiryDate'],
        html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: #2196F3; color: white; padding: 20px; text-align: center; border-radius: 10px 10px 0 0; }
    .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
    .alert { background: #FFF3CD; border: 1px solid #FFC107; padding: 15px; border-radius: 5px; margin: 20px 0; }
    .balance { font-size: 48px; color: #2196F3; font-weight: bold; text-align: center; margin: 20px 0; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>У вас есть неиспользованные баллы!</h1>
    </div>
    <div class="content">
      <p>Здравствуйте, {{customerName}}!</p>
      <p>Напоминаем, что у вас на счету:</p>
      <div class="balance">{{balance}} баллов</div>
      <div class="alert">
        <strong>Внимание!</strong> Используйте баллы до {{expiryDate}}, чтобы они не сгорели.
      </div>
      <p>Приходите в {{merchantName}} и получите скидку!</p>
    </div>
  </div>
</body>
</html>
        `,
      },
      {
        id: 'report',
        name: 'Отчет',
        subject: 'Ваш отчет готов',
        category: 'system',
        variables: ['merchantName', 'reportType', 'reportDate', 'format'],
        html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: #607D8B; color: white; padding: 20px; text-align: center; border-radius: 10px 10px 0 0; }
    .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
    .attachment { background: white; padding: 15px; border: 1px solid #ddd; border-radius: 5px; margin: 20px 0; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Отчет готов</h1>
    </div>
    <div class="content">
      <p>Здравствуйте!</p>
      <p>Ваш отчет по программе лояльности {{merchantName}} за {{reportDate}} готов.</p>
      <div class="attachment">
        <strong>📎 Вложение:</strong> Отчет в формате {{format}}
      </div>
      <p>Отчет прикреплен к этому письму.</p>
      <p><small>Это автоматическое сообщение. Пожалуйста, не отвечайте на него.</small></p>
    </div>
  </div>
</body>
</html>
        `,
      },
    ];
  }
}
