import { BadRequestException, ConflictException, Logger } from '@nestjs/common';
import { LedgerAccount, Prisma, TxnType, WalletType } from '@prisma/client';
import { PrismaService } from '../../../core/prisma/prisma.service';
import { MetricsService } from '../../../core/metrics/metrics.service';
import { AppConfigService } from '../../../core/config/app-config.service';
import { logIgnoredError } from '../../../shared/logging/ignore-error.util';
import { getRulesRoot, getRulesSection } from '../../../shared/rules-json.util';
import { LoyaltyContextService } from './loyalty-context.service';
import type { OptionalModelsClient } from './loyalty-ops.types';

export class LoyaltyRegistrationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly metrics: MetricsService,
    private readonly context: LoyaltyContextService,
    private readonly config: AppConfigService,
    private readonly logger: Logger,
  ) {}

  async grantRegistrationBonus(params: {
    merchantId?: string;
    customerId?: string;
    outletId?: string | null;
    staffId?: string | null;
  }) {
    const merchantId = String(params?.merchantId || '').trim();
    const customerId = String(params?.customerId || '').trim();
    const outletId =
      typeof params?.outletId === 'string' && params.outletId.trim()
        ? params.outletId.trim()
        : null;
    const staffId =
      typeof params?.staffId === 'string' && params.staffId.trim()
        ? params.staffId.trim()
        : null;
    if (!merchantId) throw new BadRequestException('merchantId required');
    if (!customerId) throw new BadRequestException('customerId required');
    let resolvedOutletId = outletId;
    if (resolvedOutletId) {
      const outlet = await this.prisma.outlet.findFirst({
        where: { id: resolvedOutletId, merchantId },
        select: { id: true },
      });
      if (!outlet) resolvedOutletId = null;
    }
    let resolvedStaffId = staffId;
    if (resolvedStaffId) {
      const staff = await this.prisma.staff.findFirst({
        where: { id: resolvedStaffId, merchantId },
        select: { id: true },
      });
      if (!staff) resolvedStaffId = null;
    }

    // Read registration mechanic from settings
    const settings = await this.prisma.merchantSettings.findUnique({
      where: { merchantId },
    });
    const rules = getRulesRoot(settings?.rulesJson);
    const reg = getRulesSection(rules, 'registration');
    const enabled =
      reg && Object.prototype.hasOwnProperty.call(reg, 'enabled')
        ? Boolean(reg.enabled)
        : true;
    const pointsRaw = reg && reg.points != null ? Number(reg.points) : 0;
    const points = Number.isFinite(pointsRaw)
      ? Math.max(0, Math.floor(pointsRaw))
      : 0;
    const ttlDaysRaw = reg && reg.ttlDays != null ? Number(reg.ttlDays) : null;
    const ttlDays =
      Number.isFinite(ttlDaysRaw) && ttlDaysRaw != null && ttlDaysRaw > 0
        ? Math.floor(Number(ttlDaysRaw))
        : null;
    const delayDaysRaw =
      reg && reg.delayDays != null ? Number(reg.delayDays) : 0;
    const delayHoursRaw =
      reg && reg.delayHours != null ? Number(reg.delayHours) : null;
    const delayMs =
      Number.isFinite(delayHoursRaw) &&
      delayHoursRaw != null &&
      delayHoursRaw > 0
        ? Math.floor(Number(delayHoursRaw)) * 60 * 60 * 1000
        : Number.isFinite(delayDaysRaw) &&
            delayDaysRaw != null &&
            delayDaysRaw > 0
          ? Math.floor(Number(delayDaysRaw)) * 24 * 60 * 60 * 1000
          : 0;

    // Если клиент приглашён по рефералу и у активной программы выключено суммирование с регистрацией — запрещаем выдачу
    const ref = await this.prisma.referral.findFirst({
      where: {
        refereeId: customerId,
        program: { merchantId, status: 'ACTIVE', isActive: true },
      },
      include: { program: true },
    });
    if (ref?.program && ref.program.stackWithRegistration === false) {
      throw new BadRequestException(
        'Регистрационный бонус не суммируется с реферальным для приглашённых клиентов',
      );
    }

    if (!enabled || points <= 0) {
      throw new BadRequestException(
        'registration bonus disabled or zero points',
      );
    }

    const enabledAtRaw = reg && reg.enabledAt != null ? reg.enabledAt : null;
    let enabledAt: Date | null = null;
    if (enabledAtRaw) {
      let parsed: Date | null = null;
      if (enabledAtRaw instanceof Date) {
        parsed = enabledAtRaw;
      } else if (
        typeof enabledAtRaw === 'string' ||
        typeof enabledAtRaw === 'number'
      ) {
        const candidate = new Date(enabledAtRaw);
        if (!Number.isNaN(candidate.getTime())) parsed = candidate;
      }
      if (parsed) enabledAt = parsed;
    }
    if (enabledAt) {
      const customerMeta = await this.prisma.customer.findFirst({
        where: { id: customerId, merchantId },
        select: { createdAt: true },
      });
      if (!customerMeta) throw new BadRequestException('customer not found');
      if (customerMeta.createdAt < enabledAt) {
        const walletEx = await this.prisma.wallet.findFirst({
          where: { merchantId, customerId, type: WalletType.POINTS },
        });
        return {
          ok: true,
          alreadyGranted: true,
          pointsIssued: 0,
          pending: false,
          maturesAt: null,
          pointsExpireInDays: ttlDays,
          expiresInDays: ttlDays,
          pointsExpireAt: null,
          balance: walletEx?.balance ?? 0,
        } as const;
      }
    }

    // Idempotency: if already issued, return existing state
    const existingTxn = await this.prisma.transaction.findFirst({
      where: { merchantId, customerId, orderId: 'registration_bonus' },
    });
    const existingLot = await this.prisma.earnLot.findFirst({
      where: { merchantId, customerId, orderId: 'registration_bonus' },
    });
    if (existingTxn || existingLot) {
      const walletEx = await this.prisma.wallet.findFirst({
        where: { merchantId, customerId, type: WalletType.POINTS },
      });
      return {
        ok: true,
        alreadyGranted: true,
        pointsIssued: 0,
        pending: !!(existingLot && existingLot.status === 'PENDING'),
        maturesAt: existingLot?.maturesAt
          ? existingLot.maturesAt.toISOString()
          : null,
        pointsExpireInDays: ttlDays,
        expiresInDays: ttlDays,
        pointsExpireAt: existingLot?.expiresAt
          ? existingLot.expiresAt.toISOString()
          : null,
        balance: walletEx?.balance ?? 0,
      } as const;
    }

    let idempotencyCreated = false;
    try {
      await this.prisma.idempotencyKey.create({
        data: {
          merchantId,
          scope: 'registration_bonus',
          key: customerId,
        },
      });
      idempotencyCreated = true;
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const retryTxn = await this.prisma.transaction.findFirst({
          where: { merchantId, customerId, orderId: 'registration_bonus' },
        });
        const retryLot = await this.prisma.earnLot.findFirst({
          where: { merchantId, customerId, orderId: 'registration_bonus' },
        });
        if (retryTxn || retryLot) {
          const walletEx = await this.prisma.wallet.findFirst({
            where: { merchantId, customerId, type: WalletType.POINTS },
          });
          return {
            ok: true,
            alreadyGranted: true,
            pointsIssued: 0,
            pending: !!(retryLot && retryLot.status === 'PENDING'),
            maturesAt: retryLot?.maturesAt
              ? retryLot.maturesAt.toISOString()
              : null,
            pointsExpireInDays: ttlDays,
            expiresInDays: ttlDays,
            pointsExpireAt: retryLot?.expiresAt
              ? retryLot.expiresAt.toISOString()
              : null,
            balance: walletEx?.balance ?? 0,
          } as const;
        }
        throw new ConflictException('Регистрационный бонус уже обрабатывается');
      }
      throw error;
    }

    try {
      const context = await this.context.ensureCustomerContext(
        merchantId,
        customerId,
      );
      if (context.accrualsBlocked) {
        throw new BadRequestException(
          'Начисления заблокированы администратором',
        );
      }
    } catch (error) {
      if (idempotencyCreated) {
        await this.prisma.idempotencyKey
          .delete({
            where: {
              merchantId_scope_key: {
                merchantId,
                scope: 'registration_bonus',
                key: customerId,
              },
            },
          })
          .catch((err) =>
            logIgnoredError(
              err,
              'LoyaltyRegistrationService idempotency cleanup',
              this.logger,
              'debug',
            ),
          );
      }
      throw error;
    }

    try {
      return await this.prisma.$transaction(async (tx) => {
        // Ensure wallet
        let wallet = await tx.wallet.findFirst({
          where: { merchantId, customerId, type: WalletType.POINTS },
        });
        if (!wallet)
          wallet = await tx.wallet.create({
            data: {
              merchantId,
              customerId,
              type: WalletType.POINTS,
              balance: 0,
            },
          });

        const now = new Date();

        if (delayMs > 0) {
          // Create pending lot
          const maturesAt = new Date(now.getTime() + delayMs);
          const expiresAt = ttlDays
            ? new Date(maturesAt.getTime() + ttlDays * 24 * 60 * 60 * 1000)
            : null;
          const earnLot =
            (tx as OptionalModelsClient).earnLot ?? this.prisma.earnLot;
          await earnLot.create({
            data: {
              merchantId,
              customerId,
              points,
              consumedPoints: 0,
              earnedAt: maturesAt,
              maturesAt,
              expiresAt,
              orderId: 'registration_bonus',
              receiptId: null,
              outletId: resolvedOutletId,
              staffId: resolvedStaffId,
              status: 'PENDING',
            },
          });

          await tx.eventOutbox.create({
            data: {
              merchantId,
              eventType: 'loyalty.registration.scheduled',
              payload: {
                merchantId,
                customerId,
                points,
                maturesAt: maturesAt.toISOString(),
                outletId: resolvedOutletId ?? null,
                staffId: resolvedStaffId ?? null,
              },
            },
          });

          return {
            ok: true,
            pointsIssued: points,
            pending: true,
            maturesAt: maturesAt.toISOString(),
            pointsExpireInDays: ttlDays,
            expiresInDays: ttlDays,
            pointsExpireAt: expiresAt ? expiresAt.toISOString() : null,
            balance: (await tx.wallet.findUnique({ where: { id: wallet.id } }))!
              .balance,
          } as const;
        } else {
          // Immediate award
          const updatedWallet = await tx.wallet.update({
            where: { id: wallet.id },
            data: { balance: { increment: points } },
            select: { balance: true },
          });
          const balance = updatedWallet.balance;

          await tx.transaction.create({
            data: {
              merchantId,
              customerId,
              type: TxnType.EARN,
              amount: points,
              orderId: 'registration_bonus',
              outletId: resolvedOutletId,
              staffId: resolvedStaffId,
            },
          });

          if (this.config.isLedgerEnabled() && points > 0) {
            await tx.ledgerEntry.create({
              data: {
                merchantId,
                customerId,
                debit: LedgerAccount.MERCHANT_LIABILITY,
                credit: LedgerAccount.CUSTOMER_BALANCE,
                amount: points,
                orderId: 'registration_bonus',
                outletId: resolvedOutletId,
                staffId: resolvedStaffId,
                meta: { mode: 'REGISTRATION' },
              },
            });
            this.metrics.inc('loyalty_ledger_entries_total', { type: 'earn' });
            this.metrics.inc(
              'loyalty_ledger_amount_total',
              { type: 'earn' },
              points,
            );
          }

          if (this.config.isEarnLotsEnabled() && points > 0) {
            const earnLot =
              (tx as OptionalModelsClient).earnLot ?? this.prisma.earnLot;
            await earnLot.create({
              data: {
                merchantId,
                customerId,
                points,
                consumedPoints: 0,
                earnedAt: now,
                maturesAt: null,
                expiresAt: ttlDays
                  ? new Date(now.getTime() + ttlDays * 24 * 60 * 60 * 1000)
                  : null,
                orderId: 'registration_bonus',
                receiptId: null,
                outletId: resolvedOutletId,
                staffId: resolvedStaffId,
                status: 'ACTIVE',
              },
            });
          }

          await tx.eventOutbox.create({
            data: {
              merchantId,
              eventType: 'loyalty.registration.awarded',
              payload: {
                merchantId,
                customerId,
                points,
                outletId: resolvedOutletId ?? null,
                staffId: resolvedStaffId ?? null,
              },
            },
          });
          await tx.eventOutbox.create({
            data: {
              merchantId,
              eventType: 'notify.registration_bonus',
              payload: {
                merchantId,
                customerId,
                points,
              },
            },
          });

          return {
            ok: true,
            pointsIssued: points,
            pending: false,
            maturesAt: null,
            pointsExpireInDays: ttlDays,
            expiresInDays: ttlDays,
            pointsExpireAt: ttlDays
              ? new Date(
                  now.getTime() + ttlDays * 24 * 60 * 60 * 1000,
                ).toISOString()
              : null,
            balance,
          } as const;
        }
      });
    } catch (error) {
      if (idempotencyCreated) {
        await this.prisma.idempotencyKey
          .delete({
            where: {
              merchantId_scope_key: {
                merchantId,
                scope: 'registration_bonus',
                key: customerId,
              },
            },
          })
          .catch((err) =>
            logIgnoredError(
              err,
              'LoyaltyRegistrationService idempotency cleanup',
              this.logger,
              'debug',
            ),
          );
      }
      throw error;
    }
  }
}
