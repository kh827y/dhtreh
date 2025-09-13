import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  Query,
  UseGuards,
  Headers,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { OneCService } from './onec.service';
import type { OneCConfig } from './onec.service';
import { ApiKeyGuard } from '../../guards/api-key.guard';

@ApiTags('1C Integration')
@Controller('integrations/1c')
@UseGuards(ApiKeyGuard)
@ApiBearerAuth()
export class OneCController {
  constructor(private readonly onecService: OneCService) {}

  /**
   * Настроить подключение к 1С
   */
  @Post('configure')
  @ApiOperation({ summary: 'Настроить интеграцию с 1С:Предприятие' })
  @ApiResponse({ status: 200, description: 'Интеграция настроена' })
  async configure(@Body() config: OneCConfig) {
    return this.onecService.configureConnection(config);
  }

  /**
   * Синхронизировать товары
   */
  @Post('sync/products/:merchantId')
  @ApiOperation({ summary: 'Синхронизировать товары из 1С' })
  async syncProducts(@Param('merchantId') merchantId: string) {
    return this.onecService.syncProducts(merchantId);
  }

  /**
   * Синхронизировать клиентов
   */
  @Post('sync/customers/:merchantId')
  @ApiOperation({ summary: 'Синхронизировать клиентов из 1С' })
  async syncCustomers(@Param('merchantId') merchantId: string) {
    return this.onecService.syncCustomers(merchantId);
  }

  /**
   * Синхронизировать транзакции
   */
  @Post('sync/transactions/:merchantId')
  @ApiOperation({ summary: 'Синхронизировать транзакции из 1С' })
  async syncTransactions(
    @Param('merchantId') merchantId: string,
    @Query('fromDate') fromDate?: string,
  ) {
    const date = fromDate ? new Date(fromDate) : undefined;
    return this.onecService.syncTransactions(merchantId, date);
  }

  /**
   * Полная синхронизация
   */
  @Post('sync/all/:merchantId')
  @ApiOperation({ summary: 'Выполнить полную синхронизацию с 1С' })
  async syncAll(@Param('merchantId') merchantId: string) {
    const results = {
      products: { synced: 0, errors: 0 },
      customers: { synced: 0, errors: 0 },
      transactions: { synced: 0, errors: 0 },
    };

    try {
      results.products = await this.onecService.syncProducts(merchantId);
    } catch (error) {
      results.products.errors = -1;
    }

    try {
      results.customers = await this.onecService.syncCustomers(merchantId);
    } catch (error) {
      results.customers.errors = -1;
    }

    try {
      results.transactions = await this.onecService.syncTransactions(merchantId);
    } catch (error) {
      results.transactions.errors = -1;
    }

    return results;
  }

  /**
   * Экспортировать данные лояльности в 1С
   */
  @Post('export/:merchantId')
  @ApiOperation({ summary: 'Экспортировать данные о баллах в 1С' })
  async exportLoyaltyData(@Param('merchantId') merchantId: string) {
    return this.onecService.exportLoyaltyData(merchantId);
  }

  /**
   * Webhook от 1С
   */
  @Post('webhook/:merchantId')
  @ApiOperation({ summary: 'Обработка webhook от 1С' })
  async handleWebhook(
    @Param('merchantId') merchantId: string,
    @Headers('x-1c-event') event: string,
    @Headers('x-1c-signature') signature: string,
    @Body() data: any,
  ) {
    // TODO: Проверить подпись для безопасности
    return this.onecService.handleWebhook(merchantId, event, data);
  }

  /**
   * Получить статус интеграции
   */
  @Get('status/:merchantId')
  @ApiOperation({ summary: 'Получить статус интеграции с 1С' })
  async getIntegrationStatus(@Param('merchantId') merchantId: string) {
    return this.onecService.getIntegrationStatus(merchantId);
  }

  /**
   * Тестовое подключение
   */
  @Post('test')
  @ApiOperation({ summary: 'Проверить подключение к 1С' })
  async testConnection(@Body() config: Partial<OneCConfig>) {
    try {
      const result = await this.onecService.testConnection(config as OneCConfig);
      return {
        success: result,
        message: result ? 'Подключение успешно' : 'Не удалось подключиться',
      };
    } catch (error) {
      return {
        success: false,
        message: error.message,
      };
    }
  }

  /**
   * Получить шаблоны настроек
   */
  @Get('templates')
  @ApiOperation({ summary: 'Получить шаблоны конфигурации для популярных версий 1С' })
  async getConfigTemplates() {
    return [
      {
        id: 'retail_11',
        name: '1С:Розница 11',
        description: 'Конфигурация для 1С:Розница версии 11',
        config: {
          baseUrl: 'http://localhost/retail/hs/loyalty',
          database: 'retail',
          syncProducts: true,
          syncCustomers: true,
          syncTransactions: true,
          syncInventory: true,
        },
      },
      {
        id: 'ut_11',
        name: '1С:Управление торговлей 11',
        description: 'Конфигурация для 1С:Управление торговлей версии 11',
        config: {
          baseUrl: 'http://localhost/ut/hs/loyalty',
          database: 'trade',
          syncProducts: true,
          syncCustomers: true,
          syncTransactions: true,
          syncInventory: false,
        },
      },
      {
        id: 'erp_2',
        name: '1С:ERP 2',
        description: 'Конфигурация для 1С:ERP версии 2',
        config: {
          baseUrl: 'http://localhost/erp/hs/loyalty',
          database: 'erp',
          syncProducts: true,
          syncCustomers: true,
          syncTransactions: true,
          syncInventory: true,
        },
      },
      {
        id: 'accounting_3',
        name: '1С:Бухгалтерия 3',
        description: 'Конфигурация для 1С:Бухгалтерия версии 3',
        config: {
          baseUrl: 'http://localhost/accounting/hs/loyalty',
          database: 'accounting',
          syncProducts: false,
          syncCustomers: true,
          syncTransactions: true,
          syncInventory: false,
        },
      },
    ];
  }

  // Prisma mock removed; using OneCService methods instead
}
