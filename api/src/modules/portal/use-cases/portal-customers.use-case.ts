import { BadRequestException, Injectable } from '@nestjs/common';
import { MerchantsService } from '../../merchants/merchants.service';
import { PortalCustomersService } from '../services/customers.service';
import type { PortalCustomerDto } from '../services/customers.service';
import { ImportExportService } from '../../import-export/import-export.service';
import {
  PortalControllerHelpers,
  type PortalRequest,
} from '../controllers/portal.controller-helpers';
import { normalizeBoolean } from '../../../shared/common/input.util';
import type {
  ImportCustomersDto,
  ManualAccrualDto,
  ManualComplimentaryDto,
  ManualRedeemDto,
  PortalCustomerPayloadDto,
} from '../dto/customers.dto';

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
    const limit = this.helpers.parseLimit(limitStr, {
      defaultValue: 50,
      max: 200,
    });
    const offset = this.helpers.parseOffset(offsetStr);
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
    if (lowerName.endsWith('.xlsx') || lowerName.endsWith('.xls'))
      return 'excel';
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
    body: ImportCustomersDto,
    file?: {
      buffer?: Buffer;
      originalname?: string;
      mimetype?: string;
      size?: number;
    } | null,
  ) {
    const updateExisting = normalizeBoolean(body?.updateExisting);
    const sendWelcome = normalizeBoolean(body?.sendWelcome);
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
    const limit = this.helpers.parseLimit(limitStr, {
      defaultValue: 20,
      max: 200,
    });
    const offset = this.helpers.parseOffset(offsetStr);
    return this.importExport.listImportJobs(
      this.helpers.getMerchantId(req),
      limit,
      offset,
    );
  }

  createCustomer(req: PortalRequest, body: PortalCustomerPayloadDto) {
    const payload = this.normalizeCustomerPayload(body);
    return this.customersService.create(
      this.helpers.getMerchantId(req),
      payload,
    );
  }

  updateCustomer(
    req: PortalRequest,
    customerId: string,
    body: PortalCustomerPayloadDto,
  ) {
    const payload = this.normalizeCustomerPayload(body);
    return this.customersService.update(
      this.helpers.getMerchantId(req),
      String(customerId || ''),
      payload,
    );
  }

  manualAccrual(req: PortalRequest, customerId: string, body: ManualAccrualDto) {
    const staffId =
      typeof req.portalStaffId === 'string' && req.portalStaffId.trim()
        ? req.portalStaffId.trim()
        : null;
    return this.customersService.accrueManual(
      this.helpers.getMerchantId(req),
      String(customerId || ''),
      staffId,
      {
        purchaseAmount: this.helpers.coerceNumber(body?.purchaseAmount) ?? 0,
        points: this.helpers.coerceNumber(body?.points),
        receiptNumber: this.helpers.coerceString(body?.receiptNumber),
        outletId: this.helpers.coerceString(body?.outletId),
        comment: this.helpers.coerceString(body?.comment),
      },
    );
  }

  manualRedeem(req: PortalRequest, customerId: string, body: ManualRedeemDto) {
    const staffId =
      typeof req.portalStaffId === 'string' && req.portalStaffId.trim()
        ? req.portalStaffId.trim()
        : null;
    return this.customersService.redeemManual(
      this.helpers.getMerchantId(req),
      String(customerId || ''),
      staffId,
      {
        points: this.helpers.coerceNumber(body?.points) ?? 0,
        outletId: this.helpers.coerceString(body?.outletId),
        comment: this.helpers.coerceString(body?.comment),
      },
    );
  }

  manualComplimentary(
    req: PortalRequest,
    customerId: string,
    body: ManualComplimentaryDto,
  ) {
    const staffId =
      typeof req.portalStaffId === 'string' && req.portalStaffId.trim()
        ? req.portalStaffId.trim()
        : null;
    return this.customersService.issueComplimentary(
      this.helpers.getMerchantId(req),
      String(customerId || ''),
      staffId,
      {
        points: this.helpers.coerceNumber(body?.points) ?? 0,
        expiresInDays: this.helpers.coerceNumber(body?.expiresInDays),
        outletId: this.helpers.coerceString(body?.outletId),
        comment: this.helpers.coerceString(body?.comment),
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
    body: PortalCustomerPayloadDto,
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
