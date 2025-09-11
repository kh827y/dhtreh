import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { MetricsService } from './metrics.service';

@Injectable()
export class TtlBurnWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TtlBurnWorker.name);
  private isRunning = false;
  private timer: any = null;

  constructor(
    private prisma: PrismaService,
    private metrics: MetricsService,
  ) {}

  onModuleInit() {
    if (process.env.WORKERS_ENABLED === '0') { this.logger.log('Workers disabled (WORKERS_ENABLED=0)'); return; }
    const intervalMs = Number(process.env.TTL_BURN_INTERVAL_MS || String(24 * 60 * 60 * 1000)); // default daily
    this.timer = setInterval(() => this.processTtlBurn().catch(() => {}), intervalMs);
    this.logger.log(`TtlBurnWorker started, interval=${intervalMs}ms`);
  }

  onModuleDestroy() { if (this.timer) clearInterval(this.timer); }

  async processTtlBurn() {
    if (process.env.TTL_BURN_ENABLED !== '1') return;
    if (this.isRunning) {
      this.logger.warn('TTL burn already running, skipping');
      return;
    }

    this.isRunning = true;
    const startTime = Date.now();
    
    try {
      this.logger.log('Starting TTL burn process');
      
      // Get all merchants with TTL configured
      const merchants = await this.prisma.merchantSettings.findMany({ where: { pointsTtlDays: { gt: 0 as any } } as any });

      for (const merchant of merchants) {
        try {
          await this.burnExpiredPoints(
            merchant.merchantId,
            merchant.pointsTtlDays!,
          );
        } catch (error) {
          this.logger.error(
            `Failed to burn points for merchant ${merchant.merchantId}`,
            error,
          );
        }
      }

      const duration = Date.now() - startTime;
      this.logger.log(`TTL burn completed in ${duration}ms`);
      this.metrics.inc('loyalty_ttl_burn_runs_total', { result: 'success' });
    } catch (error) {
      this.logger.error('TTL burn failed', error);
      this.metrics.inc('loyalty_ttl_burn_runs_total', { result: 'error' });
    } finally {
      this.isRunning = false;
    }
  }

  private async burnExpiredPoints(merchantId: string, ttlDays: number) {
    const cutoff = new Date(Date.now() - ttlDays * 24 * 60 * 60 * 1000);
    
    // Find expired lots
    const expiredLots = await this.prisma.earnLot.findMany({ where: { merchantId, earnedAt: { lt: cutoff } } });

    // Group by customer
    const burnByCustomer = new Map<string, number>();
    for (const lot of expiredLots) {
      const remainingPoints = (lot.points || 0) - (lot.consumedPoints || 0);
      if (remainingPoints > 0) {
        const current = burnByCustomer.get(lot.customerId) || 0;
        burnByCustomer.set(lot.customerId, current + remainingPoints);
      }
    }

    // Process each customer
    for (const [customerId, burnAmount] of burnByCustomer) {
      await this.prisma.$transaction(async (tx) => {
        // Update wallet balance
        const wallet = await tx.wallet.findFirst({
          where: { merchantId, customerId, type: 'POINTS' },
        });

        if (!wallet || (wallet.balance ?? 0) < burnAmount) {
          this.logger.warn(
            `Skipping burn for ${customerId}: wallet balance ${wallet?.balance} < burn amount ${burnAmount}`,
          );
          return;
        }

        // Update wallet
        await tx.wallet.update({
          where: { id: wallet.id },
          data: { 
            balance: { decrement: burnAmount },
          },
        });

        // Mark lots as fully consumed
        const lotsToUpdate = expiredLots.filter(l => l.customerId === customerId);
        for (const lot of lotsToUpdate) {
          await tx.earnLot.update({
            where: { id: lot.id },
            data: { consumedPoints: lot.points },
          });
        }

        // Create outbox event
        await tx.eventOutbox.create({
          data: {
            merchantId,
            eventType: 'loyalty.points_ttl.burned',
            payload: {
              schemaVersion: 1,
              merchantId,
              customerId,
              amount: burnAmount,
              cutoff: cutoff.toISOString(),
              createdAt: new Date().toISOString(),
            },
          },
        });

        this.logger.log(
          `Burned ${burnAmount} points for customer ${customerId} (merchant: ${merchantId})`,
        );
        this.metrics.inc('loyalty_ttl_points_burned_total', {}, burnAmount);
      });
    }

    this.logger.log(
      `Processed TTL burn for merchant ${merchantId}: ${burnByCustomer.size} customers affected`,
    );
  }

  // Manual trigger for testing
  async triggerManualBurn(merchantId: string) {
    const settings = await this.prisma.merchantSettings.findUnique({
      where: { merchantId },
    });

    if (!settings?.pointsTtlDays) {
      throw new Error(`No TTL configured for merchant ${merchantId}`);
    }

    await this.burnExpiredPoints(merchantId, settings.pointsTtlDays);
    return { ok: true, ttlDays: settings.pointsTtlDays };
  }
}
