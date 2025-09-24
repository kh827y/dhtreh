import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { AccessScope, Prisma, StaffOutletAccessStatus, StaffRole, StaffStatus } from '@prisma/client';
import { MerchantsService } from '../merchants/merchants.service';
import { PrismaService } from '../prisma.service';

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
  role?: StaffRole;
  status?: StaffStatus;
  canAccessPortal?: boolean;
  portalAccessEnabled?: boolean;
  outletIds?: string[];
  accessGroupIds?: string[];
  pinStrategy?: 'KEEP' | 'ROTATE';
}

export interface AccessGroupPayload {
  name: string;
  description?: string | null;
  scope?: AccessScope;
  permissions: Array<{ resource: string; action: string; conditions?: any }>;
  isDefault?: boolean;
}

export interface OutletFilters {
  status?: 'ACTIVE' | 'INACTIVE' | 'ALL';
  hidden?: boolean;
  search?: string;
}

export interface UpsertOutletPayload {
  name?: string;
  description?: string | null;
  address?: string | null;
  phone?: string | null;
  adminEmails?: string[];
  works?: boolean;
  hidden?: boolean;
  timezone?: string | null;
  schedule?: { mode: '24_7' | 'CUSTOM'; days: Array<{ day: string; enabled: boolean; from?: string; to?: string }> };
  externalId?: string | null;
  integrationProvider?: string | null;
  integrationLocationCode?: string | null;
  integrationPayload?: any;
  manualLocation?: boolean;
  latitude?: number | null;
  longitude?: number | null;
}

@Injectable()
export class MerchantPanelService {
  constructor(private readonly prisma: PrismaService, private readonly merchants: MerchantsService) {}

  private randomPin(): string {
    return String(Math.floor(Math.random() * 10000)).padStart(4, '0');
  }

  private async generateUniquePin(
    tx: Prisma.TransactionClient,
    merchantId: string,
    excludeAccessId?: string,
  ): Promise<string> {
    for (let attempt = 0; attempt < 200; attempt += 1) {
      const pin = this.randomPin();
      const clash = await tx.staffOutletAccess.findFirst({
        where: {
          merchantId,
          pinCode: pin,
          status: StaffOutletAccessStatus.ACTIVE,
          ...(excludeAccessId ? { id: { not: excludeAccessId } } : {}),
        },
        select: { id: true },
      });
      if (!clash) return pin;
    }
    throw new BadRequestException('Не удалось сгенерировать уникальный PIN');
  }

  private staffInclude() {
    return {
      accesses: {
        include: {
          outlet: true,
        },
      },
      accessGroupMemberships: {
        include: { group: true },
      },
    } satisfies Prisma.StaffInclude;
  }

  async listStaff(merchantId: string, filters: StaffFilters = {}) {
    const where: Prisma.StaffWhereInput = {
      merchantId,
    };
    if (filters.status && filters.status !== 'ALL') {
      where.status = filters.status;
    }
    if (filters.outletId) {
      where.accesses = { some: { outletId: filters.outletId, status: StaffOutletAccessStatus.ACTIVE } };
    }
    if (filters.groupId) {
      where.accessGroupMemberships = { some: { groupId: filters.groupId } };
    }
    if (filters.portalOnly) {
      where.portalAccessEnabled = true;
    }
    if (filters.search) {
      const q = filters.search.trim();
      where.OR = [
        { firstName: { contains: q, mode: 'insensitive' } },
        { lastName: { contains: q, mode: 'insensitive' } },
        { email: { contains: q, mode: 'insensitive' } },
        { phone: { contains: q, mode: 'insensitive' } },
      ];
    }
    const staff = await this.prisma.staff.findMany({
      where,
      orderBy: [
        { isOwner: 'desc' },
        { createdAt: 'desc' },
      ],
      include: this.staffInclude(),
    });
    return staff.map((member) => ({
      ...member,
      accesses: member.accesses.map((access) => ({
        id: access.id,
        outletId: access.outletId,
        outletName: access.outlet?.name ?? null,
        pinCode: access.pinCode,
        status: access.status,
      })),
      groups: member.accessGroupMemberships.map((m) => ({
        id: m.groupId,
        name: m.group.name,
        scope: m.group.scope,
      })),
    }));
  }

  async getStaff(merchantId: string, staffId: string) {
    const staff = await this.prisma.staff.findFirst({
      where: { merchantId, id: staffId },
      include: this.staffInclude(),
    });
    if (!staff) throw new NotFoundException('Сотрудник не найден');
    return staff;
  }

  private async syncAccessGroups(
    tx: Prisma.TransactionClient,
    merchantId: string,
    staffId: string,
    targetGroupIds: string[] = [],
  ) {
    const groups = await tx.accessGroup.findMany({ where: { merchantId, id: { in: targetGroupIds } } });
    if (targetGroupIds.length && groups.length !== targetGroupIds.length) {
      throw new BadRequestException('Некоторые группы доступа не найдены');
    }
    const existingMemberships = await tx.staffAccessGroup.findMany({ where: { staffId } });
    const toRemove = existingMemberships.filter((m) => !targetGroupIds.includes(m.groupId)).map((m) => m.id);
    if (toRemove.length) {
      await tx.staffAccessGroup.deleteMany({ where: { id: { in: toRemove } } });
    }
    const existingGroupIds = new Set(existingMemberships.map((m) => m.groupId));
    for (const group of groups) {
      if (!existingGroupIds.has(group.id)) {
        await tx.staffAccessGroup.create({
          data: {
            merchantId,
            staffId,
            groupId: group.id,
          },
        });
      }
    }
  }

  private async syncOutlets(
    tx: Prisma.TransactionClient,
    merchantId: string,
    staffId: string,
    outletIds: string[] = [],
    pinStrategy: 'KEEP' | 'ROTATE' = 'KEEP',
  ) {
    if (outletIds.length) {
      const outlets = await tx.outlet.findMany({ where: { merchantId, id: { in: outletIds } } });
      if (outlets.length !== outletIds.length) {
        throw new BadRequestException('Некоторые торговые точки не найдены');
      }
    }
    const existing = await tx.staffOutletAccess.findMany({ where: { merchantId, staffId } });
    const targetSet = new Set(outletIds);
    for (const access of existing) {
      if (!targetSet.has(access.outletId)) {
        if (access.status === StaffOutletAccessStatus.ACTIVE) {
          await tx.staffOutletAccess.update({
            where: { id: access.id },
            data: {
              status: StaffOutletAccessStatus.REVOKED,
              revokedAt: new Date(),
            },
          });
        }
      } else if (pinStrategy === 'ROTATE') {
        const newPin = await this.generateUniquePin(tx, merchantId, access.id);
        await tx.staffOutletAccess.update({
          where: { id: access.id },
          data: {
            pinCode: newPin,
            pinUpdatedAt: new Date(),
          },
        });
      }
    }
    const existingOutletIds = new Set(existing.map((item) => item.outletId));
    for (const outletId of outletIds) {
      if (!existingOutletIds.has(outletId)) {
        const pin = await this.generateUniquePin(tx, merchantId);
        await tx.staffOutletAccess.create({
          data: {
            merchantId,
            staffId,
            outletId,
            status: StaffOutletAccessStatus.ACTIVE,
            pinCode: pin,
          },
        });
      } else {
        await tx.staffOutletAccess.updateMany({
          where: { merchantId, staffId, outletId },
          data: { status: StaffOutletAccessStatus.ACTIVE, revokedAt: null },
        });
      }
    }
  }

  async createStaff(merchantId: string, payload: UpsertStaffPayload) {
    return this.prisma.$transaction(async (tx) => {
      const staff = await tx.staff.create({
        data: {
          merchantId,
          login: payload.login?.trim() || undefined,
          email: payload.email?.trim().toLowerCase() || undefined,
          phone: payload.phone?.trim() || undefined,
          firstName: payload.firstName?.trim() || undefined,
          lastName: payload.lastName?.trim() || undefined,
          position: payload.position?.trim() || undefined,
          comment: payload.comment?.trim() || undefined,
          role: payload.role ?? StaffRole.CASHIER,
          status: payload.status ?? StaffStatus.ACTIVE,
          canAccessPortal: payload.canAccessPortal ?? false,
          portalAccessEnabled: payload.portalAccessEnabled ?? false,
          portalState: payload.portalAccessEnabled ? 'ENABLED' : 'DISABLED',
        },
        include: this.staffInclude(),
      });

      await this.syncAccessGroups(tx, merchantId, staff.id, payload.accessGroupIds ?? []);
      await this.syncOutlets(tx, merchantId, staff.id, payload.outletIds ?? [], payload.pinStrategy ?? 'KEEP');

      return this.getStaff(merchantId, staff.id);
    });
  }

  async updateStaff(merchantId: string, staffId: string, payload: UpsertStaffPayload) {
    const staff = await this.prisma.staff.findFirst({ where: { merchantId, id: staffId } });
    if (!staff) throw new NotFoundException('Сотрудник не найден');
    if (staff.isOwner) {
      if (payload.portalAccessEnabled === false || payload.canAccessPortal === false) {
        throw new ForbiddenException('Нельзя отключить доступ владельцу');
      }
      if (payload.status && payload.status !== StaffStatus.ACTIVE) {
        throw new ForbiddenException('Нельзя изменить статус владельца');
      }
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.staff.update({
        where: { id: staffId },
        data: {
          login: payload.login?.trim() ?? staff.login,
          email: payload.email?.trim().toLowerCase() ?? staff.email,
          phone: payload.phone?.trim() ?? staff.phone,
          firstName: payload.firstName?.trim() ?? staff.firstName,
          lastName: payload.lastName?.trim() ?? staff.lastName,
          position: payload.position?.trim() ?? staff.position,
          comment: payload.comment?.trim() ?? staff.comment,
          role: payload.role ?? staff.role,
          status: payload.status ?? staff.status,
          canAccessPortal: payload.canAccessPortal ?? staff.canAccessPortal,
          portalAccessEnabled: payload.portalAccessEnabled ?? staff.portalAccessEnabled,
          portalState:
            payload.portalAccessEnabled === true
              ? 'ENABLED'
              : payload.portalAccessEnabled === false
                ? 'DISABLED'
                : staff.portalState,
        },
      });

      if (payload.accessGroupIds) {
        await this.syncAccessGroups(tx, merchantId, staffId, payload.accessGroupIds);
      }
      if (payload.outletIds) {
        await this.syncOutlets(tx, merchantId, staffId, payload.outletIds, payload.pinStrategy ?? 'KEEP');
      }

      return this.getStaff(merchantId, staffId);
    });
  }

  async changeStaffStatus(merchantId: string, staffId: string, status: StaffStatus) {
    const staff = await this.prisma.staff.findFirst({ where: { merchantId, id: staffId } });
    if (!staff) throw new NotFoundException('Сотрудник не найден');
    if (staff.isOwner && status !== StaffStatus.ACTIVE) {
      throw new ForbiddenException('Нельзя отключить владельца');
    }
    await this.prisma.staff.update({
      where: { id: staffId },
      data: { status },
    });
    return this.getStaff(merchantId, staffId);
  }

  async rotateStaffPin(merchantId: string, accessId: string) {
    return this.prisma.$transaction(async (tx) => {
      const access = await tx.staffOutletAccess.findFirst({ where: { merchantId, id: accessId } });
      if (!access) throw new NotFoundException('Доступ не найден');
      if (access.status !== StaffOutletAccessStatus.ACTIVE) {
        throw new BadRequestException('PIN можно обновить только для активного доступа');
      }
      const pin = await this.generateUniquePin(tx, merchantId, accessId);
      const updated = await tx.staffOutletAccess.update({
        where: { id: accessId },
        data: { pinCode: pin, pinUpdatedAt: new Date() },
        include: { outlet: true, staff: true },
      });
      return updated;
    });
  }

  async revokeStaffPin(merchantId: string, accessId: string) {
    const updated = await this.prisma.staffOutletAccess.updateMany({
      where: { merchantId, id: accessId, status: StaffOutletAccessStatus.ACTIVE },
      data: { status: StaffOutletAccessStatus.REVOKED, revokedAt: new Date() },
    });
    if (!updated.count) throw new NotFoundException('PIN не найден или уже отозван');
    return { ok: true };
  }

  async listAccessGroups(merchantId: string, scope: AccessScope | 'ALL' = 'PORTAL') {
    const where: Prisma.AccessGroupWhereInput = { merchantId };
    if (scope !== 'ALL') {
      where.scope = scope;
    }
    const groups = await this.prisma.accessGroup.findMany({
      where,
      orderBy: [{ isSystem: 'asc' }, { createdAt: 'desc' }],
      include: {
        permissions: true,
        members: { select: { id: true } },
      },
    });
    return groups.map((group) => ({
      ...group,
      memberCount: group.members.length,
    }));
  }

  async createAccessGroup(merchantId: string, payload: AccessGroupPayload, actorId?: string) {
    return this.prisma.accessGroup.create({
      data: {
        merchantId,
        name: payload.name.trim(),
        description: payload.description ?? null,
        scope: payload.scope ?? AccessScope.PORTAL,
        isDefault: payload.isDefault ?? false,
        createdById: actorId,
        permissions: payload.permissions.length
          ? {
              create: payload.permissions.map((permission) => ({
                resource: permission.resource,
                action: permission.action,
                conditions: permission.conditions ?? null,
              })),
            }
          : undefined,
      },
      include: { permissions: true },
    });
  }

  async updateAccessGroup(merchantId: string, groupId: string, payload: AccessGroupPayload, actorId?: string) {
    const group = await this.prisma.accessGroup.findFirst({ where: { merchantId, id: groupId } });
    if (!group) throw new NotFoundException('Группа не найдена');
    if (group.isSystem) throw new ForbiddenException('Нельзя редактировать системную группу');
    return this.prisma.$transaction(async (tx) => {
      await tx.accessGroup.update({
        where: { id: groupId },
        data: {
          name: payload.name.trim(),
          description: payload.description ?? null,
          scope: payload.scope ?? group.scope,
          isDefault: payload.isDefault ?? group.isDefault,
          updatedById: actorId ?? group.updatedById,
        },
      });
      await tx.accessGroupPermission.deleteMany({ where: { groupId } });
      if (payload.permissions.length) {
        await tx.accessGroupPermission.createMany({
          data: payload.permissions.map((permission) => ({
            groupId,
            resource: permission.resource,
            action: permission.action,
            conditions: permission.conditions ?? null,
          })),
        });
      }
      return tx.accessGroup.findUnique({ where: { id: groupId }, include: { permissions: true } });
    });
  }

  async deleteAccessGroup(merchantId: string, groupId: string) {
    const group = await this.prisma.accessGroup.findFirst({ where: { merchantId, id: groupId } });
    if (!group) throw new NotFoundException('Группа не найдена');
    if (group.isSystem) throw new ForbiddenException('Нельзя удалить системную группу');
    await this.prisma.$transaction(async (tx) => {
      await tx.staffAccessGroup.deleteMany({ where: { groupId } });
      await tx.accessGroupPermission.deleteMany({ where: { groupId } });
      await tx.accessGroup.delete({ where: { id: groupId } });
    });
    return { ok: true };
  }

  async setGroupMembers(merchantId: string, groupId: string, staffIds: string[]) {
    const group = await this.prisma.accessGroup.findFirst({ where: { merchantId, id: groupId } });
    if (!group) throw new NotFoundException('Группа не найдена');
    await this.prisma.$transaction(async (tx) => {
      await tx.staffAccessGroup.deleteMany({ where: { groupId } });
      if (staffIds.length) {
        await tx.staffAccessGroup.createMany({
          data: staffIds.map((staffId) => ({ merchantId, groupId, staffId })),
        });
      }
    });
    return { ok: true };
  }

  async listOutlets(merchantId: string, filters: OutletFilters = {}) {
    const where: Prisma.OutletWhereInput = { merchantId };
    if (filters.status && filters.status !== 'ALL') {
      where.status = filters.status;
    }
    if (filters.hidden != null) {
      where.hidden = filters.hidden;
    }
    if (filters.search) {
      where.OR = [
        { name: { contains: filters.search, mode: 'insensitive' } },
        { address: { contains: filters.search, mode: 'insensitive' } },
      ];
    }
    return this.prisma.outlet.findMany({ where, orderBy: { createdAt: 'desc' } });
  }

  private buildScheduleJson(payload: UpsertOutletPayload['schedule']) {
    if (!payload) return null;
    return {
      mode: payload.mode,
      days: payload.days.map((day) => ({
        day: day.day,
        enabled: !!day.enabled,
        from: day.from ?? null,
        to: day.to ?? null,
      })),
    };
  }

  async createOutlet(merchantId: string, payload: UpsertOutletPayload) {
    if (!payload.name?.trim()) throw new BadRequestException('Название обязательно');
    const outlet = await this.prisma.outlet.create({
      data: {
        merchantId,
        name: payload.name.trim(),
        description: payload.description ?? null,
        address: payload.address ?? null,
        phone: payload.phone ?? null,
        adminEmails: payload.adminEmails ?? [],
        status: payload.works === false ? 'INACTIVE' : 'ACTIVE',
        hidden: payload.hidden ?? false,
        timezone: payload.timezone ?? null,
        scheduleEnabled: payload.schedule != null,
        scheduleJson: this.buildScheduleJson(payload.schedule),
        externalId: payload.externalId ?? null,
        integrationProvider: payload.integrationProvider ?? null,
        integrationLocationCode: payload.integrationLocationCode ?? null,
        integrationPayload: payload.integrationPayload ?? null,
        manualLocation: payload.manualLocation ?? false,
        latitude: payload.latitude != null ? new Prisma.Decimal(payload.latitude) : null,
        longitude: payload.longitude != null ? new Prisma.Decimal(payload.longitude) : null,
      },
    });
    return outlet;
  }

  async updateOutlet(merchantId: string, outletId: string, payload: UpsertOutletPayload) {
    const outlet = await this.prisma.outlet.findFirst({ where: { merchantId, id: outletId } });
    if (!outlet) throw new NotFoundException('Точка не найдена');
    const updated = await this.prisma.outlet.update({
      where: { id: outletId },
      data: {
        name: payload.name?.trim() || outlet.name,
        description: payload.description?.trim() ?? outlet.description,
        address: payload.address?.trim() ?? outlet.address,
        phone: payload.phone?.trim() ?? outlet.phone,
        adminEmails: payload.adminEmails ?? outlet.adminEmails,
        status: payload.works === undefined ? outlet.status : payload.works ? 'ACTIVE' : 'INACTIVE',
        hidden: payload.hidden ?? outlet.hidden,
        timezone: payload.timezone ?? outlet.timezone,
        scheduleEnabled: payload.schedule != null ? true : outlet.scheduleEnabled,
        scheduleJson: payload.schedule ? this.buildScheduleJson(payload.schedule) : outlet.scheduleJson,
        externalId: payload.externalId ?? outlet.externalId,
        integrationProvider: payload.integrationProvider ?? outlet.integrationProvider,
        integrationLocationCode: payload.integrationLocationCode ?? outlet.integrationLocationCode,
        integrationPayload: payload.integrationPayload ?? outlet.integrationPayload,
        manualLocation: payload.manualLocation ?? outlet.manualLocation,
        latitude: payload.latitude != null ? new Prisma.Decimal(payload.latitude) : outlet.latitude,
        longitude: payload.longitude != null ? new Prisma.Decimal(payload.longitude) : outlet.longitude,
      },
    });
    return updated;
  }

  async listCashierPins(merchantId: string) {
    const accesses = await this.prisma.staffOutletAccess.findMany({
      where: { merchantId },
      include: {
        staff: true,
        outlet: true,
      },
      orderBy: { createdAt: 'desc' },
    });
    return accesses.map((access) => ({
      id: access.id,
      staffId: access.staffId,
      staffName: `${access.staff?.firstName ?? ''} ${access.staff?.lastName ?? ''}`.trim(),
      outletId: access.outletId,
      outletName: access.outlet?.name ?? null,
      pinCode: access.pinCode,
      status: access.status,
      updatedAt: access.pinUpdatedAt ?? access.createdAt,
    }));
  }

  getCashierCredentials(merchantId: string) {
    return this.merchants.getCashierCredentials(merchantId);
  }

  rotateCashierCredentials(merchantId: string, regenerateLogin?: boolean) {
    return this.merchants.rotateCashierCredentials(merchantId, regenerateLogin);
  }
}
