import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';

describe('Telegram (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    process.env.ADMIN_KEY = process.env.ADMIN_KEY || 'test-admin-key';
    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('teleauth: returns 400 on missing initData', async () => {
    await request(app.getHttpServer())
      .post('/loyalty/teleauth')
      .send({ merchantId: 'M-1' })
      .expect(400);
  });
});
