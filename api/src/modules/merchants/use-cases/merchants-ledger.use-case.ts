import { Injectable } from '@nestjs/common';
import type { Response } from 'express';
import { MerchantsService } from '../merchants.service';
import { csvCell } from '../utils/merchants-csv.util';

@Injectable()
export class MerchantsLedgerUseCase {
  constructor(private readonly merchants: MerchantsService) {}

  listTransactions(
    merchantId: string,
    params: {
      limitStr?: string;
      beforeStr?: string;
      fromStr?: string;
      toStr?: string;
      type?: string;
      customerId?: string;
      outletId?: string;
      staffId?: string;
    },
  ) {
    const limit = params.limitStr
      ? Math.min(Math.max(parseInt(params.limitStr, 10) || 50, 1), 200)
      : 50;
    const before = params.beforeStr ? new Date(params.beforeStr) : undefined;
    const from = params.fromStr ? new Date(params.fromStr) : undefined;
    const to = params.toStr ? new Date(params.toStr) : undefined;
    return this.merchants.listTransactions(merchantId, {
      limit,
      before,
      from,
      to,
      type: params.type,
      customerId: params.customerId,
      outletId: params.outletId,
      staffId: params.staffId,
    });
  }

  listReceipts(
    merchantId: string,
    params: {
      limitStr?: string;
      beforeStr?: string;
      fromStr?: string;
      toStr?: string;
      orderId?: string;
      customerId?: string;
    },
  ) {
    const limit = params.limitStr
      ? Math.min(Math.max(parseInt(params.limitStr, 10) || 50, 1), 200)
      : 50;
    const before = params.beforeStr ? new Date(params.beforeStr) : undefined;
    const from = params.fromStr ? new Date(params.fromStr) : undefined;
    const to = params.toStr ? new Date(params.toStr) : undefined;
    return this.merchants.listReceipts(merchantId, {
      limit,
      before,
      from,
      to,
      orderId: params.orderId,
      customerId: params.customerId,
    });
  }

  getReceipt(merchantId: string, receiptId: string) {
    return this.merchants.getReceipt(merchantId, receiptId);
  }

  async exportReceiptsCsv(
    merchantId: string,
    res: Response,
    params: {
      batchStr?: string;
      beforeStr?: string;
      orderId?: string;
      customerId?: string;
    },
  ) {
    const batch = Math.min(
      Math.max(parseInt(params.batchStr || '1000', 10) || 1000, 100),
      5000,
    );
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="receipts_${merchantId}_${Date.now()}.csv"`,
    );
    res.write(
      'id,orderId,customerId,total,redeemApplied,earnApplied,createdAt,outletId,staffId\n',
    );
    let before = params.beforeStr ? new Date(params.beforeStr) : undefined;
    while (true) {
      const page = await this.merchants.listReceipts(merchantId, {
        limit: batch,
        before,
        orderId: params.orderId,
        customerId: params.customerId,
      });
      if (!page.length) break;
      for (const r of page) {
        const row = [
          r.id,
          r.orderId,
          r.customerId,
          r.total,
          r.redeemApplied,
          r.earnApplied,
          r.createdAt.toISOString(),
          r.outletId || '',
          r.staffId || '',
        ]
          .map((x) => csvCell(x))
          .join(',');
        res.write(row + '\n');
      }
      before = page[page.length - 1].createdAt;
      if (page.length < batch) break;
    }
    res.end();
  }

  listLedger(
    merchantId: string,
    params: {
      limitStr?: string;
      beforeStr?: string;
      fromStr?: string;
      toStr?: string;
      customerId?: string;
      type?: string;
    },
  ) {
    const limit = params.limitStr
      ? Math.min(Math.max(parseInt(params.limitStr, 10) || 50, 1), 500)
      : 50;
    const before = params.beforeStr ? new Date(params.beforeStr) : undefined;
    const from = params.fromStr ? new Date(params.fromStr) : undefined;
    const to = params.toStr ? new Date(params.toStr) : undefined;
    return this.merchants.listLedger(merchantId, {
      limit,
      before,
      customerId: params.customerId,
      from,
      to,
      type: params.type,
    });
  }

  async exportLedgerCsv(
    merchantId: string,
    res: Response,
    params: {
      batchStr?: string;
      beforeStr?: string;
      fromStr?: string;
      toStr?: string;
      customerId?: string;
      type?: string;
    },
  ) {
    const batch = Math.min(
      Math.max(parseInt(params.batchStr || '1000', 10) || 1000, 100),
      5000,
    );
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="ledger_${merchantId}_${Date.now()}.csv"`,
    );
    res.write(
      'id,customerId,debit,credit,amount,orderId,receiptId,createdAt,outletId,staffId\n',
    );
    let before = params.beforeStr ? new Date(params.beforeStr) : undefined;
    const from = params.fromStr ? new Date(params.fromStr) : undefined;
    const to = params.toStr ? new Date(params.toStr) : undefined;
    while (true) {
      const page = await this.merchants.listLedger(merchantId, {
        limit: batch,
        before,
        customerId: params.customerId,
        from,
        to,
        type: params.type,
      });
      if (!page.length) break;
      for (const e of page) {
        const row = [
          e.id,
          e.customerId || '',
          e.debit,
          e.credit,
          e.amount,
          e.orderId || '',
          e.receiptId || '',
          e.createdAt.toISOString(),
          e.outletId || '',
          e.staffId || '',
        ]
          .map((x) => csvCell(x))
          .join(',');
        res.write(row + '\n');
      }
      before = page[page.length - 1].createdAt;
      if (page.length < batch) break;
    }
    res.end();
  }

  ttlReconciliation(merchantId: string, cutoff: string) {
    return this.merchants.ttlReconciliation(merchantId, cutoff);
  }

  exportTtlReconciliationCsv(
    merchantId: string,
    cutoff: string,
    onlyDiff?: string,
  ) {
    return this.merchants.exportTtlReconciliationCsv(
      merchantId,
      cutoff,
      onlyDiff === '1' || /true/i.test(onlyDiff || ''),
    );
  }

  customerSearch(merchantId: string, phone: string) {
    return this.merchants.findCustomerByPhone(merchantId, phone);
  }

  async exportTxCsv(
    merchantId: string,
    res: Response,
    params: {
      batchStr?: string;
      beforeStr?: string;
      fromStr?: string;
      toStr?: string;
      type?: string;
      customerId?: string;
      outletId?: string;
      staffId?: string;
    },
  ) {
    const batch = Math.min(
      Math.max(parseInt(params.batchStr || '1000', 10) || 1000, 100),
      5000,
    );
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="transactions_${merchantId}_${Date.now()}.csv"`,
    );
    res.write('id,type,amount,orderId,customerId,createdAt,outletId,staffId\n');
    let before = params.beforeStr ? new Date(params.beforeStr) : undefined;
    const from = params.fromStr ? new Date(params.fromStr) : undefined;
    const to = params.toStr ? new Date(params.toStr) : undefined;
    while (true) {
      const page = await this.merchants.listTransactions(merchantId, {
        limit: batch,
        before,
        from,
        to,
        type: params.type,
        customerId: params.customerId,
        outletId: params.outletId,
        staffId: params.staffId,
      });
      if (!page.length) break;
      for (const t of page) {
        const row = [
          t.id,
          t.type,
          t.amount,
          t.orderId || '',
          t.customerId,
          t.createdAt.toISOString(),
          t.outletId || '',
          t.staffId || '',
        ]
          .map((x) => csvCell(x))
          .join(',');
        res.write(row + '\n');
      }
      before = page[page.length - 1].createdAt;
      if (page.length < batch) break;
    }
    res.end();
  }
}
