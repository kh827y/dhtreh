import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  Query,
  UseGuards,
  UploadedFile,
  UseInterceptors,
  Res,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiConsumes,
  ApiBody,
} from '@nestjs/swagger';
import {
  ImportExportService,
  ImportCustomersDto,
  ExportCustomersDto,
} from './import-export.service';
import { ApiKeyGuard } from '../guards/api-key.guard';

@ApiTags('Import/Export')
@Controller('import-export')
@UseGuards(ApiKeyGuard)
@ApiBearerAuth()
export class ImportExportController {
  constructor(private readonly importExportService: ImportExportService) {}

  /**
   * Импорт клиентов
   */
  @Post('import/customers')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 20 * 1024 * 1024 } }))
  @ApiOperation({ summary: 'Импортировать клиентов из CSV/Excel файла' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          format: 'binary',
        },
        merchantId: {
          type: 'string',
        },
        format: {
          type: 'string',
          enum: ['csv', 'excel'],
        },
        updateExisting: {
          type: 'boolean',
        },
      },
    },
  })
  async importCustomers(
    @UploadedFile() file: any,
    @Body('merchantId') merchantId: string,
    @Body('format') format: 'csv' | 'excel',
    @Body('updateExisting') updateExisting?: string,
  ) {
    if (!file) {
      throw new BadRequestException('Файл не загружен');
    }

    const normalizedFormat = String(format || '').toLowerCase();
    if (normalizedFormat !== 'csv' && normalizedFormat !== 'excel') {
      throw new BadRequestException('Неверный формат файла');
    }

    const dto: ImportCustomersDto = {
      merchantId,
      format: normalizedFormat as 'csv' | 'excel',
      data: file.buffer,
      updateExisting: updateExisting === 'true',
    };

    return this.importExportService.importCustomers(dto);
  }

  /**
   * Экспорт клиентов
   */
  @Get('export/customers')
  @ApiOperation({ summary: 'Экспортировать клиентов в CSV/Excel файл' })
  async exportCustomers(
    @Query('merchantId') merchantId: string,
    @Query('format') format: 'csv' | 'excel' = 'excel',
    @Query('fields') fields?: string,
    @Query('minBalance') minBalance?: string,
    @Query('maxBalance') maxBalance?: string,
    @Query('hasTransactions') hasTransactions?: string,
    @Query('createdFrom') createdFrom?: string,
    @Query('createdTo') createdTo?: string,
    @Query('batch') batchStr: string = '1000',
    @Res() res?: Response,
  ) {
    const dto: ExportCustomersDto = {
      merchantId,
      format,
      fields: fields ? fields.split(',') : undefined,
      filters: {
        minBalance: minBalance ? parseInt(minBalance) : undefined,
        maxBalance: maxBalance ? parseInt(maxBalance) : undefined,
        hasTransactions: hasTransactions
          ? hasTransactions === 'true'
          : undefined,
        createdFrom: createdFrom ? new Date(createdFrom) : undefined,
        createdTo: createdTo ? new Date(createdTo) : undefined,
      },
    };

    const filename = `customers_${merchantId}_${Date.now()}.${format === 'csv' ? 'csv' : 'xlsx'}`;

    if (format === 'csv') {
      const batch = Math.min(
        Math.max(parseInt(batchStr, 10) || 1000, 100),
        5000,
      );
      res!.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res!.setHeader(
        'Content-Disposition',
        `attachment; filename="${filename}"`,
      );
      await this.importExportService.streamCustomersCsv(dto, res!, batch);
      return res!.end();
    }

    const buffer = await this.importExportService.exportCustomers(dto);
    res!.set({
      'Content-Type':
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Length': buffer.length.toString(),
    });
    return res!.send(buffer);
  }

  /**
   * Экспорт транзакций в CSV (стрим)
   */
  @Get('export/transactions')
  @ApiOperation({ summary: 'Экспортировать транзакции в CSV (стрим)' })
  async exportTransactions(
    @Query('merchantId') merchantId: string,
    @Query('from') fromStr?: string,
    @Query('to') toStr?: string,
    @Query('type') type?: string,
    @Query('customerId') customerId?: string,
    @Query('outletId') outletId?: string,
    @Query('staffId') staffId?: string,
    @Query('batch') batchStr: string = '1000',
    @Res() res?: Response,
  ) {
    const batch = Math.min(Math.max(parseInt(batchStr, 10) || 1000, 100), 5000);
    const from = fromStr ? new Date(fromStr) : undefined;
    const to = toStr ? new Date(toStr) : undefined;
    const filename = `transactions_${merchantId}_${Date.now()}.csv`;
    res!.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res!.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    await this.importExportService.streamTransactionsCsv(
      { merchantId, from, to, type, customerId, outletId, staffId },
      res!,
      batch,
    );
    res!.end();
  }

  /**
   * Импорт транзакций
   */
  @Post('import/transactions')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 20 * 1024 * 1024 } }))
  @ApiOperation({ summary: 'Импортировать транзакции из CSV/Excel файла' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          format: 'binary',
        },
        merchantId: {
          type: 'string',
        },
        format: {
          type: 'string',
          enum: ['csv', 'excel'],
        },
      },
    },
  })
  async importTransactions(
    @UploadedFile() file: any,
    @Body('merchantId') merchantId: string,
    @Body('format') format: 'csv' | 'excel',
  ) {
    if (!file) {
      throw new BadRequestException('Файл не загружен');
    }

    const normalizedFormat = String(format || '').toLowerCase();
    if (normalizedFormat !== 'csv' && normalizedFormat !== 'excel') {
      throw new BadRequestException('Неверный формат файла');
    }

    return this.importExportService.importTransactions(
      merchantId,
      normalizedFormat as 'csv' | 'excel',
      file.buffer,
    );
  }

  /**
   * Скачать шаблон для импорта
   */
  @Get('template')
  @ApiOperation({ summary: 'Скачать шаблон для импорта' })
  async getImportTemplate(
    @Query('type') type: 'customers' | 'transactions',
    @Query('format') format: 'csv' | 'excel' = 'excel',
    @Res() res?: Response,
  ) {
    const normalizedType = String(type || '').toLowerCase();
    if (normalizedType !== 'customers' && normalizedType !== 'transactions') {
      throw new BadRequestException('Неверный тип шаблона');
    }
    const normalizedFormat = String(format || '').toLowerCase();
    if (normalizedFormat !== 'csv' && normalizedFormat !== 'excel') {
      throw new BadRequestException('Неверный формат файла');
    }

    const buffer = await this.importExportService.getImportTemplate(
      normalizedType as 'customers' | 'transactions',
      normalizedFormat as 'csv' | 'excel',
    );

    const filename = `template_${normalizedType}.${normalizedFormat === 'csv' ? 'csv' : 'xlsx'}`;
    const contentType =
      normalizedFormat === 'csv'
        ? 'text/csv; charset=utf-8'
        : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

    res!.set({
      'Content-Type': contentType,
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Length': buffer.length.toString(),
    });

    res!.send(buffer);
  }

  /**
   * Массовое обновление клиентов
   */
  @Post('bulk-update/customers')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 20 * 1024 * 1024 } }))
  @ApiOperation({ summary: 'Массовое обновление данных клиентов' })
  @ApiConsumes('multipart/form-data')
  async bulkUpdateCustomers(
    @UploadedFile() file: any,
    @Body('merchantId') merchantId: string,
    @Body('format') format: 'csv' | 'excel',
    @Body('operation')
    operation: 'add_points' | 'set_balance' | 'add_tags' | 'update_fields',
    @Body('value') value?: string,
  ) {
    if (!file) {
      throw new BadRequestException('Файл не загружен');
    }

    const normalizedFormat = String(format || '').toLowerCase();
    if (normalizedFormat !== 'csv' && normalizedFormat !== 'excel') {
      throw new BadRequestException('Неверный формат файла');
    }
    const normalizedOperation = String(operation || '').toLowerCase();
    const allowedOperations = [
      'add_points',
      'set_balance',
      'add_tags',
      'update_fields',
    ];
    if (!allowedOperations.includes(normalizedOperation)) {
      throw new BadRequestException('Неверная операция');
    }

    return this.importExportService.bulkUpdateCustomers({
      merchantId,
      format: normalizedFormat as 'csv' | 'excel',
      data: file.buffer,
      operation: normalizedOperation as
        | 'add_points'
        | 'set_balance'
        | 'add_tags'
        | 'update_fields',
      value,
    });
  }

  /**
   * Статистика импорта/экспорта
   */
  @Get('stats/:merchantId')
  @ApiOperation({ summary: 'Получить статистику импорта/экспорта' })
  async getImportExportStats(@Param('merchantId') merchantId: string) {
    if (!merchantId) {
      throw new BadRequestException('merchantId required');
    }
    return this.importExportService.getImportExportStats(merchantId);
  }
}
