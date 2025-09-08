import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { UpdateDeviceDto, UpdateOutletDto, UpdateStaffDto } from './dto';

@Injectable()
export class MerchantsService {
  constructor(private prisma: PrismaService) {}

  async getSettings(merchantId: string) {
    const merchant = await this.prisma.merchant.findUnique({
      where: { id: merchantId },
      include: { settings: true },
    });
    if (!merchant) throw new NotFoundException('Merchant not found');
    const s = merchant.settings ?? { earnBps: 500, redeemLimitBps: 5000, qrTtlSec: 120 } as any;
    return {
      merchantId,
      earnBps: s.earnBps,
      redeemLimitBps: s.redeemLimitBps,
      qrTtlSec: s.qrTtlSec,
      webhookUrl: s.webhookUrl ?? null,
      webhookSecret: s.webhookSecret ?? null,
      webhookKeyId: s.webhookKeyId ?? null,
      redeemCooldownSec: s.redeemCooldownSec ?? 0,
      earnCooldownSec: s.earnCooldownSec ?? 0,
      redeemDailyCap: s.redeemDailyCap ?? null,
      earnDailyCap: s.earnDailyCap ?? null,
    };
  }

  async updateSettings(merchantId: string, earnBps: number, redeemLimitBps: number, qrTtlSec?: number, webhookUrl?: string, webhookSecret?: string, webhookKeyId?: string, redeemCooldownSec?: number, earnCooldownSec?: number, redeemDailyCap?: number, earnDailyCap?: number) {
    // убедимся, что мерчант есть
    await this.prisma.merchant.upsert({
      where: { id: merchantId },
      update: {},
      create: { id: merchantId, name: merchantId },
    });

    const updated = await this.prisma.merchantSettings.upsert({
      where: { merchantId },
      update: {
        earnBps,
        redeemLimitBps,
        qrTtlSec: qrTtlSec ?? undefined,
        webhookUrl,
        webhookSecret,
        webhookKeyId,
        redeemCooldownSec: redeemCooldownSec ?? undefined,
        earnCooldownSec: earnCooldownSec ?? undefined,
        redeemDailyCap: redeemDailyCap ?? undefined,
        earnDailyCap: earnDailyCap ?? undefined,
        updatedAt: new Date(),
      },
      create: {
        merchantId,
        earnBps,
        redeemLimitBps,
        qrTtlSec: qrTtlSec ?? 120,
        webhookUrl: webhookUrl ?? null,
        webhookSecret: webhookSecret ?? null,
        webhookKeyId: webhookKeyId ?? null,
        redeemCooldownSec: redeemCooldownSec ?? 0,
        earnCooldownSec: earnCooldownSec ?? 0,
        redeemDailyCap: redeemDailyCap ?? null,
        earnDailyCap: earnDailyCap ?? null,
      },
    });
    return {
      merchantId,
      earnBps: updated.earnBps,
      redeemLimitBps: updated.redeemLimitBps,
      qrTtlSec: updated.qrTtlSec,
      webhookUrl: updated.webhookUrl,
      webhookSecret: updated.webhookSecret,
      webhookKeyId: updated.webhookKeyId,
      redeemCooldownSec: updated.redeemCooldownSec,
      earnCooldownSec: updated.earnCooldownSec,
      redeemDailyCap: updated.redeemDailyCap,
      earnDailyCap: updated.earnDailyCap,
    };
  }

  // Outlets
  async listOutlets(merchantId: string) {
    return this.prisma.outlet.findMany({ where: { merchantId }, orderBy: { createdAt: 'asc' } });
  }
  async createOutlet(merchantId: string, name: string, address?: string) {
    await this.ensureMerchant(merchantId);
    return this.prisma.outlet.create({ data: { merchantId, name, address: address ?? null } });
  }
  async updateOutlet(merchantId: string, outletId: string, dto: UpdateOutletDto) {
    const out = await this.prisma.outlet.findUnique({ where: { id: outletId } });
    if (!out || out.merchantId !== merchantId) throw new NotFoundException('Outlet not found');
    return this.prisma.outlet.update({ where: { id: outletId }, data: { name: dto.name ?? undefined, address: dto.address ?? undefined } });
  }
  async deleteOutlet(merchantId: string, outletId: string) {
    const out = await this.prisma.outlet.findUnique({ where: { id: outletId } });
    if (!out || out.merchantId !== merchantId) throw new NotFoundException('Outlet not found');
    await this.prisma.outlet.delete({ where: { id: outletId } });
    return { ok: true };
  }

  // Devices
  async listDevices(merchantId: string) {
    return this.prisma.device.findMany({ where: { merchantId }, orderBy: { createdAt: 'asc' } });
  }
  async createDevice(merchantId: string, type: string, outletId?: string, label?: string) {
    await this.ensureMerchant(merchantId);
    return this.prisma.device.create({ data: { merchantId, type: type as any, outletId: outletId ?? null, label: label ?? null } });
  }
  async updateDevice(merchantId: string, deviceId: string, dto: UpdateDeviceDto) {
    const dev = await this.prisma.device.findUnique({ where: { id: deviceId } });
    if (!dev || dev.merchantId !== merchantId) throw new NotFoundException('Device not found');
    return this.prisma.device.update({ where: { id: deviceId }, data: { outletId: dto.outletId ?? undefined, label: dto.label ?? undefined } });
  }
  async deleteDevice(merchantId: string, deviceId: string) {
    const dev = await this.prisma.device.findUnique({ where: { id: deviceId } });
    if (!dev || dev.merchantId !== merchantId) throw new NotFoundException('Device not found');
    await this.prisma.device.delete({ where: { id: deviceId } });
    return { ok: true };
  }

  // Staff
  async listStaff(merchantId: string) {
    return this.prisma.staff.findMany({ where: { merchantId }, orderBy: { createdAt: 'asc' } });
  }
  async createStaff(merchantId: string, dto: { login?: string; email?: string; role?: string }) {
    await this.ensureMerchant(merchantId);
    return this.prisma.staff.create({ data: { merchantId, login: dto.login ?? null, email: dto.email ?? null, role: (dto.role as any) ?? 'CASHIER' } });
  }
  async updateStaff(merchantId: string, staffId: string, dto: UpdateStaffDto) {
    const user = await this.prisma.staff.findUnique({ where: { id: staffId } });
    if (!user || user.merchantId !== merchantId) throw new NotFoundException('Staff not found');
    return this.prisma.staff.update({ where: { id: staffId }, data: { login: dto.login ?? undefined, email: dto.email ?? undefined, role: (dto.role as any) ?? undefined, status: dto.status ?? undefined } });
  }
  async deleteStaff(merchantId: string, staffId: string) {
    const user = await this.prisma.staff.findUnique({ where: { id: staffId } });
    if (!user || user.merchantId !== merchantId) throw new NotFoundException('Staff not found');
    await this.prisma.staff.delete({ where: { id: staffId } });
    return { ok: true };
  }

  private async ensureMerchant(merchantId: string) {
    await this.prisma.merchant.upsert({ where: { id: merchantId }, update: {}, create: { id: merchantId, name: merchantId } });
  }

  // Outbox monitor
  async listOutbox(merchantId: string, status?: string, limit = 50) {
    const where: any = { merchantId };
    if (status) where.status = status;
    return this.prisma.eventOutbox.findMany({ where, orderBy: { createdAt: 'desc' }, take: limit });
  }
  async retryOutbox(merchantId: string, eventId: string) {
    const ev = await this.prisma.eventOutbox.findUnique({ where: { id: eventId } });
    if (!ev || ev.merchantId !== merchantId) throw new NotFoundException('Event not found');
    await this.prisma.eventOutbox.update({ where: { id: eventId }, data: { status: 'PENDING', nextRetryAt: new Date(), lastError: null } });
    return { ok: true };
  }
}
