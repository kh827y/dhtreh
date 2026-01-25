import { AccessScope, StaffRole, StaffStatus } from '@prisma/client';

export interface StaffFilters {
  search?: string;
  status?: StaffStatus | 'ALL';
  outletId?: string;
  groupId?: string;
  portalOnly?: boolean;
}

export interface UpsertStaffPayload {
  login?: string | null;
  email?: string | null;
  phone?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  position?: string | null;
  comment?: string | null;
  avatarUrl?: string | null;
  role?: StaffRole;
  status?: StaffStatus;
  canAccessPortal?: boolean;
  portalAccessEnabled?: boolean;
  outletIds?: string[];
  accessGroupIds?: string[];
  pinStrategy?: 'KEEP' | 'ROTATE';
  password?: string | null;
  currentPassword?: string | null;
}

export interface AccessGroupPayload {
  name: string;
  description?: string | null;
  scope?: AccessScope;
  permissions: Array<{
    resource: string;
    action: string;
    conditions?: string | null;
  }>;
  isDefault?: boolean;
}

export interface AccessGroupFilters {
  scope?: AccessScope | 'ALL';
  search?: string;
}

export interface OutletFilters {
  status?: 'ACTIVE' | 'INACTIVE' | 'ALL';
  search?: string;
}

export interface UpsertOutletPayload {
  name?: string;
  works?: boolean;
  reviewsShareLinks?: unknown;
  devices?: Array<{ code?: string | null }> | null;
}
