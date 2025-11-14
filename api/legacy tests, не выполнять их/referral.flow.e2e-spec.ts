import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma.service';

/**
 * E2E: Referrals happy path — create -> activate -> complete
 */
describe('Referrals flow (e2e, mocked Prisma)', () => {
  let app: INestApplication;

  const state = {
    programs: [] as any[],
    referrals: [] as any[],
    wallets: new Map<string, { id: string; balance: number }>(),
    txns: [] as Array<{
      id: string;
      merchantId: string;
      customerId: string;
      type: 'EARN' | 'REDEEM';
      amount: number;
      createdAt: Date;
    }>,
    id: { program: 0, referral: 0, txn: 0 },
  };

  const prismaMock: any = {
    $connect: jest.fn(async () => {}),
    $disconnect: jest.fn(async () => {}),
    $transaction: async (fn: (tx: any) => any) =>
      fn({
        wallet: {
          findFirst: async (args: any) => {
            const key = `${args.where.merchantId}|${args.where.customerId}`;
            const w = state.wallets.get(key) || { id: 'W-' + key, balance: 0 };
            state.wallets.set(key, w);
            return { id: w.id, balance: w.balance };
          },
          create: async (args: any) => {
            const key = `${args.data.merchantId}|${args.data.customerId}`;
            const w = { id: 'W-' + key, balance: 0 };
            state.wallets.set(key, w);
            return { id: w.id, balance: w.balance };
          },
          findUnique: async (args: any) => {
            for (const [k, v] of state.wallets.entries())
              if (v.id === args.where.id)
                return { id: v.id, balance: v.balance } as any;
            return null;
          },
          update: async (args: any) => {
            for (const [k, v] of state.wallets.entries())
              if (v.id === args.where.id) {
                v.balance = args.data.balance;
                return { id: v.id, balance: v.balance } as any;
              }
            throw new Error('wallet not found');
          },
        },
        transaction: {
          create: async (args: any) => {
            const id = 'T' + ++state.id.txn;
            state.txns.push({ id, ...args.data, createdAt: new Date() });
            return { id };
          },
        },
        merchant: { upsert: async () => ({}) },
        eventOutbox: { create: async (_args: any) => ({}) },
      }),
    merchant: {
      findUnique: async (args: any) => ({
        id: args.where.id,
        name: args.where.id,
      }),
      upsert: async () => ({}),
    },
    referralProgram: {
      findFirst: async (args: any) => {
        const where = args.where || {};
        if (where.id)
          return state.programs.find((p) => p.id === where.id) || null;
        if (where.merchantId && where.status === 'ACTIVE')
          return (
            state.programs.find(
              (p) => p.merchantId === where.merchantId && p.status === 'ACTIVE',
            ) || null
          );
        return state.programs[0] || null;
      },
      create: async (args: any) => {
        const p = {
          id: 'P' + ++state.id.program,
          createdAt: new Date(),
          ...args.data,
        };
        state.programs.push(p);
        return p;
      },
      update: async (args: any) => {
        const i = state.programs.findIndex((p) => p.id === args.where.id);
        if (i >= 0) {
          state.programs[i] = { ...state.programs[i], ...args.data };
          return state.programs[i];
        }
        return null;
      },
    },
    referral: {
      findFirst: async (args: any) => {
        const where = args.where || {};
        let items = state.referrals.slice();
        if (where.code != null)
          items = items.filter((r) => r.code === where.code);
        if (where.status != null)
          items = items.filter((r) => r.status === where.status);
        if (where.expiresAt?.gt)
          items = items.filter(
            (r) => r.expiresAt && r.expiresAt > where.expiresAt.gt,
          );
        if (where.refereeId != null)
          items = items.filter((r) => r.refereeId === where.refereeId);
        if (where.programId != null)
          items = items.filter((r) => r.programId === where.programId);
        if (where.program) {
          if (where.program.merchantId)
            items = items.filter(
              (r) => r.program.merchantId === where.program.merchantId,
            );
          if (where.program.status)
            items = items.filter(
              (r) => r.program.status === where.program.status,
            );
        }
        return items[0] || null;
      },
      count: async (args: any) =>
        state.referrals.filter(
          (r) =>
            r.referrerId === args.where.referrerId &&
            r.programId === args.where.programId,
        ).length,
      create: async (args: any) => {
        const inc = ++state.id.referral;
        const referral = {
          id: 'R' + inc,
          ...args.data,
          code: args.data.code || `REF${inc}`,
          createdAt: new Date(),
          expiresAt:
            args.data.expiresAt ||
            new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          program: state.programs.find((p) => p.id === args.data.programId) || {
            merchantId: args.data.merchantId || 'M-R',
            status: 'ACTIVE',
            name: 'Prog',
          },
          referrer: { id: args.data.referrerId, name: 'Referrer' },
        };
        state.referrals.push(referral);
        return referral;
      },
      update: async (args: any) => {
        const i = state.referrals.findIndex((r) => r.id === args.where.id);
        if (i >= 0) {
          state.referrals[i] = { ...state.referrals[i], ...args.data };
          return state.referrals[i];
        }
        return null;
      },
    },
    personalReferralCode: {
      findFirst: async () => null,
      create: async () => ({}),
    },
    customer: {
      findUnique: async (args: any) => ({ id: args.where.id, name: 'John' }),
    },
  };

  beforeAll(async () => {
    process.env.API_KEY = 'dev-api-key';
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue(prismaMock)
      .compile();
    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('create -> activate -> complete', async () => {
    // 1) Create program
    const p = await request(app.getHttpServer())
      .post('/referral/program')
      .set('x-api-key', 'test-key')
      .send({
        merchantId: 'M-R',
        name: 'Program',
        referrerReward: 20,
        refereeReward: 10,
        minPurchaseAmount: 100,
      })
      .expect(201);
    expect(p.body.id).toBeDefined();

    // 2) Create referral link/code
    const cr = await request(app.getHttpServer())
      .post('/referral/create')
      .set('x-api-key', 'test-key')
      .send({ merchantId: 'M-R', referrerId: 'REF', channel: 'LINK' })
      .expect(201);
    expect(cr.body.id).toBeDefined();
    const code = cr.body.code as string;
    expect(typeof code).toBe('string');

    // 3) Activate by referee
    const act = await request(app.getHttpServer())
      .post('/referral/activate')
      .set('x-api-key', 'test-key')
      .send({ code, refereeId: 'NEWC' })
      .expect(201);
    expect(act.body.success).toBe(true);

    // 4) Complete after first purchase
    const comp = await request(app.getHttpServer())
      .post('/referral/complete')
      .set('x-api-key', 'test-key')
      .send({ refereeId: 'NEWC', merchantId: 'M-R', purchaseAmount: 500 })
      .expect(201);
    expect(comp.body.success).toBe(true);
    expect(comp.body.rewardIssued).toBe(20);
  });
});
