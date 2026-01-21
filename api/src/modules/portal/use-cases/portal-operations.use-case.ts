import { BadRequestException, Injectable } from '@nestjs/common';
import {
  OperationsLogService,
  type OperationsLogFilters,
} from '../services/operations-log.service';
import { MerchantsService } from '../../merchants/merchants.service';
import {
  PortalControllerHelpers,
  type PortalRequest,
} from '../controllers/portal.controller-helpers';

@Injectable()
export class PortalOperationsUseCase {
  constructor(
    private readonly operations: OperationsLogService,
    private readonly merchants: MerchantsService,
    private readonly helpers: PortalControllerHelpers,
  ) {}

  getOperationsLog(
    req: PortalRequest,
    from?: string,
    to?: string,
    staffId?: string,
    staffStatus?: string,
    outletId?: string,
    deviceId?: string,
    direction?: string,
    receiptNumber?: string,
    operationType?: string,
    carrier?: string,
    limitStr?: string,
    offsetStr?: string,
    before?: string,
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

  getOperationDetails(req: PortalRequest, receiptId: string) {
    return this.operations.getDetails(this.helpers.getMerchantId(req), receiptId);
  }

  cancelOperation(req: PortalRequest, receiptId: string) {
    const merchantId = this.helpers.getMerchantId(req);
    const staffId: string | null = req.portalStaffId ?? null;
    return this.operations.cancelOperation(merchantId, receiptId, staffId);
  }

  listTransactions(
    req: PortalRequest,
    limitStr?: string,
    beforeStr?: string,
    fromStr?: string,
    toStr?: string,
    type?: string,
    customerId?: string,
    outletId?: string,
    staffId?: string,
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

  listReceipts(
    req: PortalRequest,
    limitStr?: string,
    beforeStr?: string,
    orderId?: string,
    customerId?: string,
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

  listLedger(
    req: PortalRequest,
    limitStr?: string,
    beforeStr?: string,
    fromStr?: string,
    toStr?: string,
    customerId?: string,
    type?: string,
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
