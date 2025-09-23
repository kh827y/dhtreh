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

  // ===== Promocodes (POINTS) issuance — idempotent per (voucherId, customerId, orderId)
  async redeemPoints(body: { merchantId: string; code: string; customerId: string; orderId?: string }) {
    const { merchantId, code, customerId } = body || ({} as any);
    if (!merchantId) throw new BadRequestException('merchantId required');
    if (!code) throw new BadRequestException('code required');
    if (!customerId) throw new BadRequestException('customerId required');

    const codeRow = await (this.prisma as any).voucherCode.findUnique({ where: { code } });
    if (!codeRow) throw new BadRequestException('Voucher code not found');
    const voucher = await (this.prisma as any).voucher.findUnique({ where: { id: codeRow.voucherId } });
    if (!voucher) throw new BadRequestException('Voucher not found');
    if (String(voucher.merchantId) !== merchantId) throw new BadRequestException('Voucher belongs to another merchant');

    // Ensure POINTS promocode
    if (String((voucher as any).type) !== 'PROMO_CODE' || String((voucher as any).valueType) !== 'POINTS') {
      throw new BadRequestException('Not a POINTS promocode');
    }

    const now = new Date();
    const withinCode = (!codeRow.validFrom || new Date(codeRow.validFrom) <= now) && (!codeRow.validUntil || new Date(codeRow.validUntil) >= now);
    const withinVoucher = (!voucher.validFrom || new Date(voucher.validFrom) <= now) && (!voucher.validUntil || new Date(voucher.validUntil) >= now);
    if (!withinCode || !withinVoucher) throw new BadRequestException('Voucher expired');

    // Idempotency: if usage for same (voucher, customer, orderId) already exists — return it
    try {
      const existing = await (this.prisma as any).voucherUsage.findFirst({ where: { voucherId: voucher.id, customerId, orderId: body.orderId ?? undefined } });
      if (existing) return { ok: true, points: existing.amount };
    } catch {}

    // Limits
    if (codeRow.maxUses != null && codeRow.usedCount >= codeRow.maxUses) throw new BadRequestException('Code usage limit reached');
    try {
      if ((voucher as any).maxTotalUses != null && (voucher as any).totalUsed != null) {
        if ((voucher as any).totalUsed >= (voucher as any).maxTotalUses) throw new BadRequestException('Voucher usage limit reached');
      }
    } catch {}
    try {
      const maxPerCustomer = (voucher as any).maxUsesPerCustomer;
      if (maxPerCustomer != null) {
        const usedByCustomer = await (this.prisma as any).voucherUsage.count?.({ where: { voucherId: voucher.id, customerId } })
          ?? (await (this.prisma as any).voucherUsage.findMany?.({ where: { voucherId: voucher.id, customerId } }) || []).length;
        if (usedByCustomer >= maxPerCustomer) throw new BadRequestException('Per-customer usage limit reached');
      }
    } catch {}

    const points = Math.max(0, Math.floor(Number((voucher as any).value || 0)));
    if (points <= 0) throw new BadRequestException('No points');

    // Record usage (best-effort)
    await (this.prisma as any).voucherUsage.create({ data: {
      voucherId: voucher.id,
      codeId: codeRow.id,
      customerId,
      orderId: body.orderId ?? null,
      amount: points,
      metadata: { valueType: 'POINTS' },
    }});
    try { await (this.prisma as any).voucherCode.update({ where: { id: codeRow.id }, data: { usedCount: (codeRow.usedCount || 0) + 1 } }); } catch {}
    try { await (this.prisma as any).voucher.update?.({ where: { id: voucher.id }, data: { totalUsed: ((voucher as any).totalUsed || 0) + 1 } }); } catch {}
    try { this.metrics.inc('promocodes_redeemed_total'); } catch {}
    return { ok: true, points };
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
    // Inactive checks
    if ((codeRow as any).status && String((codeRow as any).status) !== 'ACTIVE') {
      return { canApply: false, discount: 0, reason: 'inactive' } as any;
    }
    if ((voucher as any).isActive === false || (((voucher as any).status) && String((voucher as any).status) !== 'ACTIVE')) {
      return { canApply: false, discount: 0, reason: 'inactive' } as any;
    }
    const withinCode = (!codeRow.validFrom || new Date(codeRow.validFrom) <= now) && (!codeRow.validUntil || new Date(codeRow.validUntil) >= now);
    const withinVoucher = (!voucher.validFrom || new Date(voucher.validFrom) <= now) && (!voucher.validUntil || new Date(voucher.validUntil) >= now);
    if (!withinCode || !withinVoucher) return { canApply: false, discount: 0, reason: 'expired' };
    if (voucher.minPurchaseAmount && eligibleTotal < voucher.minPurchaseAmount) return { canApply: false, discount: 0, reason: 'min_purchase' };

    const discount = this.computeDiscount(String(voucher.valueType), Number(voucher.value || 0), eligibleTotal);
    const canApply = discount > 0;
    try { this.metrics.inc('vouchers_preview_requests_total', { result: canApply ? 'ok' : 'no_match' }); } catch {}
    return { canApply, discount, voucherId: voucher.id, codeId: codeRow.id };
  }

  async issue(body: {
    merchantId: string;
    name?: string;
    description?: string;
    valueType: 'PERCENTAGE'|'FIXED_AMOUNT'|'POINTS';
    value: number;
    code: string;
    validFrom?: string;
    validUntil?: string;
    minPurchaseAmount?: number;
    points?: number;
    awardPoints?: boolean;
    burnEnabled?: boolean;
    burnDays?: number;
    levelEnabled?: boolean;
    levelId?: string;
    usageLimit?: 'none'|'once_total'|'once_per_customer';
    usagePeriodEnabled?: boolean;
    usagePeriodDays?: number;
    recentVisitEnabled?: boolean;
    recentVisitHours?: number;
    metadata?: Record<string, any>;
  }) {
    const { merchantId, valueType, value, code } = body || ({} as any);
    if (!merchantId) throw new BadRequestException('merchantId required');
    if (!code) throw new BadRequestException('code required');
    if (!['PERCENTAGE','FIXED_AMOUNT','POINTS'].includes(String(valueType))) throw new BadRequestException('invalid valueType');
    const vf = body.validFrom ? new Date(body.validFrom) : null;
    const vu = body.validUntil ? new Date(body.validUntil) : null;
    const description = body.description ? String(body.description) : undefined;

    const awardPoints = body.awardPoints !== false;
    let pointsValue = Math.floor(Number(body.points ?? value ?? 0));
    if (!awardPoints && String(valueType) === 'POINTS') pointsValue = 0;
    const metadata: Record<string, any> = { ...(body.metadata || {}) };
    if (String(valueType) === 'POINTS') {
      metadata.awardPoints = awardPoints;
      metadata.pointsValue = Math.max(0, pointsValue);
    }

    if (body.burnEnabled) {
      const days = Math.max(1, Number(body.burnDays || 0));
      metadata.burn = { enabled: true, days };
    } else if (metadata.burn) {
      metadata.burn = { enabled: false };
    }

    if (body.levelEnabled && body.levelId) {
      metadata.level = { enabled: true, target: String(body.levelId) };
    } else if (metadata.level) {
      metadata.level = { enabled: false };
    }

    const usageLimit = body.usageLimit || 'none';
    metadata.usageLimit = usageLimit;
    let maxTotalUses: number | null = null;
    let maxPerCustomer: number | null = null;
    let codeMaxUses: number | null = null;
    if (usageLimit === 'once_total') {
      maxTotalUses = 1;
      codeMaxUses = 1;
    } else if (usageLimit === 'once_per_customer') {
      maxPerCustomer = 1;
      codeMaxUses = null;
    } else {
      codeMaxUses = null;
    }

    if (body.usagePeriodEnabled) {
      const days = Math.max(1, Number(body.usagePeriodDays || 0));
      metadata.usagePeriod = { enabled: true, days };
    } else if (metadata.usagePeriod) {
      metadata.usagePeriod = { enabled: false };
    }

    if (body.recentVisitEnabled) {
      const hours = Math.max(0, Number(body.recentVisitHours ?? 0));
      metadata.requireRecentVisit = { enabled: true, hours };
    } else if (metadata.requireRecentVisit) {
      metadata.requireRecentVisit = { enabled: false };
    }

    const pointsToStore = String(valueType) === 'POINTS' ? Math.max(0, pointsValue) : Math.floor(Number(value || 0));
    const voucher = await (this.prisma as any).voucher.create({ data: {
      merchantId,
      name: body.name || code,
      description: description || null,
      type: String(valueType) === 'POINTS' ? 'PROMO_CODE' : 'DISCOUNT',
      valueType,
      value: pointsToStore,
      minPurchaseAmount: body.minPurchaseAmount != null ? Math.floor(Number(body.minPurchaseAmount)) : null,
      validFrom: vf,
      validUntil: vu,
      metadata,
      maxTotalUses: maxTotalUses ?? undefined,
      maxUsesPerCustomer: maxPerCustomer ?? undefined,
    }});
    await (this.prisma as any).voucherCode.create({ data: { voucherId: voucher.id, code, validFrom: vf, validUntil: vu, maxUses: codeMaxUses ?? null } });
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

    // Simple limits
    // Per-code max uses
    if (codeRow.maxUses != null && codeRow.usedCount >= codeRow.maxUses) throw new BadRequestException('Code usage limit reached');
    // Per-voucher total uses
    try {
      if ((voucher as any).maxTotalUses != null && (voucher as any).totalUsed != null) {
        if ((voucher as any).totalUsed >= (voucher as any).maxTotalUses) throw new BadRequestException('Voucher usage limit reached');
      }
    } catch {}
    // Per-customer limit
    try {
      const maxPerCustomer = (voucher as any).maxUsesPerCustomer;
      if (maxPerCustomer != null) {
        const usedByCustomer = await (this.prisma as any).voucherUsage.count?.({ where: { voucherId: voucher.id, customerId } })
          ?? (await (this.prisma as any).voucherUsage.findMany?.({ where: { voucherId: voucher.id, customerId } }) || []).length;
        if (usedByCustomer >= maxPerCustomer) throw new BadRequestException('Per-customer usage limit reached');
      }
    } catch {}

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
    try { await (this.prisma as any).voucher.update?.({ where: { id: voucher.id }, data: { totalUsed: ((voucher as any).totalUsed || 0) + 1 } }); } catch {}
    try { this.metrics.inc('vouchers_redeemed_total'); } catch {}
    return { ok: true, discount };
  }

  async status(body: { merchantId: string; code?: string; voucherId?: string }) {
    const { merchantId, code, voucherId } = body || ({} as any);
    if (!merchantId) throw new BadRequestException('merchantId required');
    if (!code && !voucherId) throw new BadRequestException('code or voucherId required');
    let codeRow: any = null;
    let voucher: any = null;
    if (code) {
      codeRow = await (this.prisma as any).voucherCode.findUnique({ where: { code } });
      if (!codeRow) throw new BadRequestException('Voucher code not found');
      voucher = await (this.prisma as any).voucher.findUnique({ where: { id: codeRow.voucherId } });
    } else if (voucherId) {
      voucher = await (this.prisma as any).voucher.findUnique({ where: { id: voucherId } });
      if (!voucher) throw new BadRequestException('Voucher not found');
    }
    if (voucher && String(voucher.merchantId) !== merchantId) throw new BadRequestException('Voucher belongs to another merchant');
    return {
      voucherId: voucher?.id ?? codeRow?.voucherId,
      codeId: codeRow?.id ?? null,
      code: codeRow?.code ?? null,
      voucherStatus: (voucher as any)?.status ?? 'ACTIVE',
      voucherActive: (voucher as any)?.isActive ?? true,
      codeStatus: (codeRow as any)?.status ?? 'ACTIVE',
      codeUsedCount: (codeRow as any)?.usedCount ?? 0,
      codeMaxUses: (codeRow as any)?.maxUses ?? null,
      validFrom: (codeRow?.validFrom ?? voucher?.validFrom) ?? null,
      validUntil: (codeRow?.validUntil ?? voucher?.validUntil) ?? null,
      // extra fields for POINTS promocodes
      type: (voucher as any)?.type ?? 'DISCOUNT',
      valueType: (voucher as any)?.valueType ?? null,
      value: (voucher as any)?.value ?? null,
    } as any;
  }

  async deactivate(body: { merchantId: string; code?: string; voucherId?: string }) {
    const { merchantId, code, voucherId } = body || ({} as any);
    if (!merchantId) throw new BadRequestException('merchantId required');
    if (!code && !voucherId) throw new BadRequestException('code or voucherId required');
    if (code) {
      const codeRow = await (this.prisma as any).voucherCode.findUnique({ where: { code } });
      if (!codeRow) throw new BadRequestException('Voucher code not found');
      const voucher = await (this.prisma as any).voucher.findUnique({ where: { id: codeRow.voucherId } });
      if (!voucher) throw new BadRequestException('Voucher not found');
      if (String(voucher.merchantId) !== merchantId) throw new BadRequestException('Voucher belongs to another merchant');
      const now = new Date();
      try { await (this.prisma as any).voucherCode.update({ where: { id: codeRow.id }, data: { status: 'INACTIVE', validUntil: now } }); } catch {}
      try { this.metrics.inc('vouchers_deactivated_total', { scope: 'code' }); } catch {}
      return { ok: true };
    } else {
      const voucher = await (this.prisma as any).voucher.findUnique({ where: { id: voucherId } });
      if (!voucher) throw new BadRequestException('Voucher not found');
      if (String(voucher.merchantId) !== merchantId) throw new BadRequestException('Voucher belongs to another merchant');
      try { await (this.prisma as any).voucher.update({ where: { id: voucher.id }, data: { isActive: false, status: 'INACTIVE', validUntil: new Date() } }); } catch {}
      try { this.metrics.inc('vouchers_deactivated_total', { scope: 'voucher' }); } catch {}
      return { ok: true };
    }
  }

  async activate(body: { merchantId: string; code?: string; voucherId?: string }) {
    const { merchantId, code, voucherId } = body || ({} as any);
    if (!merchantId) throw new BadRequestException('merchantId required');
    if (!code && !voucherId) throw new BadRequestException('code or voucherId required');
    if (code) {
      const codeRow = await (this.prisma as any).voucherCode.findUnique({ where: { code } });
      if (!codeRow) throw new BadRequestException('Voucher code not found');
      const voucher = await (this.prisma as any).voucher.findUnique({ where: { id: codeRow.voucherId } });
      if (!voucher || String(voucher.merchantId) !== merchantId) throw new BadRequestException('Voucher belongs to another merchant');
      await (this.prisma as any).voucherCode.update({ where: { id: codeRow.id }, data: { status: 'ACTIVE' } });
      await (this.prisma as any).voucher.update({ where: { id: voucher.id }, data: { isActive: true, status: 'ACTIVE' } });
      return { ok: true };
    } else {
      const voucher = await (this.prisma as any).voucher.findUnique({ where: { id: voucherId } });
      if (!voucher || String(voucher.merchantId) !== merchantId) throw new BadRequestException('Voucher not found');
      await (this.prisma as any).voucher.update({ where: { id: voucher.id }, data: { isActive: true, status: 'ACTIVE' } });
      return { ok: true };
    }
  }

  async updatePromocode(merchantId: string, voucherId: string, body: {
    name?: string;
    description?: string;
    code?: string;
    points?: number;
    awardPoints?: boolean;
    burnEnabled?: boolean;
    burnDays?: number;
    levelEnabled?: boolean;
    levelId?: string;
    usageLimit?: 'none'|'once_total'|'once_per_customer';
    usagePeriodEnabled?: boolean;
    usagePeriodDays?: number;
    recentVisitEnabled?: boolean;
    recentVisitHours?: number;
    validFrom?: string;
    validUntil?: string;
  }) {
    if (!merchantId) throw new BadRequestException('merchantId required');
    if (!voucherId) throw new BadRequestException('voucherId required');
    const existing = await (this.prisma as any).voucher.findUnique({ where: { id: voucherId }, include: { codes: true } });
    if (!existing || String(existing.merchantId) !== merchantId) throw new BadRequestException('Voucher not found');

    const vf = body.validFrom ? new Date(body.validFrom) : existing.validFrom ?? null;
    const vu = body.validUntil ? new Date(body.validUntil) : existing.validUntil ?? null;
    const awardPoints = body.awardPoints !== false;
    const pointsValue = awardPoints ? Math.max(0, Math.floor(Number(body.points ?? existing.value ?? 0))) : 0;

    const metadata: Record<string, any> = { ...(existing.metadata || {}) };
    metadata.awardPoints = awardPoints;
    metadata.pointsValue = pointsValue;

    if (body.burnEnabled !== undefined) {
      if (body.burnEnabled) metadata.burn = { enabled: true, days: Math.max(1, Number(body.burnDays || 0)) };
      else metadata.burn = { enabled: false };
    }
    if (body.levelEnabled !== undefined) {
      if (body.levelEnabled && body.levelId) metadata.level = { enabled: true, target: String(body.levelId) };
      else metadata.level = { enabled: false };
    }
    if (body.usagePeriodEnabled !== undefined) {
      if (body.usagePeriodEnabled) metadata.usagePeriod = { enabled: true, days: Math.max(1, Number(body.usagePeriodDays || 0)) };
      else metadata.usagePeriod = { enabled: false };
    }
    if (body.recentVisitEnabled !== undefined) {
      if (body.recentVisitEnabled) metadata.requireRecentVisit = { enabled: true, hours: Math.max(0, Number(body.recentVisitHours ?? 0)) };
      else metadata.requireRecentVisit = { enabled: false };
    }

    const usageLimit = body.usageLimit || metadata.usageLimit || 'none';
    metadata.usageLimit = usageLimit;
    let maxTotalUses: number | null = null;
    let maxPerCustomer: number | null = null;
    let codeMaxUses: number | null = null;
    if (usageLimit === 'once_total') {
      maxTotalUses = 1;
      codeMaxUses = 1;
    } else if (usageLimit === 'once_per_customer') {
      maxPerCustomer = 1;
      codeMaxUses = null;
    }

    await (this.prisma as any).voucher.update({
      where: { id: voucherId },
      data: {
        name: body.name ?? existing.name,
        description: body.description ?? existing.description,
        value: pointsValue,
        validFrom: vf,
        validUntil: vu,
        metadata,
        maxTotalUses: maxTotalUses ?? null,
        maxUsesPerCustomer: maxPerCustomer ?? null,
      },
    });

    const codeRow = (existing.codes || [])[0];
    if (codeRow) {
      await (this.prisma as any).voucherCode.update({
        where: { id: codeRow.id },
        data: {
          code: body.code ? String(body.code) : codeRow.code,
          validFrom: vf,
          validUntil: vu,
          maxUses: codeMaxUses,
        },
      });
    }

    return { ok: true };
  }

  // ===== Admin helpers =====
  async list(args: { merchantId: string; status?: string; type?: string; limit: number }) {
    const { merchantId, status, type, limit } = args;
    if (!merchantId) throw new BadRequestException('merchantId required');
    const where: any = { merchantId };
    if (status) where.status = status;
    if (type) where.type = type;
    const vouchers = await (this.prisma as any).voucher.findMany?.({ where, orderBy: { createdAt: 'desc' }, take: limit })
      ?? [];
    const items: any[] = [];
    for (const v of vouchers) {
      let codes: any[] = [];
      try { codes = await (this.prisma as any).voucherCode.findMany({ where: { voucherId: v.id }, orderBy: { createdAt: 'desc' } }); } catch {}
      const totalCodes = codes.length;
      const activeCodes = codes.filter(c => String(c.status || 'ACTIVE') === 'ACTIVE').length;
      const usedCodes = codes.filter(c => (c.usedCount || 0) > 0).length;
      const codeSamples = codes.slice(0, 3).map(c => c.code);
      items.push({
        id: v.id,
        merchantId: v.merchantId,
        name: v.name || '',
        description: v.description || '',
        valueType: v.valueType,
        value: v.value,
        status: v.status,
        isActive: v.isActive,
        validFrom: v.validFrom || null,
        validUntil: v.validUntil || null,
        totalUsed: (v as any).totalUsed || 0,
        maxTotalUses: (v as any).maxTotalUses ?? null,
        metadata: (v as any).metadata ?? null,
        code: codeSamples[0] || null,
        codes: totalCodes,
        activeCodes,
        usedCodes,
        codeSamples,
      });
    }
    return { items };
  }

  async exportCsv(args: { merchantId: string; status?: string }) {
    const { merchantId, status } = args;
    const list = await this.list({ merchantId, status, limit: 1000 });
    const lines: string[] = [];
    const esc = (s: any) => {
      if (s == null) return '';
      const str = String(s);
      if (/[",\n]/.test(str)) return '"' + str.replace(/"/g, '""') + '"';
      return str;
    };
    lines.push(['id','merchantId','name','valueType','value','status','isActive','validFrom','validUntil','totalUsed','maxTotalUses','codes','activeCodes','usedCodes','codeSamples'].join(','));
    for (const it of list.items) {
      lines.push([
        esc(it.id), esc(it.merchantId), esc(it.name), esc(it.valueType), esc(it.value), esc(it.status), esc(it.isActive), esc(it.validFrom), esc(it.validUntil), esc(it.totalUsed), esc(it.maxTotalUses), esc(it.codes), esc(it.activeCodes), esc(it.usedCodes), esc((it.codeSamples || []).join('|'))
      ].join(','));
    }
    return lines.join('\n') + (lines.length ? '\n' : '');
  }
}
