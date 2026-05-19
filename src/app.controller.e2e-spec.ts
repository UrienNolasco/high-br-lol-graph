import { Module, INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppController } from './app.controller';
import { createTestingApp } from '../test/helpers/app.builder';

@Module({
  controllers: [AppController],
})
class TestAppModule {}

describe('AppController (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestingApp(TestAppModule);
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /health should return health status', () => {
    return request(app.getHttpServer())
      .get('/health')
      .expect(200)
      .expect((res) => {
        expect(res.body.status).toBe('ok');
        expect(res.body.timestamp).toBeDefined();
      });
  });
});
