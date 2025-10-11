import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from './../src/app.module';
import { PrismaService } from './../src/prisma.service';
import { hashPassword } from './../src/password.util';

// e2e for PortalAuth: login (no TOTP), login (with TOTP), invalid creds, /portal/auth/me, impersonation

describe('PortalAuth (e2e)', () => {
  let app: INestApplication;
  const prismaMock: any = {
    $connect: jest.fn(async () => {}),
    $disconnect: jest.fn(async () => {}),
    merchant: {
      findFirst: jest.fn(async (args: any) => {
        const email = args?.where?.portalEmail;
        if (!email) return null;
        if (String(email) === 'm1@mail.test') {
          return {
            id: 'M-1',
            portalEmail: 'm1@mail.test',
            portalLoginEnabled: true,
            portalPasswordHash: hashPassword('secret123'),
            portalTotpEnabled: false,
            portalTotpSecret: null,
          } as any;
        }
        if (String(email) === 'm2@mail.test') {
          return {
            id: 'M-2',
            portalEmail: 'm2@mail.test',
            portalLoginEnabled: true,
            portalPasswordHash: hashPassword('totp-pass'),
            portalTotpEnabled: true,
            // base32 secret
            portalTotpSecret: 'JBSWY3DPEHPK3PXP',
          } as any;
        }
        // disabled or not found
        if (String(email) === 'disabled@mail.test') {
          return {
            id: 'M-3',
            portalEmail: 'disabled@mail.test',
            portalLoginEnabled: false,
            portalPasswordHash: hashPassword('x'),
            portalTotpEnabled: false,
          } as any;
        }
        if (String(email) === 'staff1@mail.test') {
          return {
            id: 'M-conflict',
            portalEmail: 'staff1@mail.test',
            portalLoginEnabled: true,
            portalPasswordHash: hashPassword('merchant-secret'),
            portalTotpEnabled: false,
            portalTotpSecret: null,
          } as any;
        }
        return null;
      }),
      update: jest.fn(async () => ({})),
    },
    staff: {
      findFirst: jest.fn(async (args: any) => {
        const email = args?.where?.email;
        if (!email) return null;
        const normalized = String(email).toLowerCase();
        if (normalized === 'staff1@mail.test') {
          return {
            id: 'STF-1',
            merchantId: 'M-STAFF',
            email: 'staff1@mail.test',
            status: 'ACTIVE',
            portalAccessEnabled: true,
            canAccessPortal: true,
            hash: hashPassword('staff-secret'),
            role: 'MANAGER',
            accessGroupMemberships: [],
          } as any;
        }
        if (normalized === 'staff-disabled@mail.test') {
          return {
            id: 'STF-2',
            merchantId: 'M-STAFF',
            email: 'staff-disabled@mail.test',
            status: 'SUSPENDED',
            portalAccessEnabled: false,
            canAccessPortal: false,
            hash: hashPassword('staff-secret'),
            role: 'CASHIER',
            accessGroupMemberships: [],
          } as any;
        }
        return null;
      }),
      update: jest.fn(async () => ({})),
    },
  };

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.WORKERS_ENABLED = '0';
    process.env.METRICS_DEFAULTS = '0';
    process.env.ADMIN_KEY = 'test-admin-key';
    process.env.PORTAL_JWT_SECRET = 'test-portal-secret';
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

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('POST /portal/auth/login — logs in with email+password (no TOTP)', async () => {
    const res = await request(app.getHttpServer())
      .post('/portal/auth/login')
      .send({ email: 'm1@mail.test', password: 'secret123' })
      .expect(201);
    expect(typeof res.body.token).toBe('string');
    expect(res.body.token.length).toBeGreaterThan(10);
    const me = await request(app.getHttpServer())
      .get('/portal/auth/me')
      .set('authorization', `Bearer ${res.body.token}`)
      .expect(200);
    expect(me.body.merchantId).toBe('M-1');
    expect(me.body.role).toBe('MERCHANT');
    expect(me.body.actor).toBe('MERCHANT');
    expect(me.body.staffId).toBeNull();
  });

  it('POST /portal/auth/login — requires TOTP when enabled', async () => {
    // Missing code => 401
    await request(app.getHttpServer())
      .post('/portal/auth/login')
      .send({ email: 'm2@mail.test', password: 'totp-pass' })
      .expect(401);

    // Wrong code => 401
    await request(app.getHttpServer())
      .post('/portal/auth/login')
      .send({ email: 'm2@mail.test', password: 'totp-pass', code: '000000' })
      .expect(401);

    // Correct code => 201
    const { authenticator } = require('otplib');
    const code = authenticator.generate('JBSWY3DPEHPK3PXP');
    const ok = await request(app.getHttpServer())
      .post('/portal/auth/login')
      .send({ email: 'm2@mail.test', password: 'totp-pass', code })
      .expect(201);
    expect(typeof ok.body.token).toBe('string');
  });

  it('POST /portal/auth/login — invalid credentials => 401', async () => {
    await request(app.getHttpServer())
      .post('/portal/auth/login')
      .send({ email: 'm1@mail.test', password: 'wrong' })
      .expect(401);
  });

  it('POST /portal/auth/login — staff email+password without TOTP', async () => {
    const res = await request(app.getHttpServer())
      .post('/portal/auth/login')
      .send({ email: 'staff1@mail.test', password: 'staff-secret' })
      .expect(201);
    expect(typeof res.body.token).toBe('string');
    expect(prismaMock.staff.update).toHaveBeenCalled();
    const me = await request(app.getHttpServer())
      .get('/portal/auth/me')
      .set('authorization', `Bearer ${res.body.token}`)
      .expect(200);
    expect(me.body.merchantId).toBe('M-STAFF');
    expect(me.body.actor).toBe('STAFF');
    expect(me.body.staffId).toBe('STF-1');
    expect(me.body.role).toBe('MANAGER');
  });

  it('POST /portal/auth/login — staff without portal access rejected', async () => {
    await request(app.getHttpServer())
      .post('/portal/auth/login')
      .send({ email: 'staff-disabled@mail.test', password: 'staff-secret' })
      .expect(401);
    expect(prismaMock.staff.update).not.toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'STF-2' } }),
    );
  });

  it('POST /merchants/:id/portal/impersonate — issues token; GET /portal/auth/me accepts it', async () => {
    const imp = await request(app.getHttpServer())
      .post('/merchants/M-imp/portal/impersonate')
      .set('X-Admin-Key', 'test-admin-key')
      .expect(201);
    const token = imp.body?.token;
    expect(typeof token).toBe('string');

    const me = await request(app.getHttpServer())
      .get('/portal/auth/me')
      .set('authorization', `Bearer ${token}`)
      .expect(200);
    expect(me.body.merchantId).toBe('M-imp');
    expect(me.body.actor).toBe('MERCHANT');
  });
});
