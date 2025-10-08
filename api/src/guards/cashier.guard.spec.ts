import { ExecutionContext } from '@nestjs/common';
import { CashierGuard } from './cashier.guard';
import * as crypto from 'crypto';

describe('CashierGuard', () => {
  const hashKey = (key: string) =>
    crypto.createHash('sha256').update(key, 'utf8').digest('hex');
  let prisma: any;
  let guard: CashierGuard;

  const makeCtx = (req: any): ExecutionContext =>
    ({
      switchToHttp: () => ({ getRequest: () => req }),
    }) as any;

  beforeEach(() => {
    prisma = {
      merchantSettings: {
        findUnique: jest.fn().mockResolvedValue({ requireStaffKey: true }),
      },
      staff: { findFirst: jest.fn() },
      hold: { findUnique: jest.fn() },
      outlet: { findFirst: jest.fn() },
      receipt: { findUnique: jest.fn() },
    };
    guard = new CashierGuard(prisma);
  });

  it('разрешает доступ администраторам независимо от outletId', async () => {
    const key = 'adm-key';
    prisma.staff.findFirst.mockImplementation(async (args: any) => {
      if (args.where.apiKeyHash === hashKey(key)) {
        return { id: 'S-admin', role: 'ADMIN', accesses: [] };
      }
      return null;
    });

    const ctx = makeCtx({
      method: 'POST',
      route: { path: '/loyalty/quote' },
      headers: { 'x-staff-key': key },
      body: { merchantId: 'M1', outletId: 'O-1' },
      query: {},
      params: {},
    });

    await expect(guard.canActivate(ctx)).resolves.toBe(true);
  });

  it('блокирует кассира с allowedOutletId при несовпадении outlet', async () => {
    const key = 'cashier-key';
    prisma.staff.findFirst.mockImplementation(async (args: any) => {
      if (args.where.apiKeyHash === hashKey(key)) {
        return {
          id: 'S-cashier',
          role: 'CASHIER',
          allowedOutletId: 'O-1',
          accesses: [],
        };
      }
      return null;
    });

    const ctx = makeCtx({
      method: 'POST',
      route: { path: '/loyalty/commit' },
      headers: { 'x-staff-key': key },
      body: { merchantId: 'M1', outletId: 'O-2' },
      query: {},
      params: {},
    });

    await expect(guard.canActivate(ctx)).resolves.toBe(false);
  });

  it('разрешает кассиру с доступом к точке через StaffOutletAccess', async () => {
    const key = 'cashier-allowed';
    prisma.staff.findFirst.mockImplementation(async (args: any) => {
      if (args.where.apiKeyHash === hashKey(key)) {
        return {
          id: 'S-cashier',
          role: 'CASHIER',
          allowedOutletId: null,
          accesses: [{ outletId: 'O-3' }],
        };
      }
      return null;
    });

    const ctx = makeCtx({
      method: 'POST',
      route: { path: '/loyalty/refund' },
      headers: { 'x-staff-key': key },
      body: { merchantId: 'M1', outletId: 'O-3' },
      query: {},
      params: {},
    });

    await expect(guard.canActivate(ctx)).resolves.toBe(true);
  });

  it('требует outletId для кассира с ограничениями по точкам', async () => {
    const key = 'cashier-missing-outlet';
    prisma.staff.findFirst.mockImplementation(async (args: any) => {
      if (args.where.apiKeyHash === hashKey(key)) {
        return {
          id: 'S-cashier',
          role: 'CASHIER',
          allowedOutletId: null,
          accesses: [{ outletId: 'O-4' }],
        };
      }
      return null;
    });

    const ctx = makeCtx({
      method: 'POST',
      route: { path: '/loyalty/commit' },
      headers: { 'x-staff-key': key },
      body: { merchantId: 'M1' },
      query: {},
      params: {},
    });

    await expect(guard.canActivate(ctx)).resolves.toBe(false);
  });

  it('разрешает commit со staff-key, если outlet подтягивается из hold', async () => {
    const key = 'cashier-hold';
    prisma.staff.findFirst.mockImplementation(async (args: any) => {
      if (args.where.apiKeyHash === hashKey(key)) {
        return {
          id: 'S-cashier',
          role: 'CASHIER',
          allowedOutletId: 'O-5',
          accesses: [],
        };
      }
      return null;
    });
    prisma.hold.findUnique.mockResolvedValue({
      merchantId: 'M1',
      outletId: 'O-5',
    });

    const ctx = makeCtx({
      method: 'POST',
      route: { path: '/loyalty/commit' },
      headers: { 'x-staff-key': key },
      body: {
        merchantId: 'M1',
        holdId: 'H-7',
        orderId: 'ORD-1',
        outletId: 'O-foreign',
      },
      query: {},
      params: {},
    });

    await expect(guard.canActivate(ctx)).resolves.toBe(true);
  });

  it('игнорирует outlet из тела при наличии hold и использует outlet из hold', async () => {
    const key = 'cashier-hold-pref';
    prisma.staff.findFirst.mockImplementation(async (args: any) => {
      if (args.where.apiKeyHash === hashKey(key)) {
        return {
          id: 'S-cashier',
          role: 'CASHIER',
          allowedOutletId: 'O-7',
          accesses: [],
        };
      }
      return null;
    });
    prisma.hold.findUnique.mockResolvedValue({
      merchantId: 'M1',
      outletId: 'O-7',
    });

    const ctx = makeCtx({
      method: 'POST',
      route: { path: '/loyalty/commit' },
      headers: { 'x-staff-key': key },
      body: {
        merchantId: 'M1',
        holdId: 'H-8',
        orderId: 'ORD-2',
        outletId: 'O-evil',
      },
      query: {},
      params: {},
    });

    await expect(guard.canActivate(ctx)).resolves.toBe(true);
  });

  it('при requireStaffKey принимает валидную bridge-подпись даже с дополнительными полями', async () => {
    const secret = 'bridge_secret';
    const body = {
      merchantId: 'M-123',
      holdId: 'H-1',
      orderId: 'O-1',
      receiptNumber: 'R-777',
      extra: 'ignore-me',
    };
    const payload = JSON.stringify({
      merchantId: 'M-123',
      holdId: 'H-1',
      orderId: 'O-1',
      receiptNumber: 'R-777',
    });
    const ts = Math.floor(Date.now() / 1000).toString();
    const sig = crypto
      .createHmac('sha256', secret)
      .update(ts + '.' + payload)
      .digest('base64');
    const header = `v1,ts=${ts},sig=${sig}`;

    prisma.merchantSettings.findUnique.mockResolvedValue({
      requireStaffKey: true,
      bridgeSecret: secret,
    });
    prisma.hold.findUnique.mockResolvedValue({
      merchantId: 'M-123',
      outletId: null,
    });

    const ctx = makeCtx({
      method: 'POST',
      route: { path: '/loyalty/commit' },
      headers: { 'x-bridge-signature': header },
      body,
      query: {},
      params: {},
    });

    await expect(guard.canActivate(ctx)).resolves.toBe(true);
  });

  it('для bridge-подписи commit использует секрет точки из hold, игнорируя outlet из тела', async () => {
    const secret = 'hold_bridge_secret';
    const body = {
      merchantId: 'M-77',
      holdId: 'H-2',
      orderId: 'O-700',
      outletId: 'O-fake',
    };
    const payload = JSON.stringify({
      merchantId: 'M-77',
      holdId: 'H-2',
      orderId: 'O-700',
    });
    const ts = Math.floor(Date.now() / 1000).toString();
    const sig = crypto
      .createHmac('sha256', secret)
      .update(ts + '.' + payload)
      .digest('base64');
    const header = `v1,ts=${ts},sig=${sig}`;

    prisma.merchantSettings.findUnique.mockResolvedValue({
      requireStaffKey: true,
      requireBridgeSig: true,
    });
    prisma.hold.findUnique.mockResolvedValue({
      merchantId: 'M-77',
      outletId: 'O-hold',
    });
    const outletSpy = jest.fn().mockImplementation(async (args: any) => {
      expect(args.where).toEqual({ id: 'O-hold', merchantId: 'M-77' });
      return { bridgeSecret: secret, bridgeSecretNext: null };
    });
    prisma.outlet.findFirst = outletSpy;

    const ctx = makeCtx({
      method: 'POST',
      route: { path: '/loyalty/commit' },
      headers: { 'x-bridge-signature': header },
      body,
      query: {},
      params: {},
    });

    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect(outletSpy).toHaveBeenCalledTimes(1);
    prisma.outlet.findFirst = jest.fn();
  });

  it('при requireStaffKey пропускает QR с валидной bridge-подписью', async () => {
    const secret = 'qr_secret';
    const payload = JSON.stringify({ merchantId: 'M-QR', customerId: 'C-1' });
    const ts = Math.floor(Date.now() / 1000).toString();
    const sig = crypto
      .createHmac('sha256', secret)
      .update(ts + '.' + payload)
      .digest('base64');
    const header = `v1,ts=${ts},sig=${sig}`;

    prisma.merchantSettings.findUnique.mockResolvedValue({
      requireStaffKey: true,
      bridgeSecret: secret,
    });

    const ctx = makeCtx({
      method: 'POST',
      route: { path: '/loyalty/qr' },
      headers: { 'x-bridge-signature': header },
      body: { merchantId: 'M-QR', customerId: 'C-1' },
      query: {},
      params: {},
    });

    await expect(guard.canActivate(ctx)).resolves.toBe(true);
  });

  it('при requireStaffKey пропускает QR с initData без подписи', async () => {
    prisma.merchantSettings.findUnique.mockResolvedValue({
      requireStaffKey: true,
    });

    const ctx = makeCtx({
      method: 'POST',
      route: { path: '/loyalty/qr' },
      headers: {},
      body: { merchantId: 'M-QR', customerId: 'C-1', initData: 'query_id=1' },
      query: {},
      params: {},
    });

    await expect(guard.canActivate(ctx)).resolves.toBe(true);
  });

  it('при requireStaffKey принимает валидную bridge-подпись на refund, игнорируя необязательные поля', async () => {
    const secret = 'refund_secret';
    const body = {
      merchantId: 'M-55',
      orderId: 'O-99',
      refundTotal: 1500,
      refundEligibleTotal: 1200,
      reason: 'double-charge',
    };
    const payload = JSON.stringify({
      merchantId: 'M-55',
      orderId: 'O-99',
      refundTotal: 1500,
      refundEligibleTotal: 1200,
    });
    const ts = Math.floor(Date.now() / 1000).toString();
    const sig = crypto
      .createHmac('sha256', secret)
      .update(ts + '.' + payload)
      .digest('base64');
    const header = `v1,ts=${ts},sig=${sig}`;

    prisma.merchantSettings.findUnique.mockResolvedValue({
      requireStaffKey: true,
      bridgeSecret: secret,
    });
    prisma.receipt.findUnique.mockResolvedValue({ outletId: 'OUT-77' });
    prisma.outlet.findFirst.mockResolvedValue({
      bridgeSecret: secret,
      bridgeSecretNext: null,
    });

    const ctx = makeCtx({
      method: 'POST',
      route: { path: '/loyalty/refund' },
      headers: { 'x-bridge-signature': header },
      body,
      query: {},
      params: {},
    });

    await expect(guard.canActivate(ctx)).resolves.toBe(true);
  });
});
