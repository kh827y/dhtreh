import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { AccessScope, Prisma, StaffRole } from '@prisma/client';
import { PrismaService } from '../../core/prisma/prisma.service';
import { MetricsService } from '../../core/metrics/metrics.service';
import { logIgnoredError } from '../../shared/logging/ignore-error.util';
import type {
  AccessGroupDto as AccessGroupDtoModel,
  AccessGroupListResponseDto as AccessGroupListResponseDtoModel,
  AccessGroupPermissionDto as AccessGroupPermissionDtoModel,
} from './dto/access-group.dto';
import type {
  AccessGroupFilters,
  AccessGroupPayload,
} from './merchant-panel.types';

@Injectable()
export class MerchantPanelAccessGroupsService {
  private readonly logger = new Logger(MerchantPanelAccessGroupsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly metrics: MetricsService,
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

  private normalizePagination(pagination?: {
    page?: number;
    pageSize?: number;
  }) {
    const page = Math.max(1, Math.floor(pagination?.page ?? 1));
    const pageSize = Math.max(
      1,
      Math.min(200, Math.floor(pagination?.pageSize ?? 20)),
    );
    return { page, pageSize };
  }

  private buildMeta(
    pagination: { page: number; pageSize: number },
    total: number,
  ) {
    const totalPages = Math.max(1, Math.ceil(total / pagination.pageSize));
    return {
      page: pagination.page,
      pageSize: pagination.pageSize,
      total,
      totalPages,
    };
  }

  private mapAccessGroup(
    group: Prisma.AccessGroupGetPayload<object> & {
      permissions?: Prisma.AccessGroupPermissionGetPayload<object>[];
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
      } catch (err) {
        logIgnoredError(
          err,
          'MerchantPanelAccessGroupsService normalizeConditions',
          this.logger,
          'debug',
        );
        return null;
      }
    };
    const permissions = (group.permissions ?? []).map((permission) => ({
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

  async listAccessGroups(
    merchantId: string,
    filters: AccessGroupFilters = {},
    pagination?: { page?: number; pageSize?: number },
  ): Promise<AccessGroupListResponseDtoModel> {
    const paging = this.normalizePagination(pagination);
    const where: Prisma.AccessGroupWhereInput = { merchantId };
    if (filters.scope && filters.scope !== 'ALL') {
      where.scope = filters.scope as AccessScope;
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
    } catch (err) {
      this.logPortalEventFailure('portal.access-group.list', err, {
        merchantId,
      });
    }

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
                conditions: permission.conditions ?? Prisma.DbNull,
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
    } catch (err) {
      this.logPortalEventFailure('portal.access-group.create', err, {
        merchantId,
        groupId: mapped.id,
      });
    }
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
            conditions: permission.conditions ?? Prisma.DbNull,
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
    } catch (err) {
      this.logPortalEventFailure('portal.access-group.update', err, {
        merchantId,
        groupId: mapped.id,
      });
    }
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
      throw new ForbiddenException('Нельзя удалить группу доступа владельца');
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
    } catch (err) {
      this.logPortalEventFailure('portal.access-group.delete', err, {
        merchantId,
        groupId,
      });
    }
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
        throw new BadRequestException(
          'Сотрудники должны принадлежать мерчанту',
        );
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
    } catch (err) {
      this.logPortalEventFailure('portal.access-group.members.set', err, {
        merchantId,
        groupId,
        memberCount: finalMembers.length,
      });
    }
    return { ok: true };
  }
}
