import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';

// Negative-path: invalid config should 400 and increment pos_requests_total error

describe('ModulKassa register (e2e, negative)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    process.env.WORKERS_ENABLED = '0';
    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('returns 400 on invalid config and exports error metric', async () => {
    // Missing required apiKey
    await request(app.getHttpServer())
      .post('/integrations/modulkassa/register')
      .set('Authorization', 'Bearer dev')
      .send({ merchantId: 'M-X', baseUrl: 'http://localhost' })
      .expect(400);

    const metrics = await request(app.getHttpServer())
      .get('/metrics')
      .expect(200);
    expect(metrics.text).toContain('pos_requests_total{');
    expect(metrics.text).toContain('provider="MODULKASSA"');
    expect(metrics.text).toContain('endpoint="register"');
    expect(metrics.text).toContain('result="error"');
  });
});
