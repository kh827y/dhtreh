import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import {
  AccessScope,
  CommunicationChannel,
  Prisma,
  StaffOutletAccessStatus,
  StaffRole,
  StaffStatus,
} from '@prisma/client';
import { MerchantsService } from '../merchants/merchants.service';
import { PrismaService } from '../prisma.service';
import { MetricsService } from '../metrics.service';
import { hashPassword, verifyPassword } from '../password.util';
import {
  normalizeDeviceCode,
  ensureUniqueDeviceCodes,
  type NormalizedDeviceCode,
} from '../devices/device.util';
import type {
  AccessGroupDto as AccessGroupDtoModel,
  AccessGroupListResponseDto as AccessGroupListResponseDtoModel,
  AccessGroupPermissionDto as AccessGroupPermissionDtoModel,
} from './dto/access-group.dto';

interface PaginationOptions {
  page: number;
  pageSize: number;
}

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
  permissions: Array<{ resource: string; action: string; conditions?: any }>;
  isDefault?: boolean;
}

export interface AccessGroupFilters {
  scope?: AccessScope | 'ALL';
  search?: string;
}

type PortalActorContext = {
  actor?: string | null;
  staffId?: string | null;
  role?: string | null;
};

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function normalizeEmailValue(value?: string | null) {
  if (value === null || value === undefined) return null;
  const trimmed = String(value).trim().toLowerCase();
  return trimmed ? trimmed : null;
}

function assertEmailFormat(value: string, message: string) {
  if (!EMAIL_REGEX.test(value)) {
    throw new BadRequestException(message);
  }
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

type StaffAccessView = {
  id: string;
  outletId: string;
  outletName?: string | null;
  pinCode?: string | null;
  status: StaffOutletAccessStatus;
  lastTxnAt?: string | null;
  transactionsTotal?: number | null;
};

@Injectable()
export class MerchantPanelService {
  private readonly logger = new Logger(MerchantPanelService.name);
  private readonly allowedAvatarMimeTypes = new Set([
    'image/png',
    'image/jpeg',
    'image/webp',
  ]);
  private readonly maxAvatarBytes = 2 * 1024 * 1024;

  constructor(
    private readonly prisma: PrismaService,
    private readonly merchants: MerchantsService,
    private readonly metrics: MetricsService,
  ) {}

  private normalizePagination(
    pagination?: Partial<PaginationOptions>,
  ): PaginationOptions {
    const page = Math.max(1, Math.floor(pagination?.page ?? 1));
    const pageSize = Math.max(
      1,
      Math.min(200, Math.floor(pagination?.pageSize ?? 20)),
    );
    return { page, pageSize };
  }

  private buildMeta(pagination: PaginationOptions, total: number) {
    const totalPages = Math.max(1, Math.ceil(total / pagination.pageSize));
    return {
      page: pagination.page,
      pageSize: pagination.pageSize,
      total,
      totalPages,
    };
  }

  private randomPin(): string {
    return String(Math.floor(Math.random() * 10000)).padStart(4, '0');
  }

  private defaultAvatarFileName(mimeType: string) {
    if (mimeType === 'image/png') return 'avatar.png';
    if (mimeType === 'image/webp') return 'avatar.webp';
    return 'avatar.jpg';
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

  private mapStaff(
    member: Prisma.StaffGetPayload<{
      include: ReturnType<MerchantPanelService['staffInclude']>;
    }>,
    overrides: {
      accesses?: StaffAccessView[];
      outletsCount?: number | null;
      lastActivityAt?: Date | string | null;
      lastPortalLoginAt?: Date | string | null;
    } = {},
  ) {
    const normalizeDate = (value?: Date | string | null) => {
      if (!value) return null;
      if (value instanceof Date) return value.toISOString();
      return value;
    };

    const accesses: StaffAccessView[] = overrides.accesses
      ? overrides.accesses
      : member.accesses.map((access) => ({
          id: access.id,
          outletId: access.outletId,
          outletName: access.outlet?.name ?? null,
          pinCode: access.pinCode,
          status: access.status,
          lastTxnAt: access.lastTxnAt ? access.lastTxnAt.toISOString() : null,
          transactionsTotal: null,
        }));

    return {
      id: member.id,
      login: member.login,
      email: member.email,
      phone: member.phone,
      firstName: member.firstName,
      lastName: member.lastName,
      position: member.position,
      comment: member.comment,
      avatarUrl: member.avatarUrl,
      role: member.role,
      status: member.status,
      portalAccessEnabled: member.portalAccessEnabled,
      canAccessPortal: member.canAccessPortal,
      portalLoginEnabled:
        member.status === StaffStatus.ACTIVE &&
        member.portalAccessEnabled &&
        member.canAccessPortal &&
        !!member.hash,
      isOwner: member.isOwner,
      pinCode: null,
      lastActivityAt: normalizeDate(
        overrides.lastActivityAt ?? member.lastActivityAt ?? null,
      ),
      lastPortalLoginAt: normalizeDate(
        overrides.lastPortalLoginAt ?? member.lastPortalLoginAt ?? null,
      ),
      outletsCount: overrides.outletsCount ?? null,
      accesses,
      groups: member.accessGroupMemberships.map((m) => ({
        id: m.groupId,
        name: m.group.name,
        scope: m.group.scope,
      })),
    };
  }

  private async buildAccessViews(
    merchantId: string,
    staffId: string,
    accesses: Array<
      Prisma.StaffOutletAccessGetPayload<{ include: { outlet: true } }>
    >,
  ): Promise<StaffAccessView[]> {
    if (!accesses.length) return [];
    const outletIds = accesses.map((access) => access.outletId);
    let countMap = new Map<string, number>();
    if (outletIds.length) {
      try {
        const grouped = await this.prisma.transaction.groupBy({
          by: ['staffId', 'outletId'],
          where: { merchantId, staffId, outletId: { in: outletIds } },
          _count: { _all: true },
        });
        countMap = new Map<string, number>(
          grouped.map((row): [string, number] => [
            `${row.staffId}:${row.outletId}`,
            row._count?._all ?? 0,
          ]),
        );
      } catch {}
    }
    return accesses.map<StaffAccessView>((access) => ({
      id: access.id,
      outletId: access.outletId,
      outletName: access.outlet?.name ?? null,
      pinCode: access.pinCode,
      status: access.status,
      lastTxnAt: access.lastTxnAt ? access.lastTxnAt.toISOString() : null,
      transactionsTotal: countMap.get(`${staffId}:${access.outletId}`) ?? 0,
    }));
  }

  private sanitizeReviewLinksInput(input?: unknown) {
    if (!input || typeof input !== 'object') return undefined;
    const result: Record<string, string> = {};
    for (const [rawKey, rawValue] of Object.entries(
      input as Record<string, unknown>,
    )) {
      const key = String(rawKey || '')
        .toLowerCase()
        .trim();
      if (!key) continue;
      if (typeof rawValue === 'string') {
        const trimmed = rawValue.trim();
        if (trimmed.length) {
          result[key] = trimmed;
        }
      }
    }
    return Object.keys(result).length ? result : {};
  }

  private extractReviewLinks(payload: Prisma.JsonValue | null | undefined) {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload))
      return {} as Record<string, string>;
    const result: Record<string, string> = {};
    for (const [platform, value] of Object.entries(
      payload as Record<string, unknown>,
    )) {
      if (!platform) continue;
      if (typeof value === 'string') {
        const trimmed = value.trim();
        if (trimmed) result[platform] = trimmed;
      }
    }
    return result;
  }

  private mapDevices(
    devices?: Array<{
      id: string;
      code: string;
      archivedAt: Date | null;
      createdAt: Date;
      updatedAt: Date;
    }>,
  ) {
    const list = Array.isArray(devices) ? devices : [];
    return list
      .filter((device) => !device.archivedAt)
      .map((device) => ({
        id: device.id,
        code: device.code,
        archivedAt: device.archivedAt ?? null,
        createdAt: device.createdAt,
        updatedAt: device.updatedAt,
      }));
  }

  private normalizeDevicesInput(
    devices?: Array<{ code?: string | null }> | null,
  ): NormalizedDeviceCode[] {
    if (!devices) return [];
    const normalized = devices
      .map((device) => {
        if (!device) return null;
        return normalizeDeviceCode(String(device.code ?? ''));
      })
      .filter((value): value is NormalizedDeviceCode => value !== null);
    ensureUniqueDeviceCodes(normalized);
    return normalized;
  }

  private async syncDevicesForOutlet(
    tx: Prisma.TransactionClient,
    merchantId: string,
    outletId: string,
    devices: NormalizedDeviceCode[],
  ) {
    ensureUniqueDeviceCodes(devices);
    const codes = devices.map((device) => device.normalized);
    if (!devices.length) {
      await tx.device.updateMany({
        where: { merchantId, outletId, archivedAt: null },
        data: { archivedAt: new Date() },
      });
      return;
    }
    const existing = await tx.device.findMany({
      where: { merchantId, codeNormalized: { in: codes } },
    });
    const conflict = existing.find(
      (device) => device.outletId !== outletId && !device.archivedAt,
    );
    if (conflict) {
      throw new BadRequestException(
        'Идентификатор устройства уже привязан к другой торговой точке',
      );
    }
    const now = new Date();
    for (const device of devices) {
      const matched = existing.find(
        (d) => d.codeNormalized === device.normalized,
      );
      if (matched) {
        await tx.device.update({
          where: { id: matched.id },
          data: {
            code: device.code,
            codeNormalized: device.normalized,
            archivedAt: null,
            updatedAt: now,
          },
        });
      } else {
        await tx.device.create({
          data: {
            merchantId,
            outletId,
            code: device.code,
            codeNormalized: device.normalized,
            createdAt: now,
            updatedAt: now,
          },
        });
      }
    }
    await tx.device.updateMany({
      where: {
        merchantId,
        outletId,
        codeNormalized: { notIn: codes },
        archivedAt: null,
      },
      data: { archivedAt: now },
    });
  }

  private mapOutlet(
    outlet: Prisma.OutletGetPayload<{
      include?: { devices?: true };
    }> & { devices?: any[]; staffCount?: number },
  ) {
    return {
      id: outlet.id,
      name: outlet.name,
      status: outlet.status,
      staffCount: typeof outlet.staffCount === 'number' ? outlet.staffCount : 0,
      devices: this.mapDevices((outlet as any).devices),
      reviewsShareLinks: (() => {
        const links = this.extractReviewLinks(outlet.reviewLinks ?? null);
        if (!Object.keys(links).length) return null;
        return {
          yandex: links.yandex ?? null,
          twogis: links.twogis ?? null,
          google: links.google ?? null,
        };
      })(),
    };
  }

  private mapAccessGroup(
    group: Prisma.AccessGroupGetPayload<{ include: { permissions: true } }> & {
      memberCount?: number;
    },
  ): AccessGroupDtoModel {
    const normalizeConditions = (
      value: Prisma.JsonValue | null,
    ): string | null => {
      if (value == null) return null;
      if (typeof value === 'string') return value;
      try {
        return JSON.stringify(value);
      } catch {
        return null;
      }
    };
    const permissions = group.permissions.map((permission) => ({
      resource: permission.resource,
      action: permission.action,
      conditions: normalizeConditions(permission.conditions ?? null),
    })) as AccessGroupPermissionDtoModel[];
    return {
      id: group.id,
      name: group.name,
      description: group.description,
      scope: group.scope,
      isSystem: group.isSystem,
      isDefault: group.isDefault,
      memberCount: group.memberCount ?? 0,
      permissions,
    } as AccessGroupDtoModel;
  }

  async listStaff(
    merchantId: string,
    filters: StaffFilters = {},
    pagination?: Partial<PaginationOptions>,
  ) {
    const paging = this.normalizePagination(pagination);
    const where: Prisma.StaffWhereInput = {
      merchantId,
    };
    if (filters.status && filters.status !== 'ALL') {
      where.status = filters.status;
    }
    if (filters.outletId) {
      where.accesses = {
        some: {
          outletId: filters.outletId,
          status: StaffOutletAccessStatus.ACTIVE,
        },
      };
    }
    if (filters.groupId) {
      where.accessGroupMemberships = { some: { groupId: filters.groupId } };
    }
    if (filters.portalOnly) {
      where.portalAccessEnabled = true;
      where.canAccessPortal = true;
      where.hash = { not: null };
      where.status = StaffStatus.ACTIVE;
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
    const [
      items,
      total,
      active,
      pending,
      suspended,
      fired,
      archived,
      portalEnabled,
    ] = await this.prisma.$transaction([
      this.prisma.staff.findMany({
        where,
        orderBy: [{ isOwner: 'desc' }, { createdAt: 'desc' }],
        include: this.staffInclude(),
        skip: (paging.page - 1) * paging.pageSize,
        take: paging.pageSize,
      }),
      this.prisma.staff.count({ where }),
      this.prisma.staff.count({
        where: { merchantId, status: StaffStatus.ACTIVE },
      }),
      this.prisma.staff.count({
        where: { merchantId, status: StaffStatus.PENDING },
      }),
      this.prisma.staff.count({
        where: { merchantId, status: StaffStatus.SUSPENDED },
      }),
      this.prisma.staff.count({
        where: { merchantId, status: StaffStatus.FIRED },
      }),
      this.prisma.staff.count({
        where: { merchantId, status: StaffStatus.ARCHIVED },
      }),
      this.prisma.staff.count({
        where: {
          merchantId,
          status: StaffStatus.ACTIVE,
          OR: [
            { isOwner: true },
            {
              portalAccessEnabled: true,
              canAccessPortal: true,
              hash: { not: null },
            },
          ],
        },
      }),
    ]);

    const staffIds = items.map((item) => item.id);
    let outletsCountMap = new Map<string, number>();
    let lastActivityMap = new Map<string, Date | null>();
    if (staffIds.length) {
      const [accessCounts, txnGroups] = await Promise.all([
        this.prisma.staffOutletAccess
          .groupBy({
            by: ['staffId'],
            where: {
              merchantId,
              staffId: { in: staffIds },
              status: StaffOutletAccessStatus.ACTIVE,
            },
            _count: { _all: true },
          })
          .catch(
            () => [] as Array<{ staffId: string; _count: { _all: number } }>,
          ),
        this.prisma.transaction
          .groupBy({
            by: ['staffId'],
            where: { merchantId, staffId: { in: staffIds } },
            _max: { createdAt: true },
          })
          .catch(
            () =>
              [] as Array<{
                staffId: string;
                _max: { createdAt: Date | null };
              }>,
          ),
      ]);
      outletsCountMap = new Map<string, number>(
        accessCounts.map((row): [string, number] => [
          row.staffId,
          row._count?._all ?? 0,
        ]),
      );
      lastActivityMap = new Map<string, Date | null>(
        txnGroups.map((row): [string, Date | null] => [
          row.staffId,
          row._max?.createdAt ?? null,
        ]),
      );
    }

    try {
      this.logger.log(
        JSON.stringify({
          event: 'portal.staff.list',
          merchantId,
          filters: {
            status: filters.status,
            outletId: filters.outletId,
            groupId: filters.groupId,
            portalOnly: filters.portalOnly,
            hasSearch: Boolean(filters.search),
          },
          page: paging.page,
          pageSize: paging.pageSize,
          total,
        }),
      );
      this.metrics.inc('portal_staff_list_total');
    } catch {}

    const resolveLastActivity = (
      member: typeof items[number],
      transactionDate: Date | null,
    ) => {
      const candidates = [
        transactionDate,
        member.lastActivityAt ?? null,
        member.lastPortalLoginAt ?? null,
      ].filter(Boolean) as Date[];
      if (!candidates.length) return null;
      return new Date(
        Math.max(...candidates.map((value) => value.getTime())),
      );
    };

    return {
      items: items.map((member) => {
        const lastActivityAt = resolveLastActivity(
          member,
          lastActivityMap.get(member.id) ?? null,
        );
        return this.mapStaff(member, {
          outletsCount:
            outletsCountMap.get(member.id) ??
            member.accesses.filter(
              (access) => access.status === StaffOutletAccessStatus.ACTIVE,
            ).length,
          lastActivityAt,
        });
      }),
      meta: this.buildMeta(paging, total),
      counters: {
        active,
        pending,
        suspended,
        fired,
        archived,
        portalEnabled,
      },
    };
  }

  async getStaff(merchantId: string, staffId: string) {
    const staff = await this.prisma.staff.findFirst({
      where: { merchantId, id: staffId },
      include: this.staffInclude(),
    });
    if (!staff) throw new NotFoundException('Сотрудник не найден');
    const accesses = await this.buildAccessViews(
      merchantId,
      staff.id,
      staff.accesses,
    );
    return this.mapStaff(staff, {
      accesses,
      outletsCount: accesses.filter(
        (access) => access.status === StaffOutletAccessStatus.ACTIVE,
      ).length,
      lastActivityAt: staff.lastActivityAt ?? null,
      lastPortalLoginAt: staff.lastPortalLoginAt ?? null,
    });
  }

  private async syncAccessGroups(
    tx: Prisma.TransactionClient,
    merchantId: string,
    staffId: string,
    targetGroupIds: string[] = [],
  ) {
    const groups = await tx.accessGroup.findMany({
      where: { merchantId, id: { in: targetGroupIds } },
    });
    if (targetGroupIds.length && groups.length !== targetGroupIds.length) {
      throw new BadRequestException('Некоторые группы доступа не найдены');
    }
    const existingMemberships = await tx.staffAccessGroup.findMany({
      where: { staffId },
    });
    const toRemove = existingMemberships
      .filter((m) => !targetGroupIds.includes(m.groupId))
      .map((m) => m.id);
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
      const outlets = await tx.outlet.findMany({
        where: { merchantId, id: { in: outletIds } },
      });
      if (outlets.length !== outletIds.length) {
        throw new BadRequestException('Некоторые торговые точки не найдены');
      }
    }
    const existing = await tx.staffOutletAccess.findMany({
      where: { merchantId, staffId },
    });
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
    const staffId = await this.prisma.$transaction(async (tx) => {
      const trimmedPassword = payload.password?.toString().trim() ?? '';
      if (trimmedPassword && trimmedPassword.length < 6) {
        throw new BadRequestException(
          'Пароль должен содержать минимум 6 символов',
        );
      }
      const email = normalizeEmailValue(payload.email) ?? undefined;
      const login = normalizeEmailValue(payload.login) ?? undefined;
      if (email) assertEmailFormat(email, 'Некорректный формат email');
      if (login) assertEmailFormat(login, 'Логин должен быть email');
      const loginValue = email || login;
      const portalRequested = Boolean(
        payload.portalAccessEnabled || payload.canAccessPortal || trimmedPassword,
      );
      if (portalRequested && !email) {
        throw new BadRequestException('Email обязателен для доступа в портал');
      }
      if (portalRequested && !trimmedPassword) {
        throw new BadRequestException('Пароль обязателен для доступа в портал');
      }
      const data: Prisma.StaffCreateInput = {
        merchant: { connect: { id: merchantId } },
        login: loginValue,
        email,
        phone: payload.phone?.trim() || undefined,
        firstName: payload.firstName?.trim() || undefined,
        lastName: payload.lastName?.trim() || undefined,
        position: payload.position?.trim() || undefined,
        comment: payload.comment?.trim() || undefined,
        avatarUrl: payload.avatarUrl?.trim() || undefined,
        role: payload.role ?? StaffRole.CASHIER,
        status: payload.status ?? StaffStatus.ACTIVE,
        canAccessPortal: payload.canAccessPortal ?? false,
        portalAccessEnabled: payload.portalAccessEnabled ?? false,
        portalState: payload.portalAccessEnabled ? 'ENABLED' : 'DISABLED',
      };
      if (trimmedPassword) {
        data.hash = hashPassword(trimmedPassword);
        data.canAccessPortal = true;
        data.portalAccessEnabled = true;
        data.portalState = 'ENABLED';
      }
      const staff = await tx.staff.create({
        data,
        include: this.staffInclude(),
      });

      await this.syncAccessGroups(
        tx,
        merchantId,
        staff.id,
        payload.accessGroupIds ?? [],
      );
      await this.syncOutlets(
        tx,
        merchantId,
        staff.id,
        payload.outletIds ?? [],
        payload.pinStrategy ?? 'KEEP',
      );

      try {
        this.logger.log(
          JSON.stringify({
            event: 'portal.staff.create',
            merchantId,
            staffId: staff.id,
            role: staff.role,
            portalAccessEnabled: staff.portalAccessEnabled,
          }),
        );
        this.metrics.inc('portal_staff_changed_total', { action: 'create' });
      } catch {}
      return staff.id;
    });
    return this.getStaff(merchantId, staffId);
  }

  async updateStaff(
    merchantId: string,
    staffId: string,
    payload: UpsertStaffPayload,
    actor?: PortalActorContext,
  ) {
    const staff = await this.prisma.staff.findFirst({
      where: { merchantId, id: staffId },
    });
    if (!staff) throw new NotFoundException('Сотрудник не найден');
    if (staff.isOwner) {
      if (
        payload.portalAccessEnabled === false ||
        payload.canAccessPortal === false
      ) {
        throw new ForbiddenException('Нельзя отключить доступ владельцу');
      }
      if (payload.status && payload.status !== StaffStatus.ACTIVE) {
        throw new ForbiddenException('Нельзя изменить статус владельца');
      }
    }
    const actorType = actor?.actor ? String(actor.actor).toUpperCase() : 'MERCHANT';
    const actorStaffId = actor?.staffId ? String(actor.staffId) : null;
    const actorRole = actor?.role ? String(actor.role).toUpperCase() : null;
    const isSelf =
      actorType === 'STAFF' && actorStaffId && actorStaffId === staffId;
    const isMerchantStaffActor =
      actorType === 'STAFF' && actorRole === 'MERCHANT';
    const canEditCredentials =
      actorType !== 'STAFF' || isSelf || isMerchantStaffActor;
    const emailProvided = payload.email !== undefined;
    const loginProvided = payload.login !== undefined;
    const normalizedEmail = emailProvided
      ? normalizeEmailValue(payload.email)
      : staff.email ?? null;
    const normalizedLogin = loginProvided
      ? normalizeEmailValue(payload.login)
      : staff.login ?? null;
    const emailChanged =
      emailProvided && normalizedEmail !== (staff.email ?? null);
    const loginChanged =
      loginProvided && normalizedLogin !== (staff.login ?? null);
    const passwordTouched = payload.password !== undefined;
    if (!canEditCredentials && (emailChanged || loginChanged || passwordTouched)) {
      throw new ForbiddenException('Недостаточно прав для смены логина или пароля');
    }
    if (emailChanged && normalizedEmail) {
      assertEmailFormat(normalizedEmail, 'Некорректный формат email');
    }
    if (loginChanged && normalizedLogin) {
      assertEmailFormat(normalizedLogin, 'Логин должен быть email');
    }
    const trimmedPassword = payload.password?.toString().trim() ?? undefined;
    const portalRequested =
      payload.portalAccessEnabled === true ||
      payload.canAccessPortal === true ||
      Boolean(trimmedPassword);
    if (portalRequested && !(emailProvided ? normalizedEmail : staff.email)) {
      throw new BadRequestException('Email обязателен для доступа в портал');
    }
    if (
      (payload.portalAccessEnabled === true || payload.canAccessPortal === true) &&
      !trimmedPassword &&
      !staff.hash
    ) {
      throw new BadRequestException('Пароль обязателен для доступа в портал');
    }
    const isMerchantStaff =
      staff.isOwner || staff.role === StaffRole.MERCHANT;
    if (isMerchantStaff && payload.accessGroupIds) {
      const existingGroups = await this.prisma.staffAccessGroup.findMany({
        where: { staffId },
        select: { groupId: true },
      });
      const existingIds = existingGroups
        .map((row) => String(row.groupId || '').trim())
        .filter(Boolean);
      const targetIds = payload.accessGroupIds
        .map((id) => String(id || '').trim())
        .filter(Boolean);
      const existingSet = new Set(existingIds);
      const targetSet = new Set(targetIds);
      const groupsChanged =
        existingSet.size !== targetSet.size ||
        Array.from(existingSet).some((id) => !targetSet.has(id));
      if (groupsChanged) {
        throw new ForbiddenException(
          'Нельзя менять группу доступа сотрудника-мерчанта',
        );
      }
    }
    if (isSelf && payload.accessGroupIds) {
      throw new ForbiddenException('Нельзя менять свою группу доступа');
    }

    await this.prisma.$transaction(async (tx) => {
      if (trimmedPassword && trimmedPassword.length < 6) {
        throw new BadRequestException(
          'Пароль должен содержать минимум 6 символов',
        );
      }

      if (trimmedPassword) {
        const currentPassword = payload.currentPassword?.toString() ?? '';
        const hash = staff.hash;
        const requiresCurrent = isSelf && Boolean(hash);
        if (requiresCurrent && !currentPassword) {
          throw new BadRequestException(
            'Текущий пароль обязателен для смены пароля',
          );
        }
        if (
          requiresCurrent &&
          currentPassword &&
          hash &&
          !verifyPassword(currentPassword, hash)
        ) {
          throw new BadRequestException('Текущий пароль указан неверно');
        }
      }

      const emailValue =
        payload.email !== undefined
          ? normalizeEmailValue(payload.email)
          : staff.email;
      const loginValue =
        payload.email !== undefined
          ? emailValue
          : loginProvided
            ? normalizeEmailValue(payload.login)
            : staff.login;
      const updateData: Prisma.StaffUpdateInput = {
        login: loginValue,
        email: emailValue,
        phone: payload.phone?.trim() ?? staff.phone,
        firstName: payload.firstName?.trim() ?? staff.firstName,
        lastName: payload.lastName?.trim() ?? staff.lastName,
        position: payload.position?.trim() ?? staff.position,
        comment: payload.comment?.trim() ?? staff.comment,
        avatarUrl:
          payload.avatarUrl !== undefined
            ? payload.avatarUrl?.trim() || null
            : staff.avatarUrl,
        role: payload.role ?? staff.role,
        status: payload.status ?? staff.status,
        canAccessPortal: payload.canAccessPortal ?? staff.canAccessPortal,
        portalAccessEnabled:
          payload.portalAccessEnabled ?? staff.portalAccessEnabled,
        portalState:
          payload.portalAccessEnabled === true
            ? 'ENABLED'
            : payload.portalAccessEnabled === false
              ? 'DISABLED'
              : staff.portalState,
      };

      const nextStatus = payload.status ?? staff.status;
      if (nextStatus === StaffStatus.FIRED) {
        updateData.canAccessPortal = false;
        updateData.portalAccessEnabled = false;
        updateData.portalState = 'DISABLED';
      }

      const portalAccessRevoked =
        payload.portalAccessEnabled === false ||
        payload.canAccessPortal === false ||
        nextStatus === StaffStatus.FIRED;
      const portalPasswordChanged = trimmedPassword !== undefined;

      if (trimmedPassword !== undefined) {
        if (trimmedPassword) {
          updateData.hash = hashPassword(trimmedPassword);
          updateData.canAccessPortal = true;
          updateData.portalAccessEnabled = true;
          updateData.portalState = 'ENABLED';
        } else {
          updateData.hash = null;
        }
      }

      if (portalAccessRevoked || portalPasswordChanged) {
        updateData.portalTokensRevokedAt = new Date();
        updateData.portalRefreshTokenHash = null;
      }

      await tx.staff.update({
        where: { id: staffId },
        data: updateData,
      });

      if (payload.accessGroupIds) {
        await this.syncAccessGroups(
          tx,
          merchantId,
          staffId,
          payload.accessGroupIds,
        );
      }
      if (payload.outletIds) {
        await this.syncOutlets(
          tx,
          merchantId,
          staffId,
          payload.outletIds,
          payload.pinStrategy ?? 'KEEP',
        );
      }

      try {
        this.logger.log(
          JSON.stringify({
            event: 'portal.staff.update',
            merchantId,
            staffId,
            role: payload.role ?? undefined,
            portalAccessEnabled: payload.portalAccessEnabled ?? undefined,
            status: payload.status ?? undefined,
          }),
        );
        this.metrics.inc('portal_staff_changed_total', { action: 'update' });
      } catch {}
    });
    return this.getStaff(merchantId, staffId);
  }

  async uploadStaffAvatar(
    merchantId: string,
    staffId: string,
    file: {
      buffer?: Buffer;
      mimetype?: string;
      originalname?: string;
      size?: number;
    },
  ) {
    if (!file || !file.buffer) {
      throw new BadRequestException('Файл не найден');
    }
    const staff = await this.prisma.staff.findFirst({
      where: { id: staffId, merchantId },
      select: { id: true },
    });
    if (!staff) throw new NotFoundException('Сотрудник не найден');
    const size = Number(file.size ?? file.buffer.length ?? 0);
    if (!Number.isFinite(size) || size <= 0) {
      throw new BadRequestException('Пустой файл');
    }
    if (size > this.maxAvatarBytes) {
      throw new BadRequestException('Размер файла не должен превышать 2MB');
    }
    const mimeType = String(file.mimetype || '').toLowerCase();
    if (!this.allowedAvatarMimeTypes.has(mimeType)) {
      throw new BadRequestException('Поддерживаются только PNG, JPG или WEBP');
    }
    const fileName =
      typeof file.originalname === 'string' && file.originalname.trim()
        ? file.originalname.trim()
        : this.defaultAvatarFileName(mimeType);

    const asset = await this.prisma.communicationAsset.create({
      data: {
        merchantId,
        channel: CommunicationChannel.INAPP,
        kind: 'AVATAR',
        fileName,
        mimeType,
        byteSize: size,
        data: file.buffer,
      },
      select: { id: true },
    });

    return { assetId: asset.id };
  }

  async getStaffAvatarAsset(merchantId: string, assetId: string) {
    const asset = await this.prisma.communicationAsset.findUnique({
      where: { id: assetId },
    });
    if (!asset || asset.merchantId !== merchantId) {
      throw new NotFoundException('Файл не найден');
    }
    if (asset.kind !== 'AVATAR') {
      throw new NotFoundException('Файл не найден');
    }
    return asset;
  }

  async changeStaffStatus(
    merchantId: string,
    staffId: string,
    status: StaffStatus,
  ) {
    const staff = await this.prisma.staff.findFirst({
      where: { merchantId, id: staffId },
    });
    if (!staff) throw new NotFoundException('Сотрудник не найден');
    if (staff.isOwner && status !== StaffStatus.ACTIVE) {
      throw new ForbiddenException('Нельзя отключить владельца');
    }
    const data: Prisma.StaffUpdateInput = { status };
    if (status === StaffStatus.FIRED) {
      data.canAccessPortal = false;
      data.portalAccessEnabled = false;
      data.portalState = 'DISABLED';
      data.portalTokensRevokedAt = new Date();
      data.portalRefreshTokenHash = null;
    }
    await this.prisma.staff.update({
      where: { id: staffId },
      data,
    });
    try {
      this.logger.log(
        JSON.stringify({
          event: 'portal.staff.status',
          merchantId,
          staffId,
          status,
        }),
      );
      this.metrics.inc('portal_staff_status_changed_total', { status });
    } catch {}
    return this.getStaff(merchantId, staffId);
  }

  async listStaffAccesses(merchantId: string, staffId: string) {
    const staff = await this.prisma.staff.findFirst({
      where: { merchantId, id: staffId },
      include: { accesses: { include: { outlet: true } } },
    });
    if (!staff) throw new NotFoundException('Сотрудник не найден');
    return this.buildAccessViews(merchantId, staff.id, staff.accesses);
  }

  async addStaffAccess(merchantId: string, staffId: string, outletId: string) {
    return this.prisma.$transaction(async (tx) => {
      const [staff, outlet] = await Promise.all([
        tx.staff.findFirst({ where: { merchantId, id: staffId } }),
        tx.outlet.findFirst({ where: { merchantId, id: outletId } }),
      ]);
      if (!staff) throw new NotFoundException('Сотрудник не найден');
      if (!outlet) throw new NotFoundException('Торговая точка не найдена');

      const existing = await tx.staffOutletAccess.findUnique({
        where: {
          merchantId_staffId_outletId: { merchantId, staffId, outletId },
        },
        include: { outlet: true },
      });

      const pin = await this.generateUniquePin(tx, merchantId, existing?.id);
      const record = await tx.staffOutletAccess.upsert({
        where: {
          merchantId_staffId_outletId: { merchantId, staffId, outletId },
        },
        update: {
          status: StaffOutletAccessStatus.ACTIVE,
          revokedAt: null,
          pinCode: pin,
          pinUpdatedAt: new Date(),
        },
        create: {
          merchantId,
          staffId,
          outletId,
          status: StaffOutletAccessStatus.ACTIVE,
          pinCode: pin,
        },
        include: { outlet: true },
      });

      try {
        this.logger.log(
          JSON.stringify({
            event: 'portal.staff.access.assign',
            merchantId,
            staffId,
            outletId,
          }),
        );
        this.metrics.inc('portal_staff_pin_events_total', { action: 'assign' });
      } catch {}

      const [view] = await this.buildAccessViews(merchantId, staffId, [record]);
      return view;
    });
  }

  async removeStaffAccess(
    merchantId: string,
    staffId: string,
    outletId: string,
  ) {
    const access = await this.prisma.staffOutletAccess.findUnique({
      where: { merchantId_staffId_outletId: { merchantId, staffId, outletId } },
    });
    if (!access) throw new NotFoundException('Доступ не найден');
    await this.prisma.staffOutletAccess.update({
      where: { id: access.id },
      data: { status: StaffOutletAccessStatus.REVOKED, revokedAt: new Date() },
    });
    try {
      this.logger.log(
        JSON.stringify({
          event: 'portal.staff.access.revoke',
          merchantId,
          staffId,
          outletId,
        }),
      );
      this.metrics.inc('portal_staff_pin_events_total', { action: 'revoke' });
    } catch {}
    return { ok: true };
  }

  async regenerateStaffOutletPin(
    merchantId: string,
    staffId: string,
    outletId: string,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const access = await tx.staffOutletAccess.findUnique({
        where: {
          merchantId_staffId_outletId: { merchantId, staffId, outletId },
        },
        include: { outlet: true },
      });
      if (!access) throw new NotFoundException('Доступ не найден');
      const pin = await this.generateUniquePin(tx, merchantId, access.id);
      const updated = await tx.staffOutletAccess.update({
        where: { id: access.id },
        data: {
          pinCode: pin,
          pinUpdatedAt: new Date(),
          status: StaffOutletAccessStatus.ACTIVE,
          revokedAt: null,
        },
        include: { outlet: true },
      });
      try {
        this.logger.log(
          JSON.stringify({
            event: 'portal.staff.pin.rotate',
            merchantId,
            staffId,
            outletId,
          }),
        );
        this.metrics.inc('portal_staff_pin_events_total', { action: 'rotate' });
      } catch {}
      const [view] = await this.buildAccessViews(merchantId, staffId, [
        updated,
      ]);
      return view;
    });
  }

  async rotateStaffPin(merchantId: string, accessId: string) {
    return this.prisma.$transaction(async (tx) => {
      const access = await tx.staffOutletAccess.findFirst({
        where: { merchantId, id: accessId },
      });
      if (!access) throw new NotFoundException('Доступ не найден');
      if (access.status !== StaffOutletAccessStatus.ACTIVE) {
        throw new BadRequestException(
          'PIN можно обновить только для активного доступа',
        );
      }
      const pin = await this.generateUniquePin(tx, merchantId, accessId);
      const updated = await tx.staffOutletAccess.update({
        where: { id: accessId },
        data: { pinCode: pin, pinUpdatedAt: new Date() },
        include: { outlet: true, staff: true },
      });
      try {
        this.logger.log(
          JSON.stringify({
            event: 'portal.staff.pin.rotate',
            merchantId,
            accessId,
            staffId: updated.staffId,
            outletId: updated.outletId,
          }),
        );
        this.metrics.inc('portal_staff_pin_events_total', { action: 'rotate' });
      } catch {}
      const [view] = await this.buildAccessViews(merchantId, updated.staffId, [
        updated,
      ]);
      return view;
    });
  }

  async revokeStaffPin(merchantId: string, accessId: string) {
    const updated = await this.prisma.staffOutletAccess.updateMany({
      where: {
        merchantId,
        id: accessId,
        status: StaffOutletAccessStatus.ACTIVE,
      },
      data: { status: StaffOutletAccessStatus.REVOKED, revokedAt: new Date() },
    });
    if (!updated.count)
      throw new NotFoundException('PIN не найден или уже отозван');
    try {
      this.logger.log(
        JSON.stringify({
          event: 'portal.staff.pin.revoke',
          merchantId,
          accessId,
        }),
      );
      this.metrics.inc('portal_staff_pin_events_total', { action: 'revoke' });
    } catch {}
    return { ok: true };
  }

  async listAccessGroups(
    merchantId: string,
    filters: AccessGroupFilters = {},
    pagination?: Partial<PaginationOptions>,
  ) {
    const paging = this.normalizePagination(pagination);
    const where: Prisma.AccessGroupWhereInput = { merchantId };
    if (filters.scope && filters.scope !== 'ALL') {
      where.scope = filters.scope;
    }
    if (filters.search) {
      const q = filters.search.trim();
      where.OR = [
        { name: { contains: q, mode: 'insensitive' } },
        { description: { contains: q, mode: 'insensitive' } },
      ];
    }
    const [items, total] = await this.prisma.$transaction([
      this.prisma.accessGroup.findMany({
        where,
        orderBy: [{ isSystem: 'asc' }, { createdAt: 'desc' }],
        include: {
          permissions: true,
          members: { select: { id: true } },
        },
        skip: (paging.page - 1) * paging.pageSize,
        take: paging.pageSize,
      }),
      this.prisma.accessGroup.count({ where }),
    ]);

    try {
      this.logger.log(
        JSON.stringify({
          event: 'portal.access-group.list',
          merchantId,
          scope: filters.scope,
          hasSearch: Boolean(filters.search),
          page: paging.page,
          pageSize: paging.pageSize,
          total,
        }),
      );
      this.metrics.inc('portal_access_group_list_total');
    } catch {}

    return {
      items: items.map((group) =>
        this.mapAccessGroup({ ...group, memberCount: group.members.length }),
      ),
      meta: this.buildMeta(paging, total),
    } as AccessGroupListResponseDtoModel;
  }

  async createAccessGroup(
    merchantId: string,
    payload: AccessGroupPayload,
    actorId?: string,
  ) {
    const group = await this.prisma.accessGroup.create({
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
    const mapped = this.mapAccessGroup({ ...group, memberCount: 0 });
    try {
      this.logger.log(
        JSON.stringify({
          event: 'portal.access-group.create',
          merchantId,
          groupId: mapped.id,
          permissions: mapped.permissions.length,
          actorId: actorId ?? null,
        }),
      );
      this.metrics.inc('portal_access_group_write_total', { action: 'create' });
    } catch {}
    return mapped;
  }

  async updateAccessGroup(
    merchantId: string,
    groupId: string,
    payload: AccessGroupPayload,
    actorId?: string,
  ) {
    const group = await this.prisma.accessGroup.findFirst({
      where: { merchantId, id: groupId },
    });
    if (!group) throw new NotFoundException('Группа не найдена');
    const nameLower = group.name.trim().toLowerCase();
    const isOwnerGroup =
      nameLower === 'владелец' ||
      nameLower === 'owner' ||
      nameLower === 'merchant';
    if (isOwnerGroup) {
      throw new ForbiddenException(
        'Нельзя редактировать группу доступа владельца',
      );
    }
    const updated = await this.prisma.$transaction(async (tx) => {
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
      const reloaded = await tx.accessGroup.findUnique({
        where: { id: groupId },
        include: { permissions: true, members: { select: { id: true } } },
      });
      return reloaded!;
    });
    const mapped = this.mapAccessGroup({
      ...updated,
      memberCount: updated.members.length,
    });
    try {
      this.logger.log(
        JSON.stringify({
          event: 'portal.access-group.update',
          merchantId,
          groupId: mapped.id,
          permissions: mapped.permissions.length,
          actorId: actorId ?? null,
        }),
      );
      this.metrics.inc('portal_access_group_write_total', { action: 'update' });
    } catch {}
    return mapped;
  }

  async getAccessGroup(merchantId: string, groupId: string) {
    const group = await this.prisma.accessGroup.findFirst({
      where: { merchantId, id: groupId },
      include: { permissions: true, members: { select: { id: true } } },
    });
    if (!group) throw new NotFoundException('Группа не найдена');
    return this.mapAccessGroup({ ...group, memberCount: group.members.length });
  }

  async deleteAccessGroup(merchantId: string, groupId: string) {
    const group = await this.prisma.accessGroup.findFirst({
      where: { merchantId, id: groupId },
    });
    if (!group) throw new NotFoundException('Группа не найдена');
    const nameLower = group.name.trim().toLowerCase();
    const isOwnerGroup =
      nameLower === 'владелец' ||
      nameLower === 'owner' ||
      nameLower === 'merchant';
    if (isOwnerGroup) {
      throw new ForbiddenException(
        'Нельзя удалить группу доступа владельца',
      );
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.staffAccessGroup.deleteMany({ where: { groupId } });
      await tx.accessGroupPermission.deleteMany({ where: { groupId } });
      await tx.accessGroup.delete({ where: { id: groupId } });
    });
    try {
      this.logger.log(
        JSON.stringify({
          event: 'portal.access-group.delete',
          merchantId,
          groupId,
        }),
      );
      this.metrics.inc('portal_access_group_write_total', { action: 'delete' });
    } catch {}
    return { ok: true };
  }

  async setGroupMembers(
    merchantId: string,
    groupId: string,
    staffIds: string[],
  ) {
    const group = await this.prisma.accessGroup.findFirst({
      where: { merchantId, id: groupId },
    });
    if (!group) throw new NotFoundException('Группа не найдена');
    const uniqueIds = Array.from(
      new Set(
        staffIds
          .map((id) => String(id || '').trim())
          .filter((id) => id.length > 0),
      ),
    );
    if (uniqueIds.length) {
      const staffRows = await this.prisma.staff.findMany({
        where: { merchantId, id: { in: uniqueIds } },
        select: { id: true },
      });
      const validIds = new Set(
        staffRows.map((row) => String(row.id)).filter(Boolean),
      );
      const invalid = uniqueIds.filter((id) => !validIds.has(id));
      if (invalid.length) {
        throw new BadRequestException('Сотрудники должны принадлежать мерчанту');
      }
    }
    const ownerRows = await this.prisma.staff.findMany({
      where: {
        merchantId,
        OR: [{ isOwner: true }, { role: StaffRole.MERCHANT }],
      },
      select: { id: true },
    });
    const ownerIds = ownerRows.map((row) => String(row.id)).filter(Boolean);
    const ownerIdSet = new Set(ownerIds);
    const nextMembers = staffIds.filter((id) => !ownerIdSet.has(id));
    let finalMembers = nextMembers;
    await this.prisma.$transaction(async (tx) => {
      if (ownerIds.length) {
        const existingOwnerMembers = await tx.staffAccessGroup.findMany({
          where: { groupId, staffId: { in: ownerIds } },
          select: { staffId: true },
        });
        const preserved = existingOwnerMembers
          .map((row) => String(row.staffId))
          .filter(Boolean);
        finalMembers = Array.from(new Set([...nextMembers, ...preserved]));
      }
      await tx.staffAccessGroup.deleteMany({ where: { groupId } });
      if (finalMembers.length) {
        await tx.staffAccessGroup.createMany({
          data: finalMembers.map((staffId) => ({
            merchantId,
            groupId,
            staffId,
          })),
        });
      }
    });
    try {
      this.logger.log(
        JSON.stringify({
          event: 'portal.access-group.members.set',
          merchantId,
          groupId,
          members: finalMembers.length,
        }),
      );
      this.metrics.inc('portal_access_group_write_total', {
        action: 'members',
      });
    } catch {}
    return { ok: true };
  }

  async listOutlets(
    merchantId: string,
    filters: OutletFilters = {},
    pagination?: Partial<PaginationOptions>,
  ) {
    const paging = this.normalizePagination(pagination);
    const where: Prisma.OutletWhereInput = { merchantId };
    if (filters.status && filters.status !== 'ALL') {
      where.status = filters.status;
    }
    if (filters.search) {
      where.OR = [
        { name: { contains: filters.search, mode: 'insensitive' } },
      ];
    }
    const [items, total] = await Promise.all([
      this.prisma.outlet.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (paging.page - 1) * paging.pageSize,
        take: paging.pageSize,
        include: {
          devices: {
            where: { archivedAt: null },
            orderBy: { createdAt: 'asc' },
          },
        },
      }),
      this.prisma.outlet.count({ where }),
    ]);

    const outletIds = items.map((outlet) => outlet.id);
    const staffCountMap = new Map<string, number>();
    if (outletIds.length) {
      const counts = await this.prisma.staffOutletAccess.groupBy({
        by: ['outletId'],
        where: {
          merchantId,
          outletId: { in: outletIds },
          status: StaffOutletAccessStatus.ACTIVE,
        },
        _count: { outletId: true },
      });
      counts.forEach((row) => {
        staffCountMap.set(row.outletId, row._count.outletId);
      });
    }

    return {
      items: items.map((outlet) =>
        this.mapOutlet({
          ...outlet,
          staffCount: staffCountMap.get(outlet.id) ?? 0,
        }),
      ),
      meta: this.buildMeta(paging, total),
    };
  }

  private async assertOutletLimit(merchantId: string) {
    const settings = await this.prisma.merchantSettings.findUnique({
      where: { merchantId },
      select: { maxOutlets: true },
    });
    const limit = settings?.maxOutlets ?? null;
    if (limit == null || limit <= 0) return;
    const count = await this.prisma.outlet.count({ where: { merchantId } });
    if (count >= limit) {
      throw new BadRequestException('Вы достигли лимита торговых точек.');
    }
  }

  async createOutlet(merchantId: string, payload: UpsertOutletPayload) {
    const outletName = payload.name?.trim();
    if (!outletName)
      throw new BadRequestException('Название обязательно');
    await this.assertOutletLimit(merchantId);
    const reviewLinksInput = this.sanitizeReviewLinksInput(
      payload.reviewsShareLinks,
    );
    const reviewLinksValue =
      reviewLinksInput && Object.keys(reviewLinksInput).length
        ? (reviewLinksInput as Prisma.InputJsonValue)
        : Prisma.JsonNull;
    const devices =
      payload.devices !== undefined
        ? this.normalizeDevicesInput(payload.devices)
        : [];
    const outlet = await this.prisma.$transaction(async (tx) => {
      const created = await tx.outlet.create({
        data: {
          merchantId,
          name: outletName,
          status: payload.works === false ? 'INACTIVE' : 'ACTIVE',
          reviewLinks: reviewLinksValue,
        },
      });
      if (payload.devices !== undefined) {
        await this.syncDevicesForOutlet(tx, merchantId, created.id, devices);
      }
      return created;
    });
    return this.mapOutlet(outlet as any);
  }

  async updateOutlet(
    merchantId: string,
    outletId: string,
    payload: UpsertOutletPayload,
  ) {
    const outlet = await this.prisma.outlet.findFirst({
      where: { merchantId, id: outletId },
    });
    if (!outlet) throw new NotFoundException('Точка не найдена');
    const reviewLinksInput = this.sanitizeReviewLinksInput(
      payload.reviewsShareLinks,
    );
    const reviewLinksValue =
      reviewLinksInput !== undefined
        ? Object.keys(reviewLinksInput).length
          ? (reviewLinksInput as Prisma.InputJsonValue)
          : Prisma.JsonNull
        : undefined;
    const devices =
      payload.devices !== undefined
        ? this.normalizeDevicesInput(payload.devices)
        : null;
    const updated = await this.prisma.$transaction(async (tx) => {
      const updatedOutlet = await tx.outlet.update({
        where: { id: outletId },
        data: {
          name: payload.name?.trim() || outlet.name,
          status:
            payload.works === undefined
              ? outlet.status
              : payload.works
                ? 'ACTIVE'
                : 'INACTIVE',
          reviewLinks: reviewLinksValue,
        },
      });
      if (devices !== null) {
        await this.syncDevicesForOutlet(tx, merchantId, outletId, devices);
      }
      return updatedOutlet;
    });
    return this.mapOutlet(updated as any);
  }

  async getOutlet(merchantId: string, outletId: string) {
    const outlet = await this.prisma.outlet.findFirst({
      where: { merchantId, id: outletId },
      include: {
        devices: {
          where: { archivedAt: null },
          orderBy: { createdAt: 'asc' },
        },
      },
    });
    if (!outlet) throw new NotFoundException('Точка не найдена');
    return this.mapOutlet(outlet as any);
  }

  async deleteOutlet(merchantId: string, outletId: string) {
    return this.merchants.deleteOutlet(merchantId, outletId);
  }

  async listCashierPins(merchantId: string) {
    const accesses = await this.prisma.staffOutletAccess.findMany({
      where: {
        merchantId,
        status: StaffOutletAccessStatus.ACTIVE,
        staff: { status: StaffStatus.ACTIVE },
      },
      include: {
        staff: true,
        outlet: true,
      },
      orderBy: { createdAt: 'desc' },
    });
    return accesses.map((access) => ({
      id: access.id,
      staffId: access.staffId,
      staffName:
        `${access.staff?.firstName ?? ''} ${access.staff?.lastName ?? ''}`.trim(),
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

  listCashierActivationCodes(merchantId: string) {
    return this.merchants.listCashierActivationCodes(merchantId);
  }

  issueCashierActivationCodes(merchantId: string, count: number) {
    return this.merchants.issueCashierActivationCodes(merchantId, count);
  }

  revokeCashierActivationCode(merchantId: string, codeId: string) {
    return this.merchants.revokeCashierActivationCode(merchantId, codeId);
  }

  listCashierDeviceSessions(merchantId: string) {
    return this.merchants.listCashierDeviceSessions(merchantId);
  }

  revokeCashierDeviceSession(merchantId: string, sessionId: string) {
    return this.merchants.revokeCashierDeviceSession(merchantId, sessionId);
  }
}
