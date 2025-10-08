import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma.service';
import { LoyaltyService } from '../../loyalty/loyalty.service';
import axios from 'axios';
import * as crypto from 'crypto';

export interface OneCConfig {
  merchantId: string;
  baseUrl: string;
  username: string;
  password: string;
  database?: string;
  syncProducts?: boolean;
  syncCustomers?: boolean;
  syncTransactions?: boolean;
  syncInventory?: boolean;
  webhookUrl?: string;
}

export interface OneCProduct {
  id: string;
  article: string;
  name: string;
  price: number;
  barcode?: string;
  category?: string;
  unit?: string;
  vat?: number;
  stock?: number;
}

export interface OneCCustomer {
  id: string;
  name: string;
  inn?: string;
  kpp?: string;
  phone?: string;
  email?: string;
  address?: string;
  type: 'INDIVIDUAL' | 'COMPANY';
  discount?: number;
}

export interface OneCTransaction {
  id: string;
  date: Date;
  number: string;
  customerId?: string;
  items: Array<{
    productId: string;
    quantity: number;
    price: number;
    discount?: number;
    sum: number;
  }>;
  total: number;
  payment: {
    type: 'CASH' | 'CARD' | 'TRANSFER';
    amount: number;
  };
}

@Injectable()
export class OneCService {
  private configs: Map<string, OneCConfig> = new Map();

  constructor(
    private prisma: PrismaService,
    private loyaltyService: LoyaltyService,
  ) {}

  /**
   * Настроить подключение к 1С
   */
  async configureConnection(config: OneCConfig) {
    // Проверяем подключение
    const isValid = await this.testConnection(config);
    if (!isValid) {
      throw new BadRequestException('Не удалось подключиться к 1С');
    }

    // Сохраняем конфигурацию
    this.configs.set(config.merchantId, config);

    // Сохраняем в БД
    const existing = await this.prisma.integration.findFirst({
      where: { merchantId: config.merchantId, type: 'ONEC' },
    });
    const data: any = {
      merchantId: config.merchantId,
      type: 'ONEC',
      provider: 'onec',
      isActive: true,
      config: {
        baseUrl: config.baseUrl,
        database: config.database,
        syncProducts: config.syncProducts,
        syncCustomers: config.syncCustomers,
        syncTransactions: config.syncTransactions,
        syncInventory: config.syncInventory,
      },
      credentials: this.encryptCredentials({
        username: config.username,
        password: config.password,
      }),
    };
    if (existing) {
      await this.prisma.integration.update({
        where: { id: existing.id },
        data,
      });
    } else {
      await this.prisma.integration.create({ data });
    }

    // Регистрируем webhook в 1С
    if (config.webhookUrl) {
      await this.registerWebhook(config);
    }

    return { success: true, message: 'Интеграция с 1С настроена' };
  }

  /**
   * Синхронизация товаров из 1С
   */
  async syncProducts(
    merchantId: string,
  ): Promise<{ synced: number; errors: number }> {
    const config = await this.getConfig(merchantId);
    if (!config || !config.syncProducts) {
      throw new BadRequestException('Синхронизация товаров не настроена');
    }

    const result = { synced: 0, errors: 0 };

    try {
      // Получаем товары из 1С
      const products = await this.fetchProducts(config);

      for (const product of products) {
        try {
          // Сохраняем товар в нашей системе
          await (this.prisma as any).product?.upsert?.({
            where: {
              merchantId_externalId: {
                merchantId,
                externalId: product.id,
              },
            },
            create: {
              merchantId,
              externalId: product.id,
              article: product.article,
              name: product.name,
              price: product.price,
              barcode: product.barcode,
              category: product.category,
              unit: product.unit,
              vat: product.vat,
              stock: product.stock,
              source: 'ONEC',
            },
            update: {
              name: product.name,
              price: product.price,
              barcode: product.barcode,
              category: product.category,
              stock: product.stock,
            },
          });
          result.synced++;
        } catch (error) {
          console.error(`Ошибка синхронизации товара ${product.id}:`, error);
          result.errors++;
        }
      }
    } catch (error) {
      throw new BadRequestException(
        `Ошибка получения товаров из 1С: ${error.message}`,
      );
    }

    // Сохраняем статистику синхронизации
    await this.logSync(merchantId, 'PRODUCTS', result);

    return result;
  }

  /**
   * Синхронизация клиентов из 1С
   */
  async syncCustomers(
    merchantId: string,
  ): Promise<{ synced: number; errors: number }> {
    const config = await this.getConfig(merchantId);
    if (!config || !config.syncCustomers) {
      throw new BadRequestException('Синхронизация клиентов не настроена');
    }

    const result = { synced: 0, errors: 0 };

    try {
      // Получаем клиентов из 1С
      const customers = await this.fetchCustomers(config);

      for (const customer of customers) {
        try {
          // Создаем или обновляем клиента
          let loyaltyCustomer = await this.prisma.customer.findFirst({
            where: {
              OR: [{ phone: customer.phone }, { email: customer.email }],
            },
          });

          if (!loyaltyCustomer && (customer.phone || customer.email)) {
            loyaltyCustomer = await this.prisma.customer.create({
              data: {
                phone: customer.phone,
                email: customer.email,
                name: customer.name,
                metadata: {
                  onecId: customer.id,
                  inn: customer.inn,
                  kpp: customer.kpp,
                  type: customer.type,
                },
              },
            });
          }

          if (loyaltyCustomer) {
            // Создаем кошелек если нет
            await this.prisma.wallet.upsert({
              where: {
                customerId_merchantId_type: {
                  customerId: loyaltyCustomer.id,
                  merchantId,
                  type: 'POINTS',
                },
              },
              create: {
                customerId: loyaltyCustomer.id,
                merchantId,
                balance: 0,
                type: 'POINTS',
              },
              update: {},
            });

            result.synced++;
          }
        } catch (error) {
          console.error(`Ошибка синхронизации клиента ${customer.id}:`, error);
          result.errors++;
        }
      }
    } catch (error) {
      throw new BadRequestException(
        `Ошибка получения клиентов из 1С: ${error.message}`,
      );
    }

    await this.logSync(merchantId, 'CUSTOMERS', result);
    return result;
  }

  /**
   * Синхронизация транзакций из 1С
   */
  async syncTransactions(
    merchantId: string,
    fromDate?: Date,
  ): Promise<{ synced: number; errors: number }> {
    const config = await this.getConfig(merchantId);
    if (!config || !config.syncTransactions) {
      throw new BadRequestException('Синхронизация транзакций не настроена');
    }

    const result = { synced: 0, errors: 0 };

    try {
      // Получаем транзакции из 1С
      const transactions = await this.fetchTransactions(config, fromDate);

      for (const transaction of transactions) {
        try {
          // Находим клиента по маппингу
          let customerId: string | undefined;
          // Базовая версия: пропускаем начисление без сопоставления клиента
          if (transaction.customerId) {
            customerId = undefined;
          }

          if (customerId) {
            // Проверяем, не обработана ли уже эта транзакция
            const existing = await this.prisma.transaction.findFirst({
              where: {
                merchantId,
                orderId: transaction.id,
              },
            });

            if (!existing) {
              // Рассчитываем баллы по правилам мерчанта
              const pointsToEarn = Math.floor(transaction.total * 0.05); // 5% кэшбек по умолчанию

              // Начисляем баллы
              await this.loyaltyService.earn({
                customerId,
                merchantId,
                amount: pointsToEarn,
                orderId: transaction.id,
              });

              result.synced++;
            }
          }
        } catch (error) {
          console.error(
            `Ошибка обработки транзакции ${transaction.id}:`,
            error,
          );
          result.errors++;
        }
      }
    } catch (error) {
      throw new BadRequestException(
        `Ошибка получения транзакций из 1С: ${error.message}`,
      );
    }

    await this.logSync(merchantId, 'TRANSACTIONS', result);
    return result;
  }

  /**
   * Обработка webhook от 1С
   */
  async handleWebhook(merchantId: string, event: string, data: any) {
    const config = await this.getConfig(merchantId);
    if (!config) {
      throw new BadRequestException('Интеграция не настроена');
    }

    switch (event) {
      case 'document.sale':
        // Новая продажа
        await this.processSaleDocument(merchantId, data);
        break;

      case 'document.return':
        // Возврат
        await this.processReturnDocument(merchantId, data);
        break;

      case 'customer.create':
      case 'customer.update':
        // Новый или обновленный клиент
        await this.processCustomerUpdate(merchantId, data);
        break;

      case 'product.update':
        // Обновление товара
        await this.processProductUpdate(merchantId, data);
        break;

      default:
        console.log(`Неизвестное событие 1С: ${event}`);
    }

    return { success: true };
  }

  /**
   * Экспорт бонусных баллов в 1С
   */
  async exportLoyaltyData(merchantId: string) {
    const config = await this.getConfig(merchantId);
    if (!config) {
      throw new BadRequestException('Интеграция не настроена');
    }

    // Получаем все кошельки с балансом
    const wallets = await this.prisma.wallet.findMany({
      where: {
        merchantId,
        balance: { gt: 0 },
      },
      include: {
        customer: true,
      },
    });

    const exportData: any[] = [];

    for (const wallet of wallets) {
      exportData.push({
        customerId: wallet.customerId,
        balance: wallet.balance,
        customerName: wallet.customer.name,
        phone: wallet.customer.phone,
      });
    }

    // Отправляем данные в 1С
    try {
      const response = await this.makeRequest(
        config,
        'POST',
        '/loyalty/import',
        exportData,
      );
      return {
        success: true,
        exported: exportData.length,
        response: response.data,
      };
    } catch (error) {
      throw new BadRequestException(`Ошибка экспорта в 1С: ${error.message}`);
    }
  }

  // Вспомогательные методы

  async testConnection(config: OneCConfig): Promise<boolean> {
    try {
      const response = await this.makeRequest(config, 'GET', '/test');
      return response.status === 200;
    } catch (error) {
      console.error('Ошибка подключения к 1С:', error);
      return false;
    }
  }

  private async makeRequest(
    config: OneCConfig,
    method: string,
    path: string,
    data?: any,
  ) {
    const auth = Buffer.from(`${config.username}:${config.password}`).toString(
      'base64',
    );

    return axios({
      method,
      url: `${config.baseUrl}${path}`,
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/json',
      },
      data,
      timeout: 30000,
    });
  }

  private async fetchProducts(config: OneCConfig): Promise<OneCProduct[]> {
    const response = await this.makeRequest(config, 'GET', '/products');
    return response.data.products || [];
  }

  private async fetchCustomers(config: OneCConfig): Promise<OneCCustomer[]> {
    const response = await this.makeRequest(config, 'GET', '/customers');
    return response.data.customers || [];
  }

  private async fetchTransactions(
    config: OneCConfig,
    fromDate?: Date,
  ): Promise<OneCTransaction[]> {
    const params = fromDate ? `?from=${fromDate.toISOString()}` : '';
    const response = await this.makeRequest(
      config,
      'GET',
      `/documents/sales${params}`,
    );
    return response.data.documents || [];
  }

  private async registerWebhook(config: OneCConfig) {
    try {
      await this.makeRequest(config, 'POST', '/webhooks/register', {
        url: config.webhookUrl,
        events: [
          'document.sale',
          'document.return',
          'customer.create',
          'customer.update',
          'product.update',
        ],
      });
    } catch (error) {
      console.error('Ошибка регистрации webhook:', error);
    }
  }

  private async getConfig(merchantId: string): Promise<OneCConfig | null> {
    // Проверяем кэш
    if (this.configs.has(merchantId)) {
      return this.configs.get(merchantId)!;
    }

    // Загружаем из БД
    const integration = await this.prisma.integration.findFirst({
      where: {
        merchantId,
        type: 'ONEC',
        isActive: true,
      },
    });

    if (!integration) {
      return null;
    }

    const credentials = this.decryptCredentials(
      integration.credentials as string,
    );
    const config: OneCConfig = {
      merchantId,
      baseUrl: (integration.config as any).baseUrl,
      username: credentials.username,
      password: credentials.password,
      database: (integration.config as any).database,
      syncProducts: (integration.config as any).syncProducts,
      syncCustomers: (integration.config as any).syncCustomers,
      syncTransactions: (integration.config as any).syncTransactions,
      syncInventory: (integration.config as any).syncInventory,
    };

    this.configs.set(merchantId, config);
    return config;
  }

  private encryptCredentials(creds: {
    username: string;
    password: string;
  }): string {
    const secret = process.env.ENCRYPTION_SECRET || 'default-secret';
    const key = crypto.createHash('sha256').update(secret).digest();
    const iv = Buffer.alloc(16, 0);
    const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
    let encrypted = cipher.update(JSON.stringify(creds), 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return encrypted;
  }

  private decryptCredentials(encrypted: string): {
    username: string;
    password: string;
  } {
    const secret = process.env.ENCRYPTION_SECRET || 'default-secret';
    const key = crypto.createHash('sha256').update(secret).digest();
    const iv = Buffer.alloc(16, 0);
    const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return JSON.parse(decrypted);
  }

  private async logSync(
    merchantId: string,
    type: string,
    result: { synced: number; errors: number },
  ) {
    const logModel = (this.prisma as any).syncLog;
    if (logModel && logModel.create) {
      await logModel.create({
        data: {
          merchantId,
          integration: 'ONEC',
          type,
          status: result.errors > 0 ? 'PARTIAL' : 'SUCCESS',
          recordsProcessed: result.synced + result.errors,
          recordsSuccess: result.synced,
          recordsFailed: result.errors,
        },
      });
    }
  }

  private async processSaleDocument(merchantId: string, data: any) {
    // Обработка документа продажи из webhook
    const transaction: OneCTransaction = data;
    await this.syncTransactions(merchantId);
  }

  private async processReturnDocument(merchantId: string, data: any) {
    // Обработка возврата
    const returnDoc = data;

    if (returnDoc.customerId) {
      // В базовой версии не выполняем сопоставление клиента
      // Можно реализовать сопоставление через внешнюю таблицу.
    }
  }

  private async processCustomerUpdate(merchantId: string, data: any) {
    // Обновление данных клиента
    await this.syncCustomers(merchantId);
  }

  private async processProductUpdate(merchantId: string, data: any) {
    // Обновление товара
    const product: OneCProduct = data;

    await (this.prisma as any).product?.upsert?.({
      where: {
        merchantId_externalId: {
          merchantId,
          externalId: product.id,
        },
      },
      create: {
        merchantId,
        externalId: product.id,
        article: product.article,
        name: product.name,
        price: product.price,
        barcode: product.barcode,
        category: product.category,
        stock: product.stock,
        source: 'ONEC',
      },
      update: {
        name: product.name,
        price: product.price,
        stock: product.stock,
      },
    });
  }

  // Публичный статус интеграции для контроллера
  async getIntegrationStatus(merchantId: string) {
    const integration = await this.prisma.integration.findFirst({
      where: { merchantId, type: 'ONEC' },
    });
    if (!integration) {
      return { status: 'NOT_CONFIGURED', message: 'Интеграция не настроена' };
    }
    return {
      status: integration.isActive ? 'ACTIVE' : 'INACTIVE',
      config: integration.config,
      lastSync: integration.lastSync,
      errorCount: integration.errorCount,
      lastError: integration.lastError,
    };
  }
}
