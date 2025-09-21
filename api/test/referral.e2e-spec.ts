import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma.service';

/**
 * E2E stubs for ReferralController with mocked Prisma.
 * Covers negative validations and a happy path for createProgram.
 */
describe('ReferralController (e2e, mocked Prisma)', () => {
  let app: INestApplication;

  const prismaMock: any = {
    $connect: jest.fn(async ()=>{}),
    $disconnect: jest.fn(async ()=>{}),
    referralProgram: {
      // Will be stubbed per test with jest.spyOn
      findFirst: jest.fn(async () => null),
      create: jest.fn(async (args: any) => ({ id: 'P1', ...args.data })),
      update: jest.fn(async (_args: any) => ({})),
    },
    referral: {
      findFirst: jest.fn(async () => null),
      count: jest.fn(async () => 0),
      create: jest.fn(async (args: any) => ({ id: 'R1', ...args.data })),
      update: jest.fn(async (_args: any) => ({})),
    },
    merchant: { findUnique: jest.fn(async () => ({ id: 'M1', name: 'M1' })), upsert: jest.fn(async ()=>({})) },
    personalReferralCode: { findFirst: jest.fn(async () => null), create: jest.fn(async()=>({})) },
    customer: { findUnique: jest.fn(async()=>({ id: 'C1', name: 'John' })) },
    wallet: {
      findFirst: jest.fn(async (_args: any) => ({ id: 'W1', balance: 0 })),
      create: jest.fn(async (args: any) => ({ id: 'W1', ...args.data })),
      findUnique: jest.fn(async (_args: any) => ({ id: 'W1', balance: 0 })),
      update: jest.fn(async (args: any) => ({ id: args.where.id, balance: (args.data?.balance ?? 0) })),
    },
    transaction: { create: jest.fn(async (_args: any) => ({ id: 'T1' })) },
    $transaction: async (fn: (tx: any)=>Promise<any>) => fn({
      wallet: {
        findFirst: async (_args: any) => ({ id: 'W1', balance: 0 }),
        create: async (args: any) => ({ id: 'W1', ...args.data }),
        findUnique: async (_args: any) => ({ id: 'W1', balance: 0 }),
        update: async (args: any) => ({ id: args.where.id, balance: (args.data?.balance ?? 0) }),
      },
      transaction: { create: async (_args: any) => ({ id: 'T1' }) },
      merchant: { upsert: async ()=>({}) },
      eventOutbox: { create: async (_args: any) => ({}) },
    }),
  };

  beforeAll(async () => {
    process.env.API_KEY = 'dev-api-key'; // allow ApiKeyGuard
    const moduleFixture: TestingModule = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue(prismaMock)
      .compile();
    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterAll(async () => { await app.close(); });

  it('POST /referral/program returns 400 when active program exists', async () => {
    jest.spyOn(prismaMock.referralProgram, 'findFirst').mockResolvedValueOnce({ id: 'EXIST', merchantId: 'M1', status: 'ACTIVE' });
    await request(app.getHttpServer())
      .post('/referral/program')
      .set('x-api-key', 'test-key')
      .send({ merchantId: 'M1', name: 'Prog', referrerReward: 10, refereeReward: 5 })
      .expect(400);
  });

  it('POST /referral/program returns 201 when no active program', async () => {
    jest.spyOn(prismaMock.referralProgram, 'findFirst').mockResolvedValueOnce(null);
    const res = await request(app.getHttpServer())
      .post('/referral/program')
      .set('x-api-key', 'test-key')
      .send({ merchantId: 'M1', name: 'Prog', referrerReward: 10, refereeReward: 5 })
      .expect(201);
    expect(res.body.id).toBe('P1');
  });

  it('POST /referral/create returns 400 when program not active', async () => {
    jest.spyOn(prismaMock.referralProgram, 'findFirst').mockResolvedValueOnce(null);
    await request(app.getHttpServer())
      .post('/referral/create')
      .set('x-api-key', 'test-key')
      .send({ merchantId: 'M1', referrerId: 'C1' })
      .expect(400);
  });

  it('POST /referral/activate returns 400 on invalid/expired code', async () => {
    jest.spyOn(prismaMock.referral, 'findFirst').mockResolvedValueOnce(null);
    await request(app.getHttpServer())
      .post('/referral/activate')
      .set('x-api-key', 'test-key')
      .send({ code: 'BAD', refereeId: 'C2' })
      .expect(400);
  });

  it('POST /referral/create returns 201 on happy path (LINK)', async () => {
    jest.spyOn(prismaMock.referralProgram, 'findFirst').mockResolvedValueOnce({ id: 'P1', merchantId: 'M1', status: 'ACTIVE', expiryDays: 30, maxReferrals: 100 });
    jest.spyOn(prismaMock.referral, 'count').mockResolvedValueOnce(0);
    const res = await request(app.getHttpServer())
      .post('/referral/create')
      .set('x-api-key', 'test-key')
      .send({ merchantId: 'M1', referrerId: 'C1', channel: 'LINK' })
      .expect(201);
    expect(res.body.id).toBe('R1');
    expect(typeof res.body.code).toBe('string');
    expect(typeof res.body.link).toBe('string');
  });

  it('POST /referral/activate returns 201 and welcome message on valid code', async () => {
    jest.spyOn(prismaMock.referral, 'findFirst').mockResolvedValueOnce({ id: 'R1', programId: 'P1', referrerId: 'C1', code: 'GOOD', status: 'PENDING', expiresAt: new Date(Date.now()+3600*1000), program: { merchantId: 'M1', refereeReward: 10 } });
    const res = await request(app.getHttpServer())
      .post('/referral/activate')
      .set('x-api-key', 'test-key')
      .send({ code: 'GOOD', refereeId: 'C2' })
      .expect(201);
    expect(res.body.success).toBe(true);
    expect(String(res.body.message||'')).toMatch(/Добро пожаловать|начислено/i);
  });
});
