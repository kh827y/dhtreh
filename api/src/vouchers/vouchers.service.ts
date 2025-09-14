import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { MetricsService } from '../metrics.service';

@Injectable()
export class VouchersService {
  constructor(private prisma: PrismaService, private metrics: MetricsService) {}

  private computeDiscount(valueType: string, value: number, eligibleTotal: number): number {
    if (valueType === 'PERCENTAGE') return Math.floor((value || 0) * eligibleTotal / 100);
    if (valueType === 'FIXED_AMOUNT') return Math.max(0, Math.min(eligibleTotal, value || 0));
    return 0;
  }

  async preview(body: { merchantId: string; code: string; eligibleTotal: number; customerId?: string }) {
    const { merchantId, code, eligibleTotal } = body;
    if (!merchantId) throw new BadRequestException('merchantId required');
    if (!code) throw new BadRequestException('code required');
    if (!Number.isFinite(eligibleTotal) || eligibleTotal <= 0) throw new BadRequestException('eligibleTotal must be > 0');

    const codeRow = await (this.prisma as any).voucherCode?.findUnique?.({ where: { code } });
    if (!codeRow) throw new BadRequestException('Voucher code not found');
    const voucher = await (this.prisma as any).voucher?.findUnique?.({ where: { id: codeRow.voucherId } });
    if (!voucher) throw new BadRequestException('Voucher not found');
    if (String(voucher.merchantId) !== merchantId) throw new BadRequestException('Voucher belongs to another merchant');

    const now = new Date();
    const withinCode = (!codeRow.validFrom || new Date(codeRow.validFrom) <= now) && (!codeRow.validUntil || new Date(codeRow.validUntil) >= now);
    const withinVoucher = (!voucher.validFrom || new Date(voucher.validFrom) <= now) && (!voucher.validUntil || new Date(voucher.validUntil) >= now);
    if (!withinCode || !withinVoucher) return { canApply: false, discount: 0, reason: 'expired' };
    if (voucher.minPurchaseAmount && eligibleTotal < voucher.minPurchaseAmount) return { canApply: false, discount: 0, reason: 'min_purchase' };

    const discount = this.computeDiscount(String(voucher.valueType), Number(voucher.value || 0), eligibleTotal);
    const canApply = discount > 0;
    try { this.metrics.inc('vouchers_preview_requests_total', { result: canApply ? 'ok' : 'no_match' }); } catch {}
    return { canApply, discount, voucherId: voucher.id, codeId: codeRow.id };
  }

  async issue(body: { merchantId: string; name?: string; valueType: 'PERCENTAGE'|'FIXED_AMOUNT'; value: number; code: string; validFrom?: string; validUntil?: string; minPurchaseAmount?: number }) {
    const { merchantId, valueType, value, code } = body || ({} as any);
    if (!merchantId) throw new BadRequestException('merchantId required');
    if (!code) throw new BadRequestException('code required');
    if (!['PERCENTAGE','FIXED_AMOUNT'].includes(String(valueType))) throw new BadRequestException('invalid valueType');
    const vf = body.validFrom ? new Date(body.validFrom) : null;
    const vu = body.validUntil ? new Date(body.validUntil) : null;
    const voucher = await (this.prisma as any).voucher.create({ data: {
      merchantId,
      name: body.name || code,
      type: 'DISCOUNT',
      valueType,
      value: Math.floor(Number(value||0)),
      minPurchaseAmount: body.minPurchaseAmount != null ? Math.floor(Number(body.minPurchaseAmount)) : null,
      validFrom: vf,
      validUntil: vu,
    }});
    await (this.prisma as any).voucherCode.create({ data: { voucherId: voucher.id, code, validFrom: vf, validUntil: vu, maxUses: 1 } });
    try { this.metrics.inc('vouchers_issued_total'); } catch {}
    return { ok: true, voucherId: voucher.id };
  }

  async redeem(body: { merchantId: string; code: string; customerId: string; eligibleTotal: number; orderId?: string }) {
    const { merchantId, code, customerId, eligibleTotal } = body || ({} as any);
    if (!merchantId) throw new BadRequestException('merchantId required');
    if (!code) throw new BadRequestException('code required');
    if (!customerId) throw new BadRequestException('customerId required');
    if (!Number.isFinite(eligibleTotal) || eligibleTotal <= 0) throw new BadRequestException('eligibleTotal must be > 0');

    const codeRow = await (this.prisma as any).voucherCode.findUnique({ where: { code } });
    if (!codeRow) throw new BadRequestException('Voucher code not found');
    const voucher = await (this.prisma as any).voucher.findUnique({ where: { id: codeRow.voucherId } });
    if (!voucher) throw new BadRequestException('Voucher not found');
    if (String(voucher.merchantId) !== merchantId) throw new BadRequestException('Voucher belongs to another merchant');

    const now = new Date();
    const withinCode = (!codeRow.validFrom || new Date(codeRow.validFrom) <= now) && (!codeRow.validUntil || new Date(codeRow.validUntil) >= now);
    const withinVoucher = (!voucher.validFrom || new Date(voucher.validFrom) <= now) && (!voucher.validUntil || new Date(voucher.validUntil) >= now);
    if (!withinCode || !withinVoucher) throw new BadRequestException('Voucher expired');
    if (voucher.minPurchaseAmount && eligibleTotal < voucher.minPurchaseAmount) throw new BadRequestException('Below min purchase');

    // Idempotency: if usage for same (voucher, customer, orderId) already exists — return it regardless of usage limits
    try {
      const existing = await (this.prisma as any).voucherUsage.findFirst({ where: { voucherId: voucher.id, customerId, orderId: body.orderId ?? undefined } });
      if (existing) return { ok: true, discount: existing.amount };
    } catch {}

    // Simple limits: maxUses on code
    if (codeRow.maxUses != null && codeRow.usedCount >= codeRow.maxUses) throw new BadRequestException('Code usage limit reached');

    const discount = this.computeDiscount(String(voucher.valueType), Number(voucher.value || 0), eligibleTotal);
    if (discount <= 0) throw new BadRequestException('No discount');

    // Record usage (best-effort)
    await (this.prisma as any).voucherUsage.create({ data: {
      voucherId: voucher.id,
      codeId: codeRow.id,
      customerId,
      orderId: body.orderId ?? null,
      amount: discount,
      metadata: {},
    }});
    try { await (this.prisma as any).voucherCode.update({ where: { id: codeRow.id }, data: { usedCount: (codeRow.usedCount || 0) + 1 } }); } catch {}
    try { this.metrics.inc('vouchers_redeemed_total'); } catch {}
    return { ok: true, discount };
  }
}
