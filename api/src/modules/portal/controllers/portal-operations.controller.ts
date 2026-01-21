import {
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
import {
  LedgerEntryDto,
  ReceiptDto,
} from '../../merchants/dto';
import { TransactionItemDto } from '../../loyalty/dto/dto';
import type { PortalRequest } from './portal.controller-helpers';
import { PortalOperationsUseCase } from '../use-cases/portal-operations.use-case';

@ApiTags('portal')
@ApiExtraModels(TransactionItemDto)
@Controller('portal')
@UseGuards(PortalGuard)
export class PortalOperationsController {
  constructor(private readonly useCase: PortalOperationsUseCase) {}

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
    return this.useCase.getOperationsLog(
      req,
      from,
      to,
      staffId,
      staffStatus,
      outletId,
      deviceId,
      direction,
      receiptNumber,
      operationType,
      carrier,
      limitStr,
      offsetStr,
      before,
    );
  }

  @Get('operations/log/:receiptId')
  @ApiOkResponse({ schema: { type: 'object', additionalProperties: true } })
  getOperationDetails(
    @Req() req: PortalRequest,
    @Param('receiptId') receiptId: string,
  ) {
    return this.useCase.getOperationDetails(req, receiptId);
  }

  @Post('operations/log/:receiptId/cancel')
  @ApiOkResponse({ schema: { type: 'object', additionalProperties: true } })
  cancelOperation(
    @Req() req: PortalRequest,
    @Param('receiptId') receiptId: string,
  ) {
    return this.useCase.cancelOperation(req, receiptId);
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
    return this.useCase.listTransactions(
      req,
      limitStr,
      beforeStr,
      fromStr,
      toStr,
      type,
      customerId,
      outletId,
      staffId,
    );
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
    return this.useCase.listReceipts(
      req,
      limitStr,
      beforeStr,
      orderId,
      customerId,
    );
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
    return this.useCase.listLedger(
      req,
      limitStr,
      beforeStr,
      fromStr,
      toStr,
      customerId,
      type,
    );
  }
}
