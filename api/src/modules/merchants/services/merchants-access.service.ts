import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { Prisma, Staff, StaffOutletAccessStatus, StaffStatus } from '@prisma/client';
import { PrismaService } from '../../../core/prisma/prisma.service';
import { LookupCacheService } from '../../../core/cache/lookup-cache.service';
import { AppConfigService } from '../../../core/config/app-config.service';
import {
  ensureUniqueCashierLogin,
  generateUniqueOutletPin,
  hashPin,
  normalizeDigits,
  randomDigitsSecure,
  randomSessionToken,
  sha256,
  slugify,
} from '../merchants.helpers';

@Injectable()
export class MerchantsAccessService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: LookupCacheService,
    private readonly config: AppConfigService,
  ) {}

  async getCashierCredentials(merchantId: string) {
    const m = await this.prisma.merchant.findUnique({
      where: { id: merchantId },
      select: { cashierLogin: true },
    });
    if (!m) throw new NotFoundException('Merchant not found');
    return {
      login: m.cashierLogin || null,
    };
  }

  async setCashierCredentials(merchantId: string, login: string) {
    const m = await this.prisma.merchant.findUnique({
      where: { id: merchantId },
      select: { id: true },
    });
    if (!m) throw new NotFoundException('Merchant not found');
    const normalized = String(login || '')
      .trim()
      .toLowerCase();
    if (!normalized) {
      throw new BadRequestException('cashier login required');
    }
    const clash = await this.prisma.merchant.findFirst({
      where: { cashierLogin: normalized, id: { not: merchantId } },
      select: { id: true },
    });
    if (clash) {
      throw new BadRequestException('cashier login already used');
    }
    const updated = await this.prisma.merchant.update({
      where: { id: merchantId },
      data: { cashierLogin: normalized },
      select: { cashierLogin: true },
    });
    return { login: updated.cashierLogin };
  }

  async rotateCashierCredentials(
    merchantId: string,
    regenerateLogin?: boolean,
  ) {
    const m = await this.prisma.merchant.findUnique({
      where: { id: merchantId },
      select: { id: true, name: true, cashierLogin: true },
    });
    if (!m) throw new NotFoundException('Merchant not found');
    let login = m.cashierLogin || slugify(m.name || 'merchant');
    if (regenerateLogin || !m.cashierLogin) {
      login = await ensureUniqueCashierLogin(
        this.prisma,
        slugify(m.name || 'merchant'),
      );
    }
    await this.prisma.merchant.update({
      where: { id: merchantId },
      data: { cashierLogin: login },
    });
    return { login };
  }

  async issueCashierActivationCodes(merchantId: string, count: number) {
    const normalizedCount = Math.max(
      1,
      Math.min(50, Math.floor(Number(count) || 0)),
    );
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 1000 * 60 * 60 * 24 * 3);
    const created = await this.prisma.$transaction(async (tx) => {
      const items: Array<{ id: string; code: string; tokenHint: string }> = [];
      for (let i = 0; i < normalizedCount; i += 1) {
        let issued = false;
        for (let attempt = 0; attempt < 20; attempt += 1) {
          const code = randomDigitsSecure(9);
          const tokenHash = sha256(code);
          const tokenHint = code.slice(-3);
          try {
            const row = await tx.cashierActivationCode.create({
              data: {
                merchantId,
                tokenHash,
                tokenHint,
                expiresAt,
              },
              select: { id: true },
            });
            items.push({ id: row.id, code, tokenHint });
            issued = true;
            break;
          } catch (e: unknown) {
            const code =
              typeof (e as { code?: unknown })?.code === 'string'
                ? (e as { code?: string }).code
                : null;
            if (code && code.toUpperCase() === 'P2002') {
              continue;
            }
            throw e;
          }
        }
        if (!issued) {
          throw new BadRequestException('Unable to issue activation codes');
        }
      }
      return items;
    });

    return {
      expiresAt: expiresAt.toISOString(),
      codes: created.map((item) => item.code),
      items: created.map((item) => ({
        id: item.id,
        tokenHint: item.tokenHint,
        expiresAt: expiresAt.toISOString(),
      })),
    };
  }

  async listCashierActivationCodes(merchantId: string, limit = 50) {
    const take = Math.max(1, Math.min(200, Math.floor(Number(limit) || 0)));
    const now = new Date();
    const rows = await this.prisma.cashierActivationCode.findMany({
      where: { merchantId },
      orderBy: { createdAt: 'desc' },
      take,
      select: {
        id: true,
        tokenHint: true,
        createdAt: true,
        expiresAt: true,
        usedAt: true,
        revokedAt: true,
        usedByDeviceSessionId: true,
      },
    });

    return rows.map((row) => ({
      id: row.id,
      tokenHint: row.tokenHint ?? null,
      createdAt: row.createdAt.toISOString(),
      expiresAt: row.expiresAt.toISOString(),
      usedAt: row.usedAt ? row.usedAt.toISOString() : null,
      revokedAt: row.revokedAt ? row.revokedAt.toISOString() : null,
      status: row.revokedAt
        ? 'REVOKED'
        : row.usedAt
          ? 'USED'
          : row.expiresAt.getTime() <= now.getTime()
            ? 'EXPIRED'
            : 'ACTIVE',
      usedByDeviceSessionId: row.usedByDeviceSessionId ?? null,
    }));
  }

  async revokeCashierActivationCode(merchantId: string, codeId: string) {
    const id = String(codeId || '').trim();
    if (!id) throw new BadRequestException('codeId required');
    const result = await this.prisma.cashierActivationCode.updateMany({
      where: {
        merchantId,
        id,
        usedAt: null,
        revokedAt: null,
      },
      data: { revokedAt: new Date() },
    });
    if (result.count === 0) {
      throw new NotFoundException('Activation code not found or inactive');
    }
    return { ok: true };
  }

  async listCashierDeviceSessions(merchantId: string, limit = 50) {
    const take = Math.max(1, Math.min(200, Math.floor(Number(limit) || 0)));
    const now = new Date();
    const rows = await this.prisma.cashierDeviceSession.findMany({
      where: {
        merchantId,
        revokedAt: null,
        expiresAt: { gt: now },
      },
      orderBy: { createdAt: 'desc' },
      take,
      select: {
        id: true,
        createdAt: true,
        lastSeenAt: true,
        expiresAt: true,
        ipAddress: true,
        userAgent: true,
        activationCodeId: true,
      },
    });

    return rows.map((row) => ({
      id: row.id,
      createdAt: row.createdAt.toISOString(),
      lastSeenAt: row.lastSeenAt ? row.lastSeenAt.toISOString() : null,
      expiresAt: row.expiresAt.toISOString(),
      ipAddress: row.ipAddress ?? null,
      userAgent: row.userAgent ?? null,
      activationCodeId: row.activationCodeId ?? null,
      status: row.expiresAt.getTime() <= now.getTime() ? 'EXPIRED' : 'ACTIVE',
    }));
  }

  async revokeCashierDeviceSession(merchantId: string, sessionId: string) {
    const id = String(sessionId || '').trim();
    if (!id) throw new BadRequestException('sessionId required');
    const result = await this.prisma.cashierDeviceSession.updateMany({
      where: { merchantId, id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    if (result.count === 0) {
      throw new NotFoundException('Device session not found or inactive');
    }
    return { ok: true };
  }

  async activateCashierDeviceByCode(
    merchantLogin: string,
    activationCode: string,
    context?: { ip?: string | null; userAgent?: string | null },
  ) {
    const normalizedLogin = String(merchantLogin || '')
      .trim()
      .toLowerCase();
    if (!normalizedLogin)
      throw new BadRequestException('merchantLogin required');
    const digits = normalizeDigits(String(activationCode || ''), 9);
    if (digits.length !== 9) {
      throw new BadRequestException('activationCode (9 digits) required');
    }

    const merchant = await this.prisma.merchant.findFirst({
      where: { cashierLogin: normalizedLogin },
      select: { id: true, cashierLogin: true },
    });
    if (!merchant)
      throw new UnauthorizedException('Invalid cashier merchant login');

    const tokenHash = sha256(digits);
    const now = new Date();
    const deviceTtlMs = 1000 * 60 * 60 * 24 * 180;
    const deviceExpiresAt = new Date(now.getTime() + deviceTtlMs);

    const token = randomSessionToken();
    const deviceTokenHash = sha256(token);

    const result = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.cashierActivationCode.updateMany({
        where: {
          merchantId: merchant.id,
          tokenHash,
          usedAt: null,
          revokedAt: null,
          expiresAt: { gt: now },
        },
        data: { usedAt: now },
      });
      if (updated.count !== 1) {
        throw new UnauthorizedException('Invalid or expired activation code');
      }

      const device = await tx.cashierDeviceSession.create({
        data: {
          merchantId: merchant.id,
          tokenHash: deviceTokenHash,
          expiresAt: deviceExpiresAt,
          lastSeenAt: now,
          ipAddress: context?.ip ?? null,
          userAgent: context?.userAgent ?? null,
        },
        select: { id: true, merchantId: true, expiresAt: true },
      });

      await tx.cashierActivationCode.updateMany({
        where: { merchantId: merchant.id, tokenHash, usedAt: now },
        data: { usedByDeviceSessionId: device.id },
      });

      return device;
    });

    return {
      token,
      expiresAt: result.expiresAt.toISOString(),
      merchantId: result.merchantId,
      login: merchant.cashierLogin,
    };
  }

  async getCashierDeviceSessionByToken(token: string) {
    const raw = String(token || '').trim();
    if (!raw) return null;
    const hash = sha256(raw);
    const session = await this.prisma.cashierDeviceSession.findFirst({
      where: { tokenHash: hash, revokedAt: null },
      select: {
        id: true,
        merchantId: true,
        expiresAt: true,
        lastSeenAt: true,
        merchant: { select: { cashierLogin: true } },
      },
    });
    if (!session) return null;
    const now = new Date();
    if (session.expiresAt.getTime() <= now.getTime()) {
      try {
        await this.prisma.cashierDeviceSession.update({
          where: { id: session.id },
          data: { revokedAt: now },
        });
      } catch {}
      return null;
    }
    if (
      !session.lastSeenAt ||
      now.getTime() - session.lastSeenAt.getTime() > 60_000
    ) {
      try {
        await this.prisma.cashierDeviceSession.update({
          where: { id: session.id },
          data: { lastSeenAt: now },
        });
      } catch {}
    }
    return {
      id: session.id,
      merchantId: session.merchantId,
      login: session.merchant?.cashierLogin ?? null,
      expiresAt: session.expiresAt,
      lastSeenAt: session.lastSeenAt ?? now,
    };
  }

  async revokeCashierDeviceSessionByToken(token: string) {
    const raw = String(token || '').trim();
    if (!raw) return { ok: true };
    const hash = sha256(raw);
    const now = new Date();
    await this.prisma.cashierDeviceSession.updateMany({
      where: { tokenHash: hash, revokedAt: null },
      data: { revokedAt: now },
    });
    return { ok: true };
  }

  async startCashierSessionByMerchantId(
    merchantId: string,
    pinCode: string,
    rememberPin?: boolean,
    context?: { ip?: string | null; userAgent?: string | null },
    deviceSessionId?: string | null,
  ) {
    const mid = String(merchantId || '').trim();
    if (!mid) throw new BadRequestException('merchantId required');
    const normalizedPin = String(pinCode || '').trim();
    if (!normalizedPin || normalizedPin.length !== 4)
      throw new BadRequestException('pinCode (4 digits) required');

    const { access, staff } = await this.resolveActiveAccessByPin(
      mid,
      normalizedPin,
      deviceSessionId,
    );
    if (!access.outletId)
      throw new BadRequestException('Outlet for PIN access not found');

    return this.createCashierSessionRecord(
      mid,
      staff,
      access,
      rememberPin,
      context,
      deviceSessionId,
    );
  }

  async getCashierSessionByToken(token: string) {
    const raw = String(token || '').trim();
    if (!raw) return null;
    const hash = sha256(raw);
    const session = await this.prisma.cashierSession.findFirst({
      where: { tokenHash: hash },
      include: {
        staff: true,
        outlet: { select: { id: true, name: true } },
      },
    });
    if (!session || session.endedAt) return null;
    if (session.expiresAt && session.expiresAt.getTime() <= Date.now()) {
      await this.prisma.cashierSession.update({
        where: { id: session.id },
        data: { endedAt: new Date(), result: 'expired' },
      });
      return null;
    }
    if (session.staff.status && session.staff.status !== StaffStatus.ACTIVE) {
      await this.prisma.cashierSession.update({
        where: { id: session.id },
        data: {
          endedAt: new Date(),
          result: 'staff_inactive',
        },
      });
      return null;
    }
    const now = new Date();
    if (
      !session.lastSeenAt ||
      now.getTime() - session.lastSeenAt.getTime() > 60_000
    ) {
      try {
        await this.prisma.cashierSession.update({
          where: { id: session.id },
          data: { lastSeenAt: now },
        });
        session.lastSeenAt = now;
      } catch {}
    }
    const displayName =
      [session.staff.firstName, session.staff.lastName]
        .filter((part) => typeof part === 'string' && part?.trim?.())
        .map((part) => (part as string).trim())
        .join(' ') ||
      session.staff.login ||
      null;
    return {
      id: session.id,
      merchantId: session.merchantId,
      staff: {
        id: session.staff.id,
        login: session.staff.login ?? null,
        firstName: session.staff.firstName ?? null,
        lastName: session.staff.lastName ?? null,
        role: session.staff.role,
        displayName,
      },
      outlet: {
        id: session.outletId,
        name: session.outlet?.name ?? session.outletId ?? null,
      },
      startedAt: session.startedAt,
      lastSeenAt: session.lastSeenAt ?? now,
      rememberPin: !!session.rememberPin,
    };
  }

  async endCashierSessionByToken(token: string, reason = 'logout') {
    const raw = String(token || '').trim();
    if (!raw) return { ok: true };
    const hash = sha256(raw);
    const session = await this.prisma.cashierSession.findFirst({
      where: { tokenHash: hash, endedAt: null },
    });
    if (!session) return { ok: true };
    await this.prisma.cashierSession.update({
      where: { id: session.id },
      data: { endedAt: new Date(), result: reason },
    });
    return { ok: true };
  }

  async listStaffAccess(merchantId: string, staffId: string) {
    const user = await this.prisma.staff.findUnique({ where: { id: staffId } });
    if (!user || user.merchantId !== merchantId)
      throw new NotFoundException('Staff not found');
    const acc = await this.prisma.staffOutletAccess.findMany({
      where: { merchantId, staffId },
      orderBy: { createdAt: 'asc' },
    });
    const outletIds = acc.map((a) => a.outletId);
    const outlets = outletIds.length
      ? await this.prisma.outlet.findMany({
          where: { id: { in: outletIds } },
          select: { id: true, name: true },
        })
      : [];
    const nameMap = new Map<string, string>(outlets.map((o) => [o.id, o.name]));
    let counters = new Map<string, number>();
    if (outletIds.length) {
      try {
        const grouped = await this.prisma.transaction.groupBy({
          by: ['staffId', 'outletId'],
          where: { merchantId, staffId, outletId: { in: outletIds } },
          _count: { _all: true },
        });
        counters = new Map<string, number>(
          grouped.map((g) => [
            `${g.staffId}|${g.outletId}`,
            g._count?._all || 0,
          ]),
        );
      } catch {}
    }
    return acc.map((a) => ({
      outletId: a.outletId,
      outletName: nameMap.get(a.outletId) || a.outletId,
      pinCode: a.pinCode || null,
      lastTxnAt: a.lastTxnAt || null,
      transactionsTotal: counters.get(`${a.staffId}|${a.outletId}`) || 0,
    }));
  }

  async addStaffAccess(merchantId: string, staffId: string, outletId: string) {
    const [user, outlet] = await Promise.all([
      this.prisma.staff.findUnique({ where: { id: staffId } }),
      this.prisma.outlet.findUnique({ where: { id: outletId } }),
    ]);
    if (!user || user.merchantId !== merchantId)
      throw new NotFoundException('Staff not found');
    if (!outlet || outlet.merchantId !== merchantId)
      throw new NotFoundException('Outlet not found');
    const existing = await this.prisma.staffOutletAccess.findUnique({
      where: { merchantId_staffId_outletId: { merchantId, staffId, outletId } },
    });
    let pinCode: string;
    try {
      pinCode = await generateUniqueOutletPin(
        this.prisma,
        merchantId,
        existing?.id,
      );
    } catch {
      throw new BadRequestException('Unable to generate unique PIN');
    }
    await this.prisma.staffOutletAccess.upsert({
      where: { merchantId_staffId_outletId: { merchantId, staffId, outletId } },
      update: {
        pinCode,
        pinCodeHash: hashPin(pinCode),
        pinRetryCount: 0,
        status: StaffOutletAccessStatus.ACTIVE,
        revokedAt: null,
        pinUpdatedAt: new Date(),
      },
      create: {
        merchantId,
        staffId,
        outletId,
        pinCode,
        pinCodeHash: hashPin(pinCode),
        pinRetryCount: 0,
        status: StaffOutletAccessStatus.ACTIVE,
        pinUpdatedAt: new Date(),
      },
    });
    this.cache.invalidateStaff(merchantId, staffId);
    return {
      outletId,
      outletName: outlet.name || outletId,
      pinCode,
      lastTxnAt: null,
      transactionsTotal: 0,
    };
  }

  async removeStaffAccess(
    merchantId: string,
    staffId: string,
    outletId: string,
  ) {
    const user = await this.prisma.staff.findUnique({ where: { id: staffId } });
    if (!user || user.merchantId !== merchantId)
      throw new NotFoundException('Staff not found');
    try {
      await this.prisma.staffOutletAccess.delete({
        where: {
          merchantId_staffId_outletId: { merchantId, staffId, outletId },
        },
      });
    } catch {}
    this.cache.invalidateStaff(merchantId, staffId);
    return { ok: true };
  }

  async regenerateStaffPersonalPin(merchantId: string, staffId: string) {
    const staff = await this.prisma.staff.findFirst({
      where: { id: staffId, merchantId },
    });
    if (!staff) throw new NotFoundException('Staff not found');
    const access = await this.prisma.staffOutletAccess.findFirst({
      where: { merchantId, staffId, status: StaffOutletAccessStatus.ACTIVE },
      orderBy: { createdAt: 'asc' },
    });
    if (!access) {
      throw new BadRequestException(
        'Для сотрудника нет активных торговых точек',
      );
    }
    let pinCode: string;
    try {
      pinCode = await generateUniqueOutletPin(
        this.prisma,
        merchantId,
        access.id,
      );
    } catch {
      throw new BadRequestException('Unable to generate unique PIN');
    }
    await this.prisma.staffOutletAccess.update({
      where: { id: access.id },
      data: {
        pinCode,
        pinCodeHash: hashPin(pinCode),
        pinRetryCount: 0,
        pinUpdatedAt: new Date(),
        status: StaffOutletAccessStatus.ACTIVE,
        revokedAt: null,
      },
    });
    this.cache.invalidateStaff(merchantId, staffId);
    return { pinCode };
  }

  async regenerateStaffPin(
    merchantId: string,
    staffId: string,
    outletId: string,
  ) {
    const user = await this.prisma.staff.findUnique({ where: { id: staffId } });
    if (!user || user.merchantId !== merchantId)
      throw new NotFoundException('Staff not found');
    const access = await this.prisma.staffOutletAccess.findUnique({
      where: { merchantId_staffId_outletId: { merchantId, staffId, outletId } },
    });
    if (!access) throw new NotFoundException('Outlet access not granted');
    let pinCode: string;
    try {
      pinCode = await generateUniqueOutletPin(
        this.prisma,
        merchantId,
        access.id,
      );
    } catch {
      throw new BadRequestException('Unable to generate unique PIN');
    }
    await this.prisma.staffOutletAccess.update({
      where: { merchantId_staffId_outletId: { merchantId, staffId, outletId } },
      data: {
        pinCode,
        pinCodeHash: hashPin(pinCode),
        pinRetryCount: 0,
        pinUpdatedAt: new Date(),
        status: StaffOutletAccessStatus.ACTIVE,
        revokedAt: null,
      },
    });
    this.cache.invalidateStaff(merchantId, staffId);
    return { outletId, pinCode };
  }

  async getStaffAccessByPin(
    merchantId: string,
    pinCode: string,
    deviceSessionId?: string | null,
  ) {
    const { access, staff } = await this.resolveActiveAccessByPin(
      merchantId,
      pinCode,
      deviceSessionId,
    );
    const accesses = await this.listStaffAccess(merchantId, staff.id);
    const matched =
      accesses.find((item) => item.outletId === access.outletId) ?? null;
    return {
      staff: {
        id: staff.id,
        login: staff.login || undefined,
        firstName: staff.firstName || undefined,
        lastName: staff.lastName || undefined,
        role: staff.role,
        pinCode: access.pinCode || undefined,
      },
      outlet: matched
        ? {
            id: matched.outletId,
            name: matched.outletName ?? matched.outletId,
          }
        : {
            id: access.outletId,
            name: access.outlet?.name ?? access.outletId,
          },
      accesses,
    };
  }

  private async resolveActiveAccessByPin(
    merchantId: string,
    pinCode: string,
    deviceSessionId?: string | null,
  ): Promise<{
    access: {
      id: string;
      outletId: string;
      pinCode: string | null;
      outlet?: { id: string; name: string | null } | null;
    };
    staff: Staff;
  }> {
    if (!merchantId) throw new BadRequestException('merchantId required');
    const normalizedPin = String(pinCode || '').trim();
    if (!normalizedPin)
      throw new BadRequestException('pinCode (4 digits) required');
    const retryLimit = Math.max(
      1,
      this.config.getNumber('PIN_RETRY_LIMIT', 5) ?? 5,
    );
    const retryWindowMs = Math.max(
      60_000,
      this.config.getNumber('PIN_RETRY_WINDOW_MS', 900000) ?? 900000,
    );
    const deviceSessionKey = deviceSessionId
      ? String(deviceSessionId).trim()
      : '';
    let devicePinState: {
      pinFailedCount: number;
      pinFailedAt: Date | null;
      pinLockedUntil: Date | null;
    } | null = null;
    if (deviceSessionKey) {
      try {
        devicePinState = await this.prisma.cashierDeviceSession.findUnique({
          where: { id: deviceSessionKey },
          select: {
            pinFailedCount: true,
            pinFailedAt: true,
            pinLockedUntil: true,
          },
        });
        if (
          devicePinState?.pinLockedUntil &&
          devicePinState.pinLockedUntil.getTime() > Date.now()
        ) {
          throw new UnauthorizedException(
            'PIN временно заблокирован. Осталось попыток: 0',
          );
        }
        if (
          devicePinState?.pinLockedUntil &&
          devicePinState.pinLockedUntil.getTime() <= Date.now()
        ) {
          await this.prisma.cashierDeviceSession.update({
            where: { id: deviceSessionKey },
            data: {
              pinFailedCount: 0,
              pinFailedAt: null,
              pinLockedUntil: null,
            },
          });
          devicePinState = {
            pinFailedCount: 0,
            pinFailedAt: null,
            pinLockedUntil: null,
          };
        }
      } catch {}
    }
    const pinHash = hashPin(normalizedPin);
    let matches = await this.prisma.staffOutletAccess.findMany({
      where: {
        merchantId,
        pinCodeHash: pinHash,
        status: StaffOutletAccessStatus.ACTIVE,
        revokedAt: null,
      },
      include: {
        staff: true,
        outlet: { select: { id: true, name: true } },
      },
      take: 2,
    });
    if (!matches.length) {
      matches = await this.prisma.staffOutletAccess.findMany({
        where: {
          merchantId,
          pinCode: normalizedPin,
          status: StaffOutletAccessStatus.ACTIVE,
          revokedAt: null,
        },
        include: {
          staff: true,
          outlet: { select: { id: true, name: true } },
        },
        take: 2,
      });
      if (matches.length === 1 && !matches[0].pinCodeHash) {
        await this.prisma.staffOutletAccess.update({
          where: { id: matches[0].id },
          data: {
            pinCodeHash: pinHash,
            pinRetryCount: 0,
            pinUpdatedAt: new Date(),
            revokedAt: null,
          },
        });
        matches[0].pinCodeHash = pinHash;
      }
    }
    if (!matches.length) {
      let remainingAttempts: number | null = null;
      if (deviceSessionKey) {
        const now = new Date();
        const windowStart = devicePinState?.pinFailedAt ?? null;
        const withinWindow =
          windowStart && now.getTime() - windowStart.getTime() <= retryWindowMs;
        const nextCount = withinWindow
          ? (devicePinState?.pinFailedCount ?? 0) + 1
          : 1;
        const nextFirstFailedAt = withinWindow ? windowStart : now;
        const lockedUntil =
          nextCount >= retryLimit
            ? new Date(now.getTime() + retryWindowMs)
            : null;
        remainingAttempts = Math.max(0, retryLimit - nextCount);
        try {
          await this.prisma.cashierDeviceSession.update({
            where: { id: deviceSessionKey },
            data: {
              pinFailedCount: nextCount,
              pinFailedAt: nextFirstFailedAt,
              pinLockedUntil: lockedUntil,
            },
          });
        } catch {}
      }
      const message =
        remainingAttempts === null
          ? 'Staff access by PIN not found'
          : remainingAttempts === 0
            ? 'Неверный PIN. Осталось попыток: 0. PIN временно заблокирован'
            : `Неверный PIN. Осталось попыток: ${remainingAttempts}`;
      throw new NotFoundException(message);
    }
    if (matches.length > 1) {
      throw new BadRequestException(
        'PIN не уникален внутри мерчанта. Сгенерируйте новый PIN для сотрудников.',
      );
    }
    const access = matches[0];
    if (
      access.pinRetryCount >= retryLimit &&
      access.pinUpdatedAt &&
      Date.now() - access.pinUpdatedAt.getTime() < retryWindowMs
    ) {
      throw new UnauthorizedException('PIN временно заблокирован');
    }
    const staff = access.staff;
    if (!staff || staff.merchantId !== merchantId)
      throw new NotFoundException('Staff not found');
    if (staff.status && staff.status !== StaffStatus.ACTIVE) {
      throw new UnauthorizedException('Staff inactive');
    }
    if (access.pinRetryCount) {
      await this.prisma.staffOutletAccess.update({
        where: { id: access.id },
        data: { pinRetryCount: 0, pinUpdatedAt: new Date() },
      });
    }
    if (
      deviceSessionKey &&
      devicePinState &&
      (devicePinState.pinFailedCount ||
        devicePinState.pinFailedAt ||
        devicePinState.pinLockedUntil)
    ) {
      try {
        await this.prisma.cashierDeviceSession.update({
          where: { id: deviceSessionKey },
          data: {
            pinFailedCount: 0,
            pinFailedAt: null,
            pinLockedUntil: null,
          },
        });
      } catch {}
    }
    return {
      access: {
        id: access.id,
        outletId: access.outletId,
        pinCode: access.pinCode ?? null,
        outlet: access.outlet
          ? { id: access.outlet.id, name: access.outlet.name ?? null }
          : null,
      },
      staff,
    };
  }

  private async createCashierSessionRecord(
    merchantId: string,
    staff: Staff,
    access: { id: string; outletId: string },
    rememberPin?: boolean,
    context?: { ip?: string | null; userAgent?: string | null },
    deviceSessionId?: string | null,
    metadata?: Prisma.InputJsonValue,
  ) {
    const token = randomSessionToken();
    const hash = sha256(token);
    const now = new Date();
    const ttlMs = rememberPin
      ? 1000 * 60 * 60 * 24 * 180
      : 1000 * 60 * 60 * 12;
    const [session] = await this.prisma.$transaction([
      this.prisma.cashierSession.create({
        data: {
          merchantId,
          staffId: staff.id,
          outletId: access.outletId,
          pinAccessId: access.id,
          deviceSessionId: deviceSessionId ?? null,
          startedAt: now,
          lastSeenAt: now,
          tokenHash: hash,
          expiresAt: new Date(now.getTime() + ttlMs),
          rememberPin: !!rememberPin,
          ipAddress: context?.ip ?? null,
          userAgent: context?.userAgent ?? null,
          metadata: metadata ?? ({} as Prisma.InputJsonValue),
        },
        include: {
          outlet: { select: { id: true, name: true } },
          staff: true,
        },
      }),
      this.prisma.staff.update({
        where: { id: staff.id },
        data: { lastCashierLoginAt: now },
      }),
    ]);

    const displayName =
      [session.staff.firstName, session.staff.lastName]
        .filter((part) => typeof part === 'string' && part?.trim?.())
        .map((part) => (part as string).trim())
        .join(' ') ||
      session.staff.login ||
      null;

    return {
      token,
      session: {
        id: session.id,
        merchantId,
        staff: {
          id: session.staff.id,
          login: session.staff.login ?? null,
          firstName: session.staff.firstName ?? null,
          lastName: session.staff.lastName ?? null,
          role: session.staff.role,
          displayName,
        },
        outlet: {
          id: session.outletId,
          name: session.outlet?.name ?? session.outletId ?? null,
        },
        startedAt: session.startedAt,
        rememberPin: !!rememberPin,
      },
    };
  }
}
