import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import {
  AccessScope,
  Prisma,
  StaffOutletAccessStatus,
  StaffRole,
  StaffStatus,
} from '@prisma/client';
import { MerchantsService } from '../merchants/merchants.service';
import { PrismaService } from '../prisma.service';
import { MetricsService } from '../metrics.service';
import { hashPassword, verifyPassword } from '../password.util';
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

interface AccessGroupPreset {
  key: string;
  name: string;
  description?: string;
  scope: AccessScope;
  isSystem: boolean;
  isDefault: boolean;
  permissions: Array<{ resource: string; action: string; conditions?: any }>;
}

type CrudAction = 'create' | 'read' | 'update' | 'delete';

const DEFAULT_CRUD_ACTIONS: CrudAction[] = [
  'create',
  'read',
  'update',
  'delete',
];

function crudPermissions(
  resource: string,
  actions: CrudAction[] = DEFAULT_CRUD_ACTIONS,
) {
  return actions.map((action) => ({ resource, action }));
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
  schedule?: {
    mode: '24_7' | 'CUSTOM';
    days: Array<{
      day: number;
      enabled: boolean;
      opensAt?: string | null;
      closesAt?: string | null;
    }>;
  };
  externalId?: string | null;
  integrationProvider?: string | null;
  integrationLocationCode?: string | null;
  reviewsShareLinks?: unknown;
  manualLocation?: boolean;
  latitude?: number | null;
  longitude?: number | null;
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

  constructor(
    private readonly prisma: PrismaService,
    private readonly merchants: MerchantsService,
    private readonly metrics: MetricsService,
  ) {}

  private readonly defaultAccessGroupPresets: AccessGroupPreset[] = [
    {
      key: 'owner',
      name: 'Владелец',
      description: 'Полный доступ ко всем разделам портала',
      scope: AccessScope.PORTAL,
      isSystem: true,
      isDefault: true,
      permissions: [
        ...crudPermissions('staff'),
        ...crudPermissions('outlets'),
        ...crudPermissions('loyalty'),
        ...crudPermissions('analytics'),
      ],
    },
    {
      key: 'manager',
      name: 'Менеджер',
      description: 'Работа с сотрудниками и программой лояльности',
      scope: AccessScope.PORTAL,
      isSystem: false,
      isDefault: false,
      permissions: [
        ...crudPermissions('staff', ['read', 'update']),
        ...crudPermissions('outlets', ['read', 'update']),
        ...crudPermissions('loyalty', ['create', 'read', 'update']),
        ...crudPermissions('analytics', ['read']),
      ],
    },
    {
      key: 'analyst',
      name: 'Аналитик',
      description: 'Доступ только на чтение для отчётности',
      scope: AccessScope.PORTAL,
      isSystem: false,
      isDefault: false,
      permissions: [
        ...crudPermissions('analytics', ['read']),
        ...crudPermissions('loyalty', ['read']),
      ],
    },
    {
      key: 'cashier',
      name: 'Кассир',
      description: 'Доступ к операциям на точке продаж',
      scope: AccessScope.CASHIER,
      isSystem: false,
      isDefault: false,
      permissions: [...crudPermissions('loyalty', ['read'])],
    },
  ];

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

  private async ensureDefaultAccessGroups(merchantId: string) {
    const existing = await this.prisma.accessGroup.findMany({
      where: { merchantId },
      select: { id: true, name: true, scope: true },
    });
    const existingKeys = new Set(
      existing.map(
        (group) => `${group.scope}:${group.name.trim().toLowerCase()}`,
      ),
    );
    const missingPresets = this.defaultAccessGroupPresets.filter((preset) => {
      const key = `${preset.scope}:${preset.name.trim().toLowerCase()}`;
      return !existingKeys.has(key);
    });
    if (!missingPresets.length) return;

    let created = 0;
    await this.prisma.$transaction(async (tx) => {
      for (const preset of missingPresets) {
        try {
          const createdGroup = await tx.accessGroup.create({
            data: {
              merchantId,
              name: preset.name,
              description: preset.description ?? null,
              scope: preset.scope,
              isSystem: preset.isSystem,
              isDefault: preset.isDefault,
              metadata: {
                bootstrap: true,
                presetKey: preset.key,
              } as Prisma.JsonObject,
            },
          });
          if (preset.permissions.length) {
            await tx.accessGroupPermission.createMany({
              data: preset.permissions.map((permission) => ({
                groupId: createdGroup.id,
                resource: permission.resource,
                action: permission.action,
                conditions: permission.conditions ?? null,
              })),
            });
          }
          created += 1;
        } catch (error: unknown) {
          if (
            error instanceof Prisma.PrismaClientKnownRequestError &&
            (error.code === 'P2002' || error.code === 'P2003')
          ) {
            continue;
          }
          throw error;
        }
      }
    });

    if (created > 0) {
      try {
        this.logger.log(
          JSON.stringify({
            event: 'portal.access-group.bootstrap',
            merchantId,
            created,
          }),
        );
        this.metrics.inc('portal_access_group_bootstrap_total', {}, created);
      } catch {}
    }
  }

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
      role: member.role,
      status: member.status,
      portalAccessEnabled: member.portalAccessEnabled,
      canAccessPortal: member.canAccessPortal,
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

  private parseSchedule(schedule: any) {
    if (!schedule || typeof schedule !== 'object') return null;
    const days = Array.isArray(schedule.days) ? schedule.days : [];
    return {
      mode: schedule.mode ?? 'CUSTOM',
      days: days.map((day: any) => ({
        day:
          typeof day.day === 'number' ? day.day : parseInt(day.day ?? '0', 10),
        enabled: !!day.enabled,
        opensAt: day.opensAt ?? day.from ?? null,
        closesAt: day.closesAt ?? day.to ?? null,
      })),
    };
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

  private mapOutlet(outlet: Prisma.OutletGetPayload<undefined>) {
    const schedule = this.parseSchedule(outlet.scheduleJson ?? undefined);
    return {
      id: outlet.id,
      name: outlet.name,
      description: outlet.description,
      address: outlet.address,
      phone: outlet.phone,
      adminEmails: outlet.adminEmails ?? [],
      status: outlet.status,
      hidden: outlet.hidden,
      scheduleEnabled: outlet.scheduleEnabled,
      scheduleMode: schedule?.mode ?? 'CUSTOM',
      schedule: schedule?.days ?? null,
      timezone: outlet.timezone,
      externalId: outlet.externalId,
      integrationProvider: outlet.integrationProvider,
      integrationLocationCode: outlet.integrationLocationCode,
      manualLocation: outlet.manualLocation,
      latitude: outlet.latitude ? Number(outlet.latitude) : null,
      longitude: outlet.longitude ? Number(outlet.longitude) : null,
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
        where: { merchantId, portalAccessEnabled: true },
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

    return {
      items: items.map((member) =>
        this.mapStaff(member, {
          outletsCount:
            outletsCountMap.get(member.id) ??
            member.accesses.filter(
              (access) => access.status === StaffOutletAccessStatus.ACTIVE,
            ).length,
          lastActivityAt:
            lastActivityMap.get(member.id) ?? member.lastActivityAt ?? null,
        }),
      ),
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
      const data: Prisma.StaffCreateInput = {
        merchant: { connect: { id: merchantId } },
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
    await this.prisma.$transaction(async (tx) => {
      const trimmedPassword = payload.password?.toString().trim() ?? undefined;
      if (trimmedPassword && trimmedPassword.length < 6) {
        throw new BadRequestException(
          'Пароль должен содержать минимум 6 символов',
        );
      }

      if (trimmedPassword) {
        const currentPassword = payload.currentPassword?.toString() ?? '';
        if (staff.hash && !currentPassword) {
          throw new BadRequestException(
            'Текущий пароль обязателен для смены пароля',
          );
        }
        if (
          staff.hash &&
          currentPassword &&
          !verifyPassword(currentPassword, staff.hash)
        ) {
          throw new BadRequestException('Текущий пароль указан неверно');
        }
      }

      const updateData: Prisma.StaffUpdateInput = {
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
        portalAccessEnabled:
          payload.portalAccessEnabled ?? staff.portalAccessEnabled,
        portalState:
          payload.portalAccessEnabled === true
            ? 'ENABLED'
            : payload.portalAccessEnabled === false
              ? 'DISABLED'
              : staff.portalState,
      };

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
    await this.prisma.staff.update({
      where: { id: staffId },
      data: { status },
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
    await this.ensureDefaultAccessGroups(merchantId);
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
    if (group.isSystem)
      throw new ForbiddenException('Нельзя редактировать системную группу');
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
    if (group.isSystem)
      throw new ForbiddenException('Нельзя удалить системную группу');
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
    await this.prisma.$transaction(async (tx) => {
      await tx.staffAccessGroup.deleteMany({ where: { groupId } });
      if (staffIds.length) {
        await tx.staffAccessGroup.createMany({
          data: staffIds.map((staffId) => ({ merchantId, groupId, staffId })),
        });
      }
    });
    try {
      this.logger.log(
        JSON.stringify({
          event: 'portal.access-group.members.set',
          merchantId,
          groupId,
          members: staffIds.length,
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
    if (filters.hidden != null) {
      where.hidden = filters.hidden;
    }
    if (filters.search) {
      where.OR = [
        { name: { contains: filters.search, mode: 'insensitive' } },
        { address: { contains: filters.search, mode: 'insensitive' } },
      ];
    }
    const [items, total] = await this.prisma.$transaction([
      this.prisma.outlet.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (paging.page - 1) * paging.pageSize,
        take: paging.pageSize,
      }),
      this.prisma.outlet.count({ where }),
    ]);

    return {
      items: items.map((outlet) => this.mapOutlet(outlet)),
      meta: this.buildMeta(paging, total),
    };
  }

  private buildScheduleJson(payload: UpsertOutletPayload['schedule']) {
    if (!payload) return null;
    return {
      mode: payload.mode,
      days: payload.days.map((day) => ({
        day: day.day,
        enabled: !!day.enabled,
        opensAt: day.opensAt ?? null,
        closesAt: day.closesAt ?? null,
      })),
    };
  }

  async createOutlet(merchantId: string, payload: UpsertOutletPayload) {
    if (!payload.name?.trim())
      throw new BadRequestException('Название обязательно');
    const reviewLinksInput = this.sanitizeReviewLinksInput(
      payload.reviewsShareLinks,
    );
    const reviewLinksValue =
      reviewLinksInput && Object.keys(reviewLinksInput).length
        ? (reviewLinksInput as Prisma.InputJsonValue)
        : Prisma.JsonNull;
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
        scheduleJson:
          payload.schedule != null
            ? (this.buildScheduleJson(
                payload.schedule,
              ) as Prisma.InputJsonValue)
            : (Prisma.DbNull as Prisma.NullableJsonNullValueInput),
        externalId: payload.externalId ?? null,
        integrationProvider: payload.integrationProvider ?? null,
        integrationLocationCode: payload.integrationLocationCode ?? null,
        reviewLinks: reviewLinksValue,
        manualLocation: payload.manualLocation ?? false,
        latitude:
          payload.latitude != null
            ? new Prisma.Decimal(payload.latitude)
            : null,
        longitude:
          payload.longitude != null
            ? new Prisma.Decimal(payload.longitude)
            : null,
      },
    });
    return this.mapOutlet(outlet);
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
    const updated = await this.prisma.outlet.update({
      where: { id: outletId },
      data: {
        name: payload.name?.trim() || outlet.name,
        description: payload.description?.trim() ?? outlet.description,
        address: payload.address?.trim() ?? outlet.address,
        phone: payload.phone?.trim() ?? outlet.phone,
        adminEmails: payload.adminEmails ?? outlet.adminEmails,
        status:
          payload.works === undefined
            ? outlet.status
            : payload.works
              ? 'ACTIVE'
              : 'INACTIVE',
        hidden: payload.hidden ?? outlet.hidden,
        timezone: payload.timezone ?? outlet.timezone,
        scheduleEnabled:
          payload.schedule != null ? true : outlet.scheduleEnabled,
        scheduleJson: payload.schedule
          ? (this.buildScheduleJson(payload.schedule) as Prisma.InputJsonValue)
          : undefined,
        externalId: payload.externalId ?? outlet.externalId,
        integrationProvider:
          payload.integrationProvider ?? outlet.integrationProvider,
        integrationLocationCode:
          payload.integrationLocationCode ?? outlet.integrationLocationCode,
        reviewLinks: reviewLinksValue,
        manualLocation: payload.manualLocation ?? outlet.manualLocation,
        latitude:
          payload.latitude != null
            ? new Prisma.Decimal(payload.latitude)
            : outlet.latitude,
        longitude:
          payload.longitude != null
            ? new Prisma.Decimal(payload.longitude)
            : outlet.longitude,
      },
    });
    return this.mapOutlet(updated);
  }

  async getOutlet(merchantId: string, outletId: string) {
    const outlet = await this.prisma.outlet.findFirst({
      where: { merchantId, id: outletId },
    });
    if (!outlet) throw new NotFoundException('Точка не найдена');
    return this.mapOutlet(outlet);
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
}
