import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, StaffOutletAccessStatus } from '@prisma/client';
import { PrismaService } from '../../core/prisma/prisma.service';
import { MerchantsService } from '../merchants/merchants.service';
import {
  normalizeDeviceCode,
  ensureUniqueDeviceCodes,
  type NormalizedDeviceCode,
} from '../../shared/devices/device.util';
import type { OutletFilters, UpsertOutletPayload } from './merchant-panel.types';

@Injectable()
export class MerchantPanelOutletsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly merchants: MerchantsService,
  ) {}

  private normalizePagination(pagination?: { page?: number; pageSize?: number }) {
    const page = Math.max(1, Math.floor(pagination?.page ?? 1));
    const pageSize = Math.max(1, Math.min(200, Math.floor(pagination?.pageSize ?? 20)));
    return { page, pageSize };
  }

  private buildMeta(pagination: { page: number; pageSize: number }, total: number) {
    const totalPages = Math.max(1, Math.ceil(total / pagination.pageSize));
    return {
      page: pagination.page,
      pageSize: pagination.pageSize,
      total,
      totalPages,
    };
  }

  private sanitizeReviewLinksInput(input?: unknown) {
    if (!input || typeof input !== 'object') return undefined;
    const result: Record<string, string> = {};
    for (const [rawKey, rawValue] of Object.entries(
      input as Record<string, unknown>,
    )) {
      const key = String(rawKey || '').toLowerCase().trim();
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
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      return {} as Record<string, string>;
    }
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

  private mapDevices(devices?: Prisma.DeviceGetPayload<object>[]) {
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
    outlet: Prisma.OutletGetPayload<object> & {
      devices?: Prisma.DeviceGetPayload<object>[];
      staffCount?: number;
    },
  ) {
    return {
      id: outlet.id,
      name: outlet.name,
      status: outlet.status,
      staffCount: typeof outlet.staffCount === 'number' ? outlet.staffCount : 0,
      devices: this.mapDevices(outlet.devices),
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

  async listOutlets(
    merchantId: string,
    filters: OutletFilters = {},
    pagination?: { page?: number; pageSize?: number },
  ) {
    const paging = this.normalizePagination(pagination);
    const where: Prisma.OutletWhereInput = { merchantId };
    if (filters.status && filters.status !== 'ALL') {
      where.status = filters.status;
    }
    if (filters.search) {
      where.OR = [{ name: { contains: filters.search, mode: 'insensitive' } }];
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
    if (!outletName) throw new BadRequestException('Название обязательно');
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
    return this.mapOutlet(updated);
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
    return this.mapOutlet(outlet);
  }

  async deleteOutlet(merchantId: string, outletId: string) {
    return this.merchants.deleteOutlet(merchantId, outletId);
  }
}
