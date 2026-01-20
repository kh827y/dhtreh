import {
  BadRequestException,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiExtraModels,
  ApiOkResponse,
  ApiTags,
  getSchemaPath,
} from '@nestjs/swagger';
import { PortalGuard } from '../../portal-auth/portal.guard';
import { OperationsLogService, type OperationsLogFilters } from '../services/operations-log.service';
import { MerchantsService } from '../../merchants/merchants.service';
import {
  LedgerEntryDto,
  ReceiptDto,
} from '../../merchants/dto';
import { TransactionItemDto } from '../../loyalty/dto/dto';
import { PortalControllerHelpers } from './portal.controller-helpers';
import type { PortalRequest } from './portal.controller-helpers';

@ApiTags('portal')
@ApiExtraModels(TransactionItemDto)
@Controller('portal')
@UseGuards(PortalGuard)
export class PortalOperationsController {
  constructor(
    private readonly operations: OperationsLogService,
    private readonly merchants: MerchantsService,
    private readonly helpers: PortalControllerHelpers,
  ) {}

  // ===== Operations journal =====
  @Get('operations/log')
  @ApiOkResponse({
    schema: {
      type: 'object',
      properties: {
        total: { type: 'number' },
        items: {
          type: 'array',
          items: { type: 'object', additionalProperties: true },
        },
      },
    },
  })
  getOperationsLog(
    @Req() req: PortalRequest,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('staffId') staffId?: string,
    @Query('staffStatus') staffStatus?: string,
    @Query('outletId') outletId?: string,
    @Query('deviceId') deviceId?: string,
    @Query('direction') direction?: string,
    @Query('receiptNumber') receiptNumber?: string,
    @Query('operationType') operationType?: string,
    @Query('carrier') carrier?: string,
    @Query('limit') limitStr?: string,
    @Query('offset') offsetStr?: string,
    @Query('before') before?: string,
  ) {
    const offset = this.helpers.getTimezoneOffsetMinutes(req);
    const fromDate = from
      ? this.helpers.parseLocalDate(from, offset, false)
      : undefined;
    const toDate = to ? this.helpers.parseLocalDate(to, offset, true) : undefined;
    const beforeDate = before ? new Date(before) : undefined;
    if (before && Number.isNaN(beforeDate?.getTime() ?? NaN)) {
      throw new BadRequestException('before is invalid');
    }
    const filters: OperationsLogFilters = {
      from: fromDate || undefined,
      to: toDate || undefined,
      before: beforeDate || undefined,
      staffId: staffId || undefined,
      staffStatus: this.helpers.normalizeStaffStatus(staffStatus),
      outletId: outletId || undefined,
      deviceId: deviceId || undefined,
      direction: this.helpers.normalizeDirection(direction),
      receiptNumber: receiptNumber || undefined,
      operationType: operationType || undefined,
      carrier: carrier || undefined,
      limit: limitStr ? parseInt(limitStr, 10) : undefined,
      offset: offsetStr ? parseInt(offsetStr, 10) : undefined,
    };
    return this.operations.list(this.helpers.getMerchantId(req), filters);
  }

  @Get('operations/log/:receiptId')
  @ApiOkResponse({ schema: { type: 'object', additionalProperties: true } })
  getOperationDetails(
    @Req() req: PortalRequest,
    @Param('receiptId') receiptId: string,
  ) {
    return this.operations.getDetails(this.helpers.getMerchantId(req), receiptId);
  }

  @Post('operations/log/:receiptId/cancel')
  @ApiOkResponse({ schema: { type: 'object', additionalProperties: true } })
  cancelOperation(
    @Req() req: PortalRequest,
    @Param('receiptId') receiptId: string,
  ) {
    const merchantId = this.helpers.getMerchantId(req);
    const staffId: string | null = req.portalStaffId ?? null;
    return this.operations.cancelOperation(merchantId, receiptId, staffId);
  }

  // Transactions & Receipts (read-only)
  @Get('transactions')
  @ApiOkResponse({
    schema: {
      type: 'array',
      items: { $ref: getSchemaPath(TransactionItemDto) },
    },
  })
  listTransactions(
    @Req() req: PortalRequest,
    @Query('limit') limitStr?: string,
    @Query('before') beforeStr?: string,
    @Query('from') fromStr?: string,
    @Query('to') toStr?: string,
    @Query('type') type?: string,
    @Query('customerId') customerId?: string,
    @Query('outletId') outletId?: string,
    @Query('staffId') staffId?: string,
  ) {
    const id = this.helpers.getMerchantId(req);
    const limit = limitStr
      ? Math.min(Math.max(parseInt(limitStr, 10) || 50, 1), 200)
      : 50;
    const before = this.helpers.parseDateParam(req, beforeStr, true);
    const from = this.helpers.parseDateParam(req, fromStr, false);
    const to = this.helpers.parseDateParam(req, toStr, true);
    return this.merchants.listTransactions(id, {
      limit,
      before,
      from,
      to,
      type,
      customerId,
      outletId,
      staffId,
    });
  }

  @Get('receipts')
  @ApiOkResponse({ type: ReceiptDto, isArray: true })
  listReceipts(
    @Req() req: PortalRequest,
    @Query('limit') limitStr?: string,
    @Query('before') beforeStr?: string,
    @Query('orderId') orderId?: string,
    @Query('customerId') customerId?: string,
  ) {
    const id = this.helpers.getMerchantId(req);
    const limit = limitStr
      ? Math.min(Math.max(parseInt(limitStr, 10) || 50, 1), 200)
      : 50;
    const before = this.helpers.parseDateParam(req, beforeStr, true);
    return this.merchants.listReceipts(id, {
      limit,
      before,
      orderId,
      customerId,
    });
  }

  @Get('ledger')
  @ApiOkResponse({ type: LedgerEntryDto, isArray: true })
  listLedger(
    @Req() req: PortalRequest,
    @Query('limit') limitStr?: string,
    @Query('before') beforeStr?: string,
    @Query('from') fromStr?: string,
    @Query('to') toStr?: string,
    @Query('customerId') customerId?: string,
    @Query('type') type?: string,
  ) {
    const id = this.helpers.getMerchantId(req);
    const limit = limitStr
      ? Math.min(Math.max(parseInt(limitStr, 10) || 50, 1), 500)
      : 50;
    const before = this.helpers.parseDateParam(req, beforeStr, true);
    const from = this.helpers.parseDateParam(req, fromStr, false);
    const to = this.helpers.parseDateParam(req, toStr, true);
    return this.merchants.listLedger(id, {
      limit,
      before,
      customerId,
      from,
      to,
      type,
    });
  }
}
