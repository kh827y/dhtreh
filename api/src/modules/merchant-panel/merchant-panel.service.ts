import { Injectable } from '@nestjs/common';
import { StaffStatus } from '@prisma/client';
import { MerchantPanelAccessGroupsService } from './merchant-panel-access-groups.service';
import { MerchantPanelOutletsService } from './merchant-panel-outlets.service';
import { MerchantPanelCashierService } from './merchant-panel-cashier.service';
import { MerchantPanelStaffService } from './merchant-panel-staff.service';
import type {
  AccessGroupFilters,
  AccessGroupPayload,
  OutletFilters,
  StaffFilters,
  UpsertOutletPayload,
  UpsertStaffPayload,
} from './merchant-panel.types';

export * from './merchant-panel.types';

type PortalActorContext = {
  actor?: string | null;
  staffId?: string | null;
  role?: string | null;
};

@Injectable()
export class MerchantPanelService {
  constructor(
    private readonly staff: MerchantPanelStaffService,
    private readonly accessGroups: MerchantPanelAccessGroupsService,
    private readonly outlets: MerchantPanelOutletsService,
    private readonly cashiers: MerchantPanelCashierService,
  ) {}

  listStaff(
    merchantId: string,
    filters: StaffFilters = {},
    pagination?: { page?: number; pageSize?: number },
  ) {
    return this.staff.listStaff(merchantId, filters, pagination);
  }

  getStaff(merchantId: string, staffId: string) {
    return this.staff.getStaff(merchantId, staffId);
  }

  createStaff(merchantId: string, payload: UpsertStaffPayload) {
    return this.staff.createStaff(merchantId, payload);
  }

  updateStaff(
    merchantId: string,
    staffId: string,
    payload: UpsertStaffPayload,
    actor?: PortalActorContext,
  ) {
    return this.staff.updateStaff(merchantId, staffId, payload, actor);
  }

  uploadStaffAvatar(
    merchantId: string,
    staffId: string,
    file: {
      buffer?: Buffer;
      mimetype?: string;
      originalname?: string;
      size?: number;
    },
  ) {
    return this.staff.uploadStaffAvatar(merchantId, staffId, file);
  }

  getStaffAvatarAsset(merchantId: string, assetId: string) {
    return this.staff.getStaffAvatarAsset(merchantId, assetId);
  }

  changeStaffStatus(merchantId: string, staffId: string, status: StaffStatus) {
    return this.staff.changeStaffStatus(merchantId, staffId, status);
  }

  listStaffAccesses(merchantId: string, staffId: string) {
    return this.staff.listStaffAccesses(merchantId, staffId);
  }

  addStaffAccess(merchantId: string, staffId: string, outletId: string) {
    return this.staff.addStaffAccess(merchantId, staffId, outletId);
  }

  removeStaffAccess(merchantId: string, staffId: string, outletId: string) {
    return this.staff.removeStaffAccess(merchantId, staffId, outletId);
  }

  regenerateStaffOutletPin(
    merchantId: string,
    staffId: string,
    outletId: string,
  ) {
    return this.staff.regenerateStaffOutletPin(merchantId, staffId, outletId);
  }

  rotateStaffPin(merchantId: string, accessId: string) {
    return this.staff.rotateStaffPin(merchantId, accessId);
  }

  revokeStaffPin(merchantId: string, accessId: string) {
    return this.staff.revokeStaffPin(merchantId, accessId);
  }

  listAccessGroups(
    merchantId: string,
    filters: AccessGroupFilters = {},
    pagination?: { page?: number; pageSize?: number },
  ) {
    return this.accessGroups.listAccessGroups(merchantId, filters, pagination);
  }

  createAccessGroup(
    merchantId: string,
    payload: AccessGroupPayload,
    actorId?: string,
  ) {
    return this.accessGroups.createAccessGroup(merchantId, payload, actorId);
  }

  updateAccessGroup(
    merchantId: string,
    groupId: string,
    payload: AccessGroupPayload,
    actorId?: string,
  ) {
    return this.accessGroups.updateAccessGroup(
      merchantId,
      groupId,
      payload,
      actorId,
    );
  }

  getAccessGroup(merchantId: string, groupId: string) {
    return this.accessGroups.getAccessGroup(merchantId, groupId);
  }

  deleteAccessGroup(merchantId: string, groupId: string) {
    return this.accessGroups.deleteAccessGroup(merchantId, groupId);
  }

  setGroupMembers(merchantId: string, groupId: string, staffIds: string[]) {
    return this.accessGroups.setGroupMembers(merchantId, groupId, staffIds);
  }

  listOutlets(
    merchantId: string,
    filters: OutletFilters = {},
    pagination?: { page?: number; pageSize?: number },
  ) {
    return this.outlets.listOutlets(merchantId, filters, pagination);
  }

  createOutlet(merchantId: string, payload: UpsertOutletPayload) {
    return this.outlets.createOutlet(merchantId, payload);
  }

  updateOutlet(
    merchantId: string,
    outletId: string,
    payload: UpsertOutletPayload,
  ) {
    return this.outlets.updateOutlet(merchantId, outletId, payload);
  }

  getOutlet(merchantId: string, outletId: string) {
    return this.outlets.getOutlet(merchantId, outletId);
  }

  deleteOutlet(merchantId: string, outletId: string) {
    return this.outlets.deleteOutlet(merchantId, outletId);
  }

  listCashierPins(merchantId: string) {
    return this.cashiers.listCashierPins(merchantId);
  }

  getCashierCredentials(merchantId: string) {
    return this.cashiers.getCashierCredentials(merchantId);
  }

  rotateCashierCredentials(merchantId: string, regenerateLogin?: boolean) {
    return this.cashiers.rotateCashierCredentials(merchantId, regenerateLogin);
  }

  listCashierActivationCodes(merchantId: string) {
    return this.cashiers.listCashierActivationCodes(merchantId);
  }

  issueCashierActivationCodes(merchantId: string, count: number) {
    return this.cashiers.issueCashierActivationCodes(merchantId, count);
  }

  revokeCashierActivationCode(merchantId: string, codeId: string) {
    return this.cashiers.revokeCashierActivationCode(merchantId, codeId);
  }

  listCashierDeviceSessions(merchantId: string) {
    return this.cashiers.listCashierDeviceSessions(merchantId);
  }

  revokeCashierDeviceSession(merchantId: string, sessionId: string) {
    return this.cashiers.revokeCashierDeviceSession(merchantId, sessionId);
  }
}
