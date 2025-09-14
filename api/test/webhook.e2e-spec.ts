import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma.service';
import * as crypto from 'crypto';

describe('Webhooks (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const ADMIN_KEY = process.env.ADMIN_KEY || 'test-admin-key';

  beforeAll(async () => {
    // Ensure ADMIN_KEY present for upstream admin-protected routes
    process.env.ADMIN_KEY = ADMIN_KEY;
    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
    prisma = app.get<PrismaService>(PrismaService);
  });

  afterAll(async () => {
    await app.close();
  });

  describe('Webhook signature', () => {
    it('should include correct signature headers on commit', async () => {
      const merchantId = 'M-webhook-test';
      const webhookSecret = 'test_webhook_secret';
      const webhookKeyId = 'key-1';

      // Setup merchant with webhook
      await request(app.getHttpServer())
        .put(`/merchants/${merchantId}/settings`)
        .set('x-admin-key', ADMIN_KEY)
        .send({
          earnBps: 500,
          redeemLimitBps: 5000,
          webhookUrl: 'https://example.com/webhook',
          webhookSecret,
          webhookKeyId,
        })
        .expect(200);

      // Create quote
      const quoteRes = await request(app.getHttpServer())
        .post('/loyalty/quote')
        .send({
          mode: 'earn',
          merchantId,
          orderId: 'webhook-test-1',
          total: 1000,
          eligibleTotal: 1000,
          userToken: 'C-webhook-test',
        })
        .expect(201);

      const holdId = quoteRes.body.holdId;

      // Commit and check signature
      const commitRes = await request(app.getHttpServer())
        .post('/loyalty/commit')
        .send({
          merchantId,
          holdId,
          orderId: 'webhook-test-1',
        })
        .expect(201);

      // Verify signature headers
      const signature = commitRes.headers['x-loyalty-signature'];
      expect(signature).toBeDefined();
      expect(signature).toMatch(/^v1,ts=\d+,sig=.+$/);

      const keyId = commitRes.headers['x-signature-key-id'];
      expect(keyId).toBe(webhookKeyId);

      // Verify signature is valid — robust parsing preserves '=' padding
      const [, ...pairs] = signature.split(',');
      const kv: Record<string, string> = {};
      for (const pair of pairs) {
        const idx = pair.indexOf('=');
        const k = pair.slice(0, idx);
        const v = pair.slice(idx + 1);
        kv[k] = v;
      }

      const expectedSig = crypto
        .createHmac('sha256', webhookSecret)
        .update(`${kv.ts}.${JSON.stringify(commitRes.body)}`)
        .digest('base64');

      const padB64 = (s: string) => s && s.length % 4 ? s + '='.repeat((4 - (s.length % 4)) % 4) : s;
      expect(padB64(kv.sig)).toBe(padB64(expectedSig));
    });

    it('should rotate webhook keys with useWebhookNext', async () => {
      const merchantId = 'M-webhook-rotate';
      const currentSecret = 'current_secret';
      const nextSecret = 'next_secret';
      const currentKeyId = 'key-current';
      const nextKeyId = 'key-next';

      // Setup with current and next keys
      await request(app.getHttpServer())
        .put(`/merchants/${merchantId}/settings`)
        .set('x-admin-key', ADMIN_KEY)
        .send({
          earnBps: 500,
          redeemLimitBps: 5000,
          webhookUrl: 'https://example.com/webhook',
          webhookSecret: currentSecret,
          webhookKeyId: currentKeyId,
          webhookSecretNext: nextSecret,
          webhookKeyIdNext: nextKeyId,
          useWebhookNext: false,
        })
        .expect(200);

      // First commit - should use current key
      const quote1 = await request(app.getHttpServer())
        .post('/loyalty/quote')
        .send({
          mode: 'earn',
          merchantId,
          orderId: 'rotate-1',
          total: 100,
          eligibleTotal: 100,
          userToken: 'C-rotate',
        })
        .expect(201);

      const commit1 = await request(app.getHttpServer())
        .post('/loyalty/commit')
        .send({
          merchantId,
          holdId: quote1.body.holdId,
          orderId: 'rotate-1',
        })
        .expect(201);

      expect(commit1.headers['x-signature-key-id']).toBe(currentKeyId);

      // Enable useWebhookNext
      await request(app.getHttpServer())
        .put(`/merchants/${merchantId}/settings`)
        .set('x-admin-key', ADMIN_KEY)
        .send({
          earnBps: 500,
          redeemLimitBps: 5000,
          useWebhookNext: true,
        })
        .expect(200);

      // Second commit - should use next key
      const quote2 = await request(app.getHttpServer())
        .post('/loyalty/quote')
        .send({
          mode: 'earn',
          merchantId,
          orderId: 'rotate-2',
          total: 100,
          eligibleTotal: 100,
          userToken: 'C-rotate',
        })
        .expect(201);

      const commit2 = await request(app.getHttpServer())
        .post('/loyalty/commit')
        .send({
          merchantId,
          holdId: quote2.body.holdId,
          orderId: 'rotate-2',
        })
        .expect(201);

      expect(commit2.headers['x-signature-key-id']).toBe(nextKeyId);

      // Verify next key signature — robust parsing preserves '=' padding
      const signature = commit2.headers['x-loyalty-signature'];
      const [, ...pairs] = signature.split(',');
      const kv: Record<string, string> = {};
      for (const pair of pairs) {
        const idx = pair.indexOf('=');
        const k = pair.slice(0, idx);
        const v = pair.slice(idx + 1);
        kv[k] = v;
      }

      const expectedSig = crypto
        .createHmac('sha256', nextSecret)
        .update(`${kv.ts}.${JSON.stringify(commit2.body)}`)
        .digest('base64');

      const padB64 = (s: string) => s && s.length % 4 ? s + '='.repeat((4 - (s.length % 4)) % 4) : s;
      expect(padB64(kv.sig)).toBe(padB64(expectedSig));
    });
  });

  describe('X-Event-Id deduplication', () => {
    it('should generate unique X-Event-Id for outbox events', async () => {
      const merchantId = 'M-event-id';
      
      await request(app.getHttpServer())
        .put(`/merchants/${merchantId}/settings`)
        .set('x-admin-key', ADMIN_KEY)
        .send({
          earnBps: 500,
          redeemLimitBps: 5000,
          webhookUrl: 'https://example.com/webhook',
        })
        .expect(200);

      // Create two transactions
      for (let i = 1; i <= 2; i++) {
        const quote = await request(app.getHttpServer())
          .post('/loyalty/quote')
          .send({
            mode: 'earn',
            merchantId,
            orderId: `event-${i}`,
            total: 100,
            eligibleTotal: 100,
            userToken: 'C-event',
          })
          .expect(201);

        await request(app.getHttpServer())
          .post('/loyalty/commit')
          .send({
            merchantId,
            holdId: quote.body.holdId,
            orderId: `event-${i}`,
          })
          .expect(201);
      }

      // Check outbox events have unique IDs
      const events = await prisma.eventOutbox.findMany({
        where: { merchantId },
        orderBy: { createdAt: 'asc' },
      });

      expect(events.length).toBeGreaterThan(0);
      const eventIds = events.map(e => e.id);
      const uniqueIds = new Set(eventIds);
      expect(uniqueIds.size).toBe(eventIds.length);
    });
  });

  describe('Idempotency', () => {
    it('should handle duplicate Idempotency-Key on commit', async () => {
      const merchantId = 'M-idem';
      const idempotencyKey = 'idem-key-' + Date.now();

      const quote = await request(app.getHttpServer())
        .post('/loyalty/quote')
        .send({
          mode: 'earn',
          merchantId,
          orderId: 'idem-1',
          total: 100,
          eligibleTotal: 100,
          userToken: 'C-idem',
        })
        .expect(201);

      // First commit
      const commit1 = await request(app.getHttpServer())
        .post('/loyalty/commit')
        .set('idempotency-key', idempotencyKey)
        .send({
          merchantId,
          holdId: quote.body.holdId,
          orderId: 'idem-1',
        })
        .expect(201);

      // Second commit with same idempotency key - should return cached response
      const commit2 = await request(app.getHttpServer())
        .post('/loyalty/commit')
        .set('idempotency-key', idempotencyKey)
        .send({
          merchantId,
          holdId: 'different-hold', // Different data but same key
          orderId: 'idem-2',
        });

      // Should return same response as first commit
      expect(commit2.body).toEqual(commit1.body);
    });

    it('should handle race conditions with idempotency', async () => {
      const merchantId = 'M-race';
      const idempotencyKey = 'race-key-' + Date.now();

      const quote = await request(app.getHttpServer())
        .post('/loyalty/quote')
        .send({
          mode: 'earn',
          merchantId,
          orderId: 'race-1',
          total: 100,
          eligibleTotal: 100,
          userToken: 'C-race',
        })
        .expect(201);

      // Parallel commits with same idempotency key
      const [res1, res2] = await Promise.all([
        request(app.getHttpServer())
          .post('/loyalty/commit')
          .set('idempotency-key', idempotencyKey)
          .send({
            merchantId,
            holdId: quote.body.holdId,
            orderId: 'race-1',
          }),
        request(app.getHttpServer())
          .post('/loyalty/commit')
          .set('idempotency-key', idempotencyKey)
          .send({
            merchantId,
            holdId: quote.body.holdId,
            orderId: 'race-1',
          }),
      ]);

      // Both should succeed with same response
      expect(res1.status).toBe(201);
      expect(res2.status).toBe(201);
      expect(res1.body).toEqual(res2.body);
    });

    it('should return cached response on duplicate Idempotency-Key for refund', async () => {
      const merchantId = 'M-idem-refund';
      const idempotencyKey = 'idem-refund-' + Date.now();

      // Create committed receipt
      const quote = await request(app.getHttpServer())
        .post('/loyalty/quote')
        .send({
          mode: 'earn',
          merchantId,
          orderId: 'idem-refund-1',
          total: 500,
          eligibleTotal: 500,
          userToken: 'C-idem-refund',
        })
        .expect(201);

      await request(app.getHttpServer())
        .post('/loyalty/commit')
        .send({ merchantId, holdId: quote.body.holdId, orderId: 'idem-refund-1' })
        .expect(201);

      // First refund with Idempotency-Key
      const r1 = await request(app.getHttpServer())
        .post('/loyalty/refund')
        .set('idempotency-key', idempotencyKey)
        .send({ merchantId, orderId: 'idem-refund-1', refundTotal: 100 })
        .expect(201);

      // Second refund with the same key but different refundTotal should return cached r1
      const r2 = await request(app.getHttpServer())
        .post('/loyalty/refund')
        .set('idempotency-key', idempotencyKey)
        .send({ merchantId, orderId: 'idem-refund-1', refundTotal: 200 })
        .expect(201);

      expect(r2.body).toEqual(r1.body);
    });
  });
});
