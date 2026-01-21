import { Injectable } from '@nestjs/common';
import {
  CreateStaffDto,
  UpdateMerchantSettingsDto,
  UpdateOutletDto,
  UpdateStaffDto,
} from './dto';
import { MerchantsSettingsService } from './services/merchants-settings.service';
import { MerchantsAccessService } from './services/merchants-access.service';
import { MerchantsStaffService } from './services/merchants-staff.service';
import { MerchantsOutletsService } from './services/merchants-outlets.service';
import { MerchantsOutboxService } from './services/merchants-outbox.service';
import { MerchantsAntifraudService } from './services/merchants-antifraud.service';
import { MerchantsLedgerService } from './services/merchants-ledger.service';
import { MerchantsAdminService } from './services/merchants-admin.service';
import { MerchantsPortalAuthService } from './services/merchants-portal-auth.service';
import { MerchantsIntegrationsService } from './services/merchants-integrations.service';

@Injectable()
export class MerchantsService {
  constructor(
    private readonly settings: MerchantsSettingsService,
    private readonly access: MerchantsAccessService,
    private readonly staff: MerchantsStaffService,
    private readonly outlets: MerchantsOutletsService,
    private readonly outbox: MerchantsOutboxService,
    private readonly antifraud: MerchantsAntifraudService,
    private readonly ledger: MerchantsLedgerService,
    private readonly admin: MerchantsAdminService,
    private readonly portalAuth: MerchantsPortalAuthService,
    private readonly integrations: MerchantsIntegrationsService,
  ) {}

  async getCashierCredentials(merchantId: string) {
    return this.access.getCashierCredentials(merchantId);
  }
  async setCashierCredentials(merchantId: string, login: string) {
    return this.access.setCashierCredentials(merchantId, login);
  }
  async rotateCashierCredentials(
    merchantId: string,
    regenerateLogin?: boolean,
  ) {
    return this.access.rotateCashierCredentials(merchantId, regenerateLogin);
  }

  async issueCashierActivationCodes(merchantId: string, count: number) {
    return this.access.issueCashierActivationCodes(merchantId, count);
  }

  async listCashierActivationCodes(merchantId: string, limit = 50) {
    return this.access.listCashierActivationCodes(merchantId, limit);
  }

  async revokeCashierActivationCode(merchantId: string, codeId: string) {
    return this.access.revokeCashierActivationCode(merchantId, codeId);
  }

  async listCashierDeviceSessions(merchantId: string, limit = 50) {
    return this.access.listCashierDeviceSessions(merchantId, limit);
  }

  async revokeCashierDeviceSession(merchantId: string, sessionId: string) {
    return this.access.revokeCashierDeviceSession(merchantId, sessionId);
  }

  async activateCashierDeviceByCode(
    merchantLogin: string,
    activationCode: string,
    context?: { ip?: string | null; userAgent?: string | null },
  ) {
    return this.access.activateCashierDeviceByCode(
      merchantLogin,
      activationCode,
      context,
    );
  }

  async getCashierDeviceSessionByToken(token: string) {
    return this.access.getCashierDeviceSessionByToken(token);
  }

  async revokeCashierDeviceSessionByToken(token: string) {
    return this.access.revokeCashierDeviceSessionByToken(token);
  }

  async startCashierSessionByMerchantId(
    merchantId: string,
    pinCode: string,
    rememberPin?: boolean,
    context?: { ip?: string | null; userAgent?: string | null },
    deviceSessionId?: string | null,
  ) {
    return this.access.startCashierSessionByMerchantId(
      merchantId,
      pinCode,
      rememberPin,
      context,
      deviceSessionId,
    );
  }

  async getSettings(merchantId: string) {
    return this.settings.getSettings(merchantId);
  }

  async updateSettings(
    merchantId: string,
    earnBps?: number,
    redeemLimitBps?: number,
    qrTtlSec?: number,
    webhookUrl?: string,
    webhookSecret?: string,
    webhookKeyId?: string,
    redeemCooldownSec?: number,
    earnCooldownSec?: number,
    redeemDailyCap?: number,
    earnDailyCap?: number,
    requireJwtForQuote?: boolean,
    rulesJson?: unknown,
    extras?: Partial<UpdateMerchantSettingsDto>,
  ) {
    return this.settings.updateSettings(
      merchantId,
      earnBps,
      redeemLimitBps,
      qrTtlSec,
      webhookUrl,
      webhookSecret,
      webhookKeyId,
      redeemCooldownSec,
      earnCooldownSec,
      redeemDailyCap,
      earnDailyCap,
      requireJwtForQuote,
      rulesJson,
      extras,
    );
  }

  validateRules(rulesJson: unknown) {
    return this.settings.validateRules(rulesJson);
  }

  async getTimezone(merchantId: string) {
    return this.settings.getTimezone(merchantId);
  }

  async updateTimezone(merchantId: string, code: string) {
    return this.settings.updateTimezone(merchantId, code);
  }

  async resetAntifraudLimit(
    merchantId: string,
    payload: {
      scope: 'merchant' | 'customer' | 'staff' | 'device' | 'outlet';
      targetId?: string;
    },
  ) {
    return this.antifraud.resetAntifraudLimit(merchantId, payload);
  }

  async previewRules(
    merchantId: string,
    args: {
      channel: 'VIRTUAL' | 'PC_POS' | 'SMART';
      weekday: number;
      category?: string;
    },
  ) {
    return this.antifraud.previewRules(merchantId, args);
  }

  async listOutlets(merchantId: string) {
    return this.outlets.listOutlets(merchantId);
  }
  async createOutlet(merchantId: string, name: string) {
    return this.outlets.createOutlet(merchantId, name);
  }
  async updateOutlet(
    merchantId: string,
    outletId: string,
    dto: UpdateOutletDto,
  ) {
    return this.outlets.updateOutlet(merchantId, outletId, dto);
  }
  async deleteOutlet(merchantId: string, outletId: string) {
    return this.outlets.deleteOutlet(merchantId, outletId);
  }

  async updateOutletStatus(
    merchantId: string,
    outletId: string,
    status: 'ACTIVE' | 'INACTIVE',
  ) {
    return this.outlets.updateOutletStatus(merchantId, outletId, status);
  }

  // Staff
  async listStaff(merchantId: string) {
    return this.staff.listStaff(merchantId);
  }
  async createStaff(merchantId: string, dto: CreateStaffDto) {
    return this.staff.createStaff(merchantId, dto);
  }
  async updateStaff(merchantId: string, staffId: string, dto: UpdateStaffDto) {
    return this.staff.updateStaff(merchantId, staffId, dto);
  }
  async deleteStaff(merchantId: string, staffId: string) {
    return this.staff.deleteStaff(merchantId, staffId);
  }

  // Staff ↔ Outlet access management (PINs)
  async listStaffAccess(merchantId: string, staffId: string) {
    return this.access.listStaffAccess(merchantId, staffId);
  }
  async addStaffAccess(merchantId: string, staffId: string, outletId: string) {
    return this.access.addStaffAccess(merchantId, staffId, outletId);
  }
  async removeStaffAccess(
    merchantId: string,
    staffId: string,
    outletId: string,
  ) {
    return this.access.removeStaffAccess(merchantId, staffId, outletId);
  }
  async regenerateStaffPersonalPin(merchantId: string, staffId: string) {
    return this.access.regenerateStaffPersonalPin(merchantId, staffId);
  }
  async regenerateStaffPin(
    merchantId: string,
    staffId: string,
    outletId: string,
  ) {
    return this.access.regenerateStaffPin(merchantId, staffId, outletId);
  }

  async getStaffAccessByPin(
    merchantId: string,
    pinCode: string,
    deviceSessionId?: string | null,
  ) {
    return this.access.getStaffAccessByPin(
      merchantId,
      pinCode,
      deviceSessionId,
    );
  }

  async getCashierSessionByToken(token: string) {
    return this.access.getCashierSessionByToken(token);
  }

  async endCashierSessionByToken(token: string, reason = 'logout') {
    return this.access.endCashierSessionByToken(token, reason);
  }

  // Outbox monitor
  async listOutbox(
    merchantId: string,
    status?: string,
    limit = 50,
    type?: string,
    since?: string,
    cursor?: { createdAt: Date; id: string } | null,
  ) {
    return this.outbox.listOutbox(
      merchantId,
      status,
      limit,
      type,
      since,
      cursor,
    );
  }
  async retryOutbox(merchantId: string, eventId: string) {
    return this.outbox.retryOutbox(merchantId, eventId);
  }
  async getOutboxEvent(merchantId: string, eventId: string) {
    return this.outbox.getOutboxEvent(merchantId, eventId);
  }
  async deleteOutbox(merchantId: string, eventId: string) {
    return this.outbox.deleteOutbox(merchantId, eventId);
  }
  async retryAll(merchantId: string, status?: string) {
    return this.outbox.retryAll(merchantId, status);
  }

  async retrySince(
    merchantId: string,
    params: { status?: string; since?: string },
  ) {
    return this.outbox.retrySince(merchantId, params);
  }

  async exportOutboxCsv(
    merchantId: string,
    params: { status?: string; since?: string; type?: string; limit?: number },
  ) {
    return this.outbox.exportOutboxCsv(merchantId, params);
  }

  async pauseOutbox(merchantId: string, minutes?: number, untilISO?: string) {
    return this.outbox.pauseOutbox(merchantId, minutes, untilISO);
  }
  async resumeOutbox(merchantId: string) {
    return this.outbox.resumeOutbox(merchantId);
  }

  async outboxStats(merchantId: string, since?: Date) {
    return this.outbox.outboxStats(merchantId, since);
  }
  async listOutboxByOrder(merchantId: string, orderId: string, limit = 100) {
    return this.outbox.listOutboxByOrder(merchantId, orderId, limit);
  }

  async issueStaffToken(merchantId: string, staffId: string) {
    return this.portalAuth.issueStaffToken(merchantId, staffId);
  }

  async revokeStaffToken(merchantId: string, staffId: string) {
    return this.portalAuth.revokeStaffToken(merchantId, staffId);
  }

  async rotatePortalKey(merchantId: string) {
    return this.portalAuth.rotatePortalKey(merchantId);
  }
  async setPortalLoginEnabled(merchantId: string, enabled: boolean) {
    return this.portalAuth.setPortalLoginEnabled(merchantId, enabled);
  }
  async initTotp(merchantId: string) {
    return this.portalAuth.initTotp(merchantId);
  }
  async verifyTotp(merchantId: string, code: string) {
    return this.portalAuth.verifyTotp(merchantId, code);
  }
  async disableTotp(merchantId: string) {
    return this.portalAuth.disableTotp(merchantId);
  }
  async impersonatePortal(merchantId: string, ttlSec = 24 * 60 * 60) {
    return this.portalAuth.impersonatePortal(merchantId, ttlSec);
  }

  async listTransactions(
    merchantId: string,
    params: {
      limit: number;
      before?: Date;
      from?: Date;
      to?: Date;
      type?: string;
      customerId?: string;
      outletId?: string;
      staffId?: string;
    },
  ) {
    return this.ledger.listTransactions(merchantId, params);
  }

  async listReceipts(
    merchantId: string,
    params: {
      limit: number;
      before?: Date;
      from?: Date;
      to?: Date;
      orderId?: string;
      customerId?: string;
    },
  ) {
    return this.ledger.listReceipts(merchantId, params);
  }

  async getReceipt(merchantId: string, receiptId: string) {
    return this.ledger.getReceipt(merchantId, receiptId);
  }

  async listLedger(
    merchantId: string,
    params: {
      limit: number;
      before?: Date;
      customerId?: string;
      from?: Date;
      to?: Date;
      type?: string;
    },
  ) {
    return this.ledger.listLedger(merchantId, params);
  }

  async exportLedgerCsv(
    merchantId: string,
    params: {
      limit: number;
      before?: Date;
      customerId?: string;
      from?: Date;
      to?: Date;
      type?: string;
    },
  ) {
    return this.ledger.exportLedgerCsv(merchantId, params);
  }

  async ttlReconciliation(merchantId: string, cutoffISO: string) {
    return this.ledger.ttlReconciliation(merchantId, cutoffISO);
  }

  async exportTtlReconciliationCsv(
    merchantId: string,
    cutoffISO: string,
    onlyDiff = false,
  ) {
    return this.ledger.exportTtlReconciliationCsv(
      merchantId,
      cutoffISO,
      onlyDiff,
    );
  }

  async listEarnLots(
    merchantId: string,
    params: {
      limit: number;
      before?: Date;
      customerId?: string;
      activeOnly?: boolean;
    },
  ) {
    return this.ledger.listEarnLots(merchantId, params);
  }
  async exportEarnLotsCsv(
    merchantId: string,
    params: {
      limit: number;
      before?: Date;
      customerId?: string;
      activeOnly?: boolean;
    },
  ) {
    return this.ledger.exportEarnLotsCsv(merchantId, params);
  }

  async getBalance(merchantId: string, customerId: string) {
    return this.ledger.getBalance(merchantId, customerId);
  }
  async findCustomerByPhone(merchantId: string, phone: string) {
    return this.ledger.findCustomerByPhone(merchantId, phone);
  }

  // ===== Admin: merchants management =====
  listMerchants() {
    return this.admin.listMerchants();
  }
  async createMerchant(
    name: string,
    email: string,
    password: string,
    ownerName?: string,
    maxOutlets?: number | null,
  ) {
    return this.admin.createMerchant(
      name,
      email,
      password,
      ownerName,
      maxOutlets,
    );
  }

  async updateMerchant(
    id: string,
    dto: { name?: string; email?: string; password?: string },
  ) {
    return this.admin.updateMerchant(id, dto);
  }

  async getMerchantName(merchantId: string) {
    return this.admin.getMerchantName(merchantId);
  }

  async updateMerchantName(merchantId: string, rawName: string) {
    return this.admin.updateMerchantName(merchantId, rawName);
  }

  async deleteMerchant(id: string) {
    return this.admin.deleteMerchant(id);
  }

  async listIntegrations(merchantId: string) {
    return this.integrations.listIntegrations(merchantId);
  }
}
