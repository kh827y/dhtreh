import { BadRequestException, Injectable } from '@nestjs/common';
import { MerchantsService } from '../../merchants/merchants.service';
import { PortalCustomersService } from '../services/customers.service';
import type { PortalCustomerDto } from '../services/customers.service';
import { ImportExportService } from '../../import-export/import-export.service';
import {
  PortalControllerHelpers,
  type PortalRequest,
} from '../controllers/portal.controller-helpers';

@Injectable()
export class PortalCustomersUseCase {
  constructor(
    private readonly merchants: MerchantsService,
    private readonly customersService: PortalCustomersService,
    private readonly importExport: ImportExportService,
    private readonly helpers: PortalControllerHelpers,
  ) {}

  customerSearch(req: PortalRequest, phone: string) {
    return this.merchants.findCustomerByPhone(
      this.helpers.getMerchantId(req),
      String(phone || ''),
    );
  }

  listCustomers(
    req: PortalRequest,
    search?: string,
    limitStr?: string,
    offsetStr?: string,
    segmentId?: string,
    registeredOnlyStr?: string,
    excludeMiniappStr?: string,
  ) {
    const limit = limitStr
      ? Math.min(Math.max(parseInt(limitStr, 10) || 50, 1), 200)
      : 50;
    const offset = offsetStr ? Math.max(parseInt(offsetStr, 10) || 0, 0) : 0;
    let registeredOnly: boolean | undefined;
    if (typeof registeredOnlyStr === 'string') {
      registeredOnly = !['0', 'false', 'no'].includes(
        registeredOnlyStr.trim().toLowerCase(),
      );
    }
    let excludeMiniapp: boolean | undefined;
    if (typeof excludeMiniappStr === 'string') {
      excludeMiniapp = !['0', 'false', 'no'].includes(
        excludeMiniappStr.trim().toLowerCase(),
      );
    }
    return this.customersService.list(this.helpers.getMerchantId(req), {
      search,
      limit,
      offset,
      segmentId,
      registeredOnly,
      excludeMiniapp,
    });
  }

  getCustomer(req: PortalRequest, customerId: string) {
    return this.customersService.get(
      this.helpers.getMerchantId(req),
      String(customerId || ''),
    );
  }

  private normalizeBoolean(value: unknown): boolean | undefined {
    if (value === undefined || value === null) return undefined;
    if (typeof value === 'boolean') return value;
    if (typeof value === 'string') {
      const normalized = value.trim().toLowerCase();
      if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
      if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
    }
    return undefined;
  }

  private resolveImportFormat(
    bodyFormat: unknown,
    fileName?: string | null,
    mimeType?: string | null,
  ): 'csv' | 'excel' | null {
    if (bodyFormat === 'csv' || bodyFormat === 'excel') {
      return bodyFormat;
    }
    const lowerName = (fileName || '').toLowerCase();
    if (lowerName.endsWith('.csv')) return 'csv';
    if (lowerName.endsWith('.xlsx') || lowerName.endsWith('.xls')) return 'excel';
    const normalizedMime = (mimeType || '').toLowerCase();
    if (normalizedMime.includes('csv')) return 'csv';
    if (
      normalizedMime.includes('spreadsheet') ||
      normalizedMime.includes('excel')
    ) {
      return 'excel';
    }
    return null;
  }

  async importCustomers(
    req: PortalRequest,
    body: {
      format?: 'csv' | 'excel';
      data?: string;
      updateExisting?: boolean | string;
      sendWelcome?: boolean | string;
    },
    file?: {
      buffer?: Buffer;
      originalname?: string;
      mimetype?: string;
      size?: number;
    } | null,
  ) {
    const updateExisting = this.normalizeBoolean(body?.updateExisting);
    const sendWelcome = this.normalizeBoolean(body?.sendWelcome);
    const format = this.resolveImportFormat(
      body?.format,
      file?.originalname,
      file?.mimetype,
    );
    if (!format) {
      throw new BadRequestException('Не удалось определить формат файла');
    }
    let buffer: Buffer | null = null;
    if (file?.buffer) {
      buffer = file.buffer;
    } else if (body?.data) {
      const raw = body.data.split(',').pop() || '';
      buffer = Buffer.from(raw, 'base64');
    }
    if (!buffer || buffer.length === 0) {
      throw new BadRequestException('Файл не найден');
    }

    const merchantId = this.helpers.getMerchantId(req);
    const uploadedById =
      typeof req.portalStaffId === 'string' && req.portalStaffId.trim()
        ? req.portalStaffId.trim()
        : null;
    return this.importExport.enqueueImportCustomers({
      merchantId,
      format,
      data: buffer,
      updateExisting: updateExisting === undefined ? false : updateExisting,
      sendWelcome: sendWelcome === undefined ? false : sendWelcome,
      sourceFileName: file?.originalname ?? null,
      sourceFileSize: file?.size ?? buffer.length,
      sourceMimeType: file?.mimetype ?? null,
      uploadedById,
    });
  }

  getImportJob(req: PortalRequest, jobId: string) {
    return this.importExport.getImportJobSummary(
      this.helpers.getMerchantId(req),
      jobId,
    );
  }

  listImportJobs(req: PortalRequest, limitStr?: string, offsetStr?: string) {
    const limit = limitStr ? parseInt(limitStr, 10) : 20;
    const offset = offsetStr ? parseInt(offsetStr, 10) : 0;
    return this.importExport.listImportJobs(
      this.helpers.getMerchantId(req),
      limit,
      offset,
    );
  }

  createCustomer(req: PortalRequest, body: unknown) {
    const payload = this.normalizeCustomerPayload(body);
    return this.customersService.create(this.helpers.getMerchantId(req), payload);
  }

  updateCustomer(req: PortalRequest, customerId: string, body: unknown) {
    const payload = this.normalizeCustomerPayload(body);
    return this.customersService.update(
      this.helpers.getMerchantId(req),
      String(customerId || ''),
      payload,
    );
  }

  manualAccrual(req: PortalRequest, customerId: string, body: unknown) {
    const payload = this.helpers.asRecord(body);
    const staffId =
      typeof req.portalStaffId === 'string' && req.portalStaffId.trim()
        ? req.portalStaffId.trim()
        : null;
    return this.customersService.accrueManual(
      this.helpers.getMerchantId(req),
      String(customerId || ''),
      staffId,
      {
        purchaseAmount: this.helpers.coerceNumber(payload.purchaseAmount) ?? 0,
        points: this.helpers.coerceNumber(payload.points),
        receiptNumber: this.helpers.coerceString(payload.receiptNumber),
        outletId: this.helpers.coerceString(payload.outletId),
        comment: this.helpers.coerceString(payload.comment),
      },
    );
  }

  manualRedeem(req: PortalRequest, customerId: string, body: unknown) {
    const payload = this.helpers.asRecord(body);
    const staffId =
      typeof req.portalStaffId === 'string' && req.portalStaffId.trim()
        ? req.portalStaffId.trim()
        : null;
    return this.customersService.redeemManual(
      this.helpers.getMerchantId(req),
      String(customerId || ''),
      staffId,
      {
        points: this.helpers.coerceNumber(payload.points) ?? 0,
        outletId: this.helpers.coerceString(payload.outletId),
        comment: this.helpers.coerceString(payload.comment),
      },
    );
  }

  manualComplimentary(req: PortalRequest, customerId: string, body: unknown) {
    const payload = this.helpers.asRecord(body);
    const staffId =
      typeof req.portalStaffId === 'string' && req.portalStaffId.trim()
        ? req.portalStaffId.trim()
        : null;
    return this.customersService.issueComplimentary(
      this.helpers.getMerchantId(req),
      String(customerId || ''),
      staffId,
      {
        points: this.helpers.coerceNumber(payload.points) ?? 0,
        expiresInDays: this.helpers.coerceNumber(payload.expiresInDays),
        outletId: this.helpers.coerceString(payload.outletId),
        comment: this.helpers.coerceString(payload.comment),
      },
    );
  }

  eraseCustomer(req: PortalRequest, customerId: string) {
    return this.customersService.erasePersonalData(
      this.helpers.getMerchantId(req),
      String(customerId || ''),
    );
  }

  deleteCustomer(req: PortalRequest, customerId: string) {
    return this.customersService.remove(
      this.helpers.getMerchantId(req),
      String(customerId || ''),
    );
  }

  private normalizeCustomerPayload(
    body: unknown,
  ): Partial<PortalCustomerDto> & { firstName?: string; lastName?: string } {
    const payload = this.helpers.asRecord(body);
    const tags = Array.isArray(payload.tags)
      ? payload.tags
          .map((tag) => (typeof tag === 'string' ? tag.trim() : ''))
          .filter((tag) => tag.length > 0)
      : undefined;
    const firstName = this.helpers.coerceString(payload.firstName) ?? undefined;
    const lastName = this.helpers.coerceString(payload.lastName) ?? undefined;
    return {
      phone: this.helpers.coerceString(payload.phone),
      email: this.helpers.coerceString(payload.email),
      name: this.helpers.coerceString(payload.name),
      firstName,
      lastName,
      birthday: this.helpers.coerceString(payload.birthday),
      gender: this.helpers.coerceString(payload.gender),
      tags,
      comment: this.helpers.coerceString(payload.comment),
      accrualsBlocked:
        payload.accrualsBlocked === undefined
          ? undefined
          : Boolean(payload.accrualsBlocked),
      redemptionsBlocked:
        payload.redemptionsBlocked === undefined
          ? undefined
          : Boolean(payload.redemptionsBlocked),
    };
  }
}
