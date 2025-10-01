import { ExecutionContext } from '@nestjs/common';
import { CashierGuard } from './cashier.guard';
import * as crypto from 'crypto';

describe('CashierGuard', () => {
  const hashKey = (key: string) => crypto.createHash('sha256').update(key, 'utf8').digest('hex');
  let prisma: any;
  let guard: CashierGuard;

  const makeCtx = (req: any): ExecutionContext => ({
    switchToHttp: () => ({ getRequest: () => req }),
  } as any);

  beforeEach(() => {
    prisma = {
      merchantSettings: { findUnique: jest.fn().mockResolvedValue({ requireStaffKey: true }) },
      staff: { findFirst: jest.fn() },
      hold: { findUnique: jest.fn().mockResolvedValue(null) },
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
        return { id: 'S-cashier', role: 'CASHIER', allowedOutletId: 'O-1', accesses: [] };
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
        return { id: 'S-cashier', role: 'CASHIER', allowedOutletId: null, accesses: [{ outletId: 'O-3' }] };
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
        return { id: 'S-cashier', role: 'CASHIER', allowedOutletId: null, accesses: [{ outletId: 'O-4' }] };
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

  it('пропускает commit без staff key при переданной подписи Bridge', async () => {
    const ctx = makeCtx({
      method: 'POST',
      route: { path: '/loyalty/commit' },
      headers: { 'x-bridge-signature': 'sig' },
      body: { merchantId: 'M1' },
      query: {},
      params: {},
    });

    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect(prisma.merchantSettings.findUnique).toHaveBeenCalledWith({ where: { merchantId: 'M1' } });
    expect(prisma.staff.findFirst).not.toHaveBeenCalled();
  });

  it('использует merchantId и outletId из hold для проверки staff key', async () => {
    const key = 'hold-key';
    prisma.hold.findUnique.mockResolvedValue({ merchantId: 'M-hold', outletId: 'O-hold' });
    prisma.staff.findFirst.mockImplementation(async (args: any) => {
      if (args.where.apiKeyHash === hashKey(key) && args.where.merchantId === 'M-hold') {
        return { id: 'S-admin', role: 'ADMIN', accesses: [] };
      }
      return null;
    });

    const ctx = makeCtx({
      method: 'POST',
      route: { path: '/loyalty/commit' },
      headers: { 'x-staff-key': key },
      body: { holdId: 'H-1' },
      query: {},
      params: {},
    });

    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect(prisma.hold.findUnique).toHaveBeenCalledWith({
      where: { id: 'H-1' },
      select: { merchantId: true, outletId: true },
    });
  });
});
