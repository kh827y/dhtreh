import type { Request } from 'express';

export type PortalPermissionsState = {
  allowAll?: boolean;
  resources?: Map<string, Set<string>> | Record<string, unknown>;
};

export type PortalAccessGroup = {
  id: string;
  name: string;
  scope: string;
};

export type PortalRequest = Request & {
  portalMerchantId?: string;
  portalTimezoneOffsetMinutes?: number;
  portalTimezone?: string;
  portalRole?: string;
  portalActor?: string;
  portalAdminImpersonation?: boolean;
  portalStaffId?: string;
  portalStaffEmail?: string | null;
  portalStaffName?: string;
  portalStaffRole?: string;
  portalAccessGroups?: PortalAccessGroup[];
  portalPermissions?: PortalPermissionsState;
};

export type UploadedFile = {
  buffer?: Buffer;
  originalname?: string;
  mimetype?: string;
  size?: number;
};
