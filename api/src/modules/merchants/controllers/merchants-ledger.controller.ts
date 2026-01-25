import {
  Controller,
  Get,
  Param,
  Query,
  Res,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import type { Response } from 'express';
import {
  ApiExtraModels,
  ApiHeader,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiTags,
  ApiUnauthorizedResponse,
  getSchemaPath,
} from '@nestjs/swagger';
import { AdminGuard } from '../../../core/guards/admin.guard';
import { AdminIpGuard } from '../../../core/guards/admin-ip.guard';
import { AdminAuditInterceptor } from '../../admin/admin-audit.interceptor';
import { ErrorDto, TransactionItemDto } from '../../loyalty/dto/dto';
import {
  CustomerSearchRespDto,
  LedgerEntryDto,
  ReceiptDto,
} from '../dto';
import { MerchantsLedgerUseCase } from '../use-cases/merchants-ledger.use-case';

@Controller('merchants')
@UseGuards(AdminGuard, AdminIpGuard)
@UseInterceptors(AdminAuditInterceptor)
@ApiTags('merchants')
@ApiHeader({
  name: 'X-Admin-Key',
  required: true,
  description: 'Админ-ключ (в проде проксируется сервером админки)',
})
@ApiExtraModels(TransactionItemDto)
export class MerchantsLedgerController {
  constructor(private readonly useCase: MerchantsLedgerUseCase) {}

  // Transactions overview
  @Get(':id/transactions')
  @ApiOkResponse({
    schema: {
      type: 'array',
      items: { $ref: getSchemaPath(TransactionItemDto) },
    },
  })
  @ApiUnauthorizedResponse({ type: ErrorDto })
  listTransactions(
    @Param('id') id: string,
    @Query('limit') limitStr?: string,
    @Query('before') beforeStr?: string,
    @Query('from') fromStr?: string,
    @Query('to') toStr?: string,
    @Query('type') type?: string,
    @Query('customerId') customerId?: string,
    @Query('outletId') outletId?: string,
    @Query('staffId') staffId?: string,
  ) {
    return this.useCase.listTransactions(id, {
      limitStr,
      beforeStr,
      fromStr,
      toStr,
      type,
      customerId,
      outletId,
      staffId,
    });
  }

  @Get(':id/receipts')
  @ApiOkResponse({ type: ReceiptDto, isArray: true })
  @ApiUnauthorizedResponse({ type: ErrorDto })
  listReceipts(
    @Param('id') id: string,
    @Query('limit') limitStr?: string,
    @Query('before') beforeStr?: string,
    @Query('from') fromStr?: string,
    @Query('to') toStr?: string,
    @Query('orderId') orderId?: string,
    @Query('customerId') customerId?: string,
  ) {
    return this.useCase.listReceipts(id, {
      limitStr,
      beforeStr,
      fromStr,
      toStr,
      orderId,
      customerId,
    });
  }

  @Get(':id/receipts/:receiptId')
  @ApiOkResponse({
    schema: {
      type: 'object',
      properties: {
        receipt: { $ref: getSchemaPath(ReceiptDto) },
        transactions: {
          type: 'array',
          items: { $ref: getSchemaPath(TransactionItemDto) },
        },
      },
    },
  })
  @ApiUnauthorizedResponse({ type: ErrorDto })
  @ApiNotFoundResponse({ type: ErrorDto })
  getReceipt(@Param('id') id: string, @Param('receiptId') receiptId: string) {
    return this.useCase.getReceipt(id, receiptId);
  }

  @Get(':id/receipts.csv')
  @ApiOkResponse({ schema: { type: 'string', description: 'CSV (streamed)' } })
  @ApiUnauthorizedResponse({ type: ErrorDto })
  exportReceiptsCsv(
    @Param('id') id: string,
    @Res() res: Response,
    @Query('batch') batchStr: string = '1000',
    @Query('before') beforeStr?: string,
    @Query('orderId') orderId?: string,
    @Query('customerId') customerId?: string,
  ) {
    return this.useCase.exportReceiptsCsv(id, res, {
      batchStr,
      beforeStr,
      orderId,
      customerId,
    });
  }

  // Ledger
  @Get(':id/ledger')
  @ApiOkResponse({ type: LedgerEntryDto, isArray: true })
  @ApiUnauthorizedResponse({ type: ErrorDto })
  listLedger(
    @Param('id') id: string,
    @Query('limit') limitStr?: string,
    @Query('before') beforeStr?: string,
    @Query('from') fromStr?: string,
    @Query('to') toStr?: string,
    @Query('customerId') customerId?: string,
    @Query('type') type?: string,
  ) {
    return this.useCase.listLedger(id, {
      limitStr,
      beforeStr,
      fromStr,
      toStr,
      customerId,
      type,
    });
  }

  @Get(':id/ledger.csv')
  @ApiOkResponse({ schema: { type: 'string', description: 'CSV (streamed)' } })
  @ApiUnauthorizedResponse({ type: ErrorDto })
  exportLedgerCsv(
    @Param('id') id: string,
    @Res() res: Response,
    @Query('batch') batchStr: string = '1000',
    @Query('before') beforeStr?: string,
    @Query('from') fromStr?: string,
    @Query('to') toStr?: string,
    @Query('customerId') customerId?: string,
    @Query('type') type?: string,
  ) {
    return this.useCase.exportLedgerCsv(id, res, {
      batchStr,
      beforeStr,
      fromStr,
      toStr,
      customerId,
      type,
    });
  }

  // TTL reconciliation (preview vs burned)
  @Get(':id/ttl/reconciliation')
  @ApiOkResponse({
    schema: {
      type: 'object',
      properties: {
        merchantId: { type: 'string' },
        cutoff: { type: 'string' },
        items: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              customerId: { type: 'string' },
              expiredRemain: { type: 'number' },
              burned: { type: 'number' },
              diff: { type: 'number' },
            },
          },
        },
        totals: {
          type: 'object',
          properties: {
            expiredRemain: { type: 'number' },
            burned: { type: 'number' },
            diff: { type: 'number' },
          },
        },
      },
    },
  })
  ttlReconciliation(@Param('id') id: string, @Query('cutoff') cutoff: string) {
    return this.useCase.ttlReconciliation(id, cutoff);
  }

  @Get(':id/ttl/reconciliation.csv')
  @ApiOkResponse({ schema: { type: 'string', description: 'CSV' } })
  exportTtlReconciliationCsv(
    @Param('id') id: string,
    @Query('cutoff') cutoff: string,
    @Query('onlyDiff') onlyDiff?: string,
  ) {
    return this.useCase.exportTtlReconciliationCsv(id, cutoff, onlyDiff);
  }

  // CRM helpers
  @Get(':id/customer/search')
  @ApiOkResponse({
    schema: {
      oneOf: [{ $ref: getSchemaPath(CustomerSearchRespDto) }, { type: 'null' }],
    },
  })
  @ApiUnauthorizedResponse({ type: ErrorDto })
  customerSearch(@Param('id') id: string, @Query('phone') phone: string) {
    return this.useCase.customerSearch(id, phone);
  }

  // CSV exports
  @Get(':id/transactions.csv')
  @ApiOkResponse({ schema: { type: 'string', description: 'CSV (streamed)' } })
  exportTxCsv(
    @Param('id') id: string,
    @Res() res: Response,
    @Query('batch') batchStr: string = '1000',
    @Query('before') beforeStr?: string,
    @Query('from') fromStr?: string,
    @Query('to') toStr?: string,
    @Query('type') type?: string,
    @Query('customerId') customerId?: string,
    @Query('outletId') outletId?: string,
    @Query('staffId') staffId?: string,
  ) {
    return this.useCase.exportTxCsv(id, res, {
      batchStr,
      beforeStr,
      fromStr,
      toStr,
      type,
      customerId,
      outletId,
      staffId,
    });
  }
}
