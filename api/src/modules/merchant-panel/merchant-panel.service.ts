import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import {
  CommunicationChannel,
  Prisma,
  StaffOutletAccessStatus,
  StaffRole,
  StaffStatus,
} from '@prisma/client';
import { PrismaService } from '../../core/prisma/prisma.service';
import { MetricsService } from '../../core/metrics/metrics.service';
import { hashPassword, verifyPassword } from '../../shared/password.util';
import { LookupCacheService } from '../../core/cache/lookup-cache.service';
import { logIgnoredError } from '../../shared/logging/ignore-error.util';
import { MerchantPanelAccessGroupsService } from './merchant-panel-access-groups.service';
import { MerchantPanelOutletsService } from './merchant-panel-outlets.service';
import { MerchantPanelCashierService } from './merchant-panel-cashier.service';
import type {
  AccessGroupFilters,
  AccessGroupPayload,
  OutletFilters,
  StaffFilters,
  UpsertOutletPayload,
  UpsertStaffPayload,
} from './merchant-panel.types';

export * from './merchant-panel.types';

type PaginationOptions = {
  page: number;
  pageSize: number;
};

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
    private readonly metrics: MetricsService,
    private readonly cache: LookupCacheService,
    private readonly accessGroups: MerchantPanelAccessGroupsService,
    private readonly outlets: MerchantPanelOutletsService,
    private readonly cashiers: MerchantPanelCashierService,
  ) {}

  private logPortalEventFailure(
    event: string,
    err: unknown,
    context?: Record<string, unknown>,
  ) {
    logIgnoredError(
      err,
      `portal event failed (${event})`,
      this.logger,
      'debug',
      context,
    );
  }

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
      } catch (err) {
        this.logPortalEventFailure('portal.staff.access.groupBy', err, {
          merchantId,
          staffId,
          outletCount: outletIds.length,
        });
      }
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
      const accessCounts: Array<{
        staffId: string;
        _count: { _all: number };
      }> = await this.prisma.staffOutletAccess
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
        );
      const txnGroups: Array<{
        staffId: string | null;
        _max: { createdAt: Date | null };
      }> = await this.prisma.transaction
        .groupBy({
          by: ['staffId'],
          where: { merchantId, staffId: { in: staffIds } },
          _max: { createdAt: true },
        })
        .catch(
          () =>
            [] as Array<{
              staffId: string | null;
              _max: { createdAt: Date | null };
            }>,
        );
      outletsCountMap = new Map<string, number>(
        accessCounts.map((row): [string, number] => [
          row.staffId,
          row._count?._all ?? 0,
        ]),
      );
      lastActivityMap = new Map<string, Date | null>(
        txnGroups
          .filter(
            (
              row,
            ): row is { staffId: string; _max: { createdAt: Date | null } } =>
              Boolean(row.staffId),
          )
          .map((row): [string, Date | null] => [
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
    } catch (err) {
      this.logPortalEventFailure('portal.staff.list', err, { merchantId });
    }

    const resolveLastActivity = (
      member: (typeof items)[number],
      transactionDate: Date | null,
    ) => {
      const candidates = [
        transactionDate,
        member.lastActivityAt ?? null,
        member.lastPortalLoginAt ?? null,
      ].filter(Boolean) as Date[];
      if (!candidates.length) return null;
      return new Date(Math.max(...candidates.map((value) => value.getTime())));
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
        payload.portalAccessEnabled ||
          payload.canAccessPortal ||
          trimmedPassword,
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
      } catch (err) {
        this.logPortalEventFailure('portal.staff.create', err, {
          merchantId,
          staffId: staff.id,
        });
      }
      return staff.id;
    });
    this.cache.invalidateStaff(merchantId, staffId);
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
    const actorType = actor?.actor
      ? String(actor.actor).toUpperCase()
      : 'MERCHANT';
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
      : (staff.email ?? null);
    const normalizedLogin = loginProvided
      ? normalizeEmailValue(payload.login)
      : (staff.login ?? null);
    const emailChanged =
      emailProvided && normalizedEmail !== (staff.email ?? null);
    const loginChanged =
      loginProvided && normalizedLogin !== (staff.login ?? null);
    const passwordTouched = payload.password !== undefined;
    if (
      !canEditCredentials &&
      (emailChanged || loginChanged || passwordTouched)
    ) {
      throw new ForbiddenException(
        'Недостаточно прав для смены логина или пароля',
      );
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
      (payload.portalAccessEnabled === true ||
        payload.canAccessPortal === true) &&
      !trimmedPassword &&
      !staff.hash
    ) {
      throw new BadRequestException('Пароль обязателен для доступа в портал');
    }
    const isMerchantStaff = staff.isOwner || staff.role === StaffRole.MERCHANT;
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
      } catch (err) {
        this.logPortalEventFailure('portal.staff.update', err, {
          merchantId,
          staffId,
        });
      }
    });
    this.cache.invalidateStaff(merchantId, staffId);
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
    } catch (err) {
      this.logPortalEventFailure('portal.staff.status', err, {
        merchantId,
        staffId,
        status,
      });
    }
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
    const view = await this.prisma.$transaction(async (tx) => {
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
      } catch (err) {
        this.logPortalEventFailure('portal.staff.access.assign', err, {
          merchantId,
          staffId,
          outletId,
        });
      }

      const [view] = await this.buildAccessViews(merchantId, staffId, [record]);
      return view;
    });
    this.cache.invalidateStaff(merchantId, staffId);
    return view;
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
    } catch (err) {
      this.logPortalEventFailure('portal.staff.access.revoke', err, {
        merchantId,
        staffId,
        outletId,
      });
    }
    this.cache.invalidateStaff(merchantId, staffId);
    return { ok: true };
  }

  async regenerateStaffOutletPin(
    merchantId: string,
    staffId: string,
    outletId: string,
  ) {
    const view = await this.prisma.$transaction(async (tx) => {
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
      } catch (err) {
        this.logPortalEventFailure('portal.staff.pin.rotate', err, {
          merchantId,
          staffId,
          outletId,
        });
      }
      const [view] = await this.buildAccessViews(merchantId, staffId, [
        updated,
      ]);
      return view;
    });
    this.cache.invalidateStaff(merchantId, staffId);
    return view;
  }

  async rotateStaffPin(merchantId: string, accessId: string) {
    const result = await this.prisma.$transaction(async (tx) => {
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
      } catch (err) {
        this.logPortalEventFailure('portal.staff.pin.rotate', err, {
          merchantId,
          accessId,
          staffId: updated.staffId,
          outletId: updated.outletId,
        });
      }
      const [view] = await this.buildAccessViews(merchantId, updated.staffId, [
        updated,
      ]);
      return { view, staffId: updated.staffId };
    });
    this.cache.invalidateStaff(merchantId, result.staffId);
    return result.view;
  }

  async revokeStaffPin(merchantId: string, accessId: string) {
    const access = await this.prisma.staffOutletAccess.findFirst({
      where: { merchantId, id: accessId },
      select: { staffId: true },
    });
    if (!access) throw new NotFoundException('PIN не найден или уже отозван');
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
    } catch (err) {
      this.logPortalEventFailure('portal.staff.pin.revoke', err, {
        merchantId,
        accessId,
      });
    }
    this.cache.invalidateStaff(merchantId, access.staffId);
    return { ok: true };
  }

  listAccessGroups(
    merchantId: string,
    filters: AccessGroupFilters = {},
    pagination?: Partial<PaginationOptions>,
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
    pagination?: Partial<PaginationOptions>,
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
