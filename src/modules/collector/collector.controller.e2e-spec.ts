import { Module, INestApplication } from '@nestjs/common';
import request from 'supertest';
import { CollectorController } from './collector.controller';
import { CollectorService } from './services/collector.service';
import { createTestingApp } from '../../../test/helpers/app.builder';
import { mockCollectorService } from '../../../test/helpers/shared-mocks';

@Module({
  controllers: [CollectorController],
  providers: [{ provide: CollectorService, useValue: {} }],
})
class TestCollectorModule {}

describe('CollectorController (e2e)', () => {
  let app: INestApplication;
  const collectorService = mockCollectorService();

  beforeAll(async () => {
    app = await createTestingApp(TestCollectorModule, {
      overrides: [
        { provide: CollectorService, useValue: collectorService },
      ],
    });
  });

  afterAll(async () => {
    await app.close();
  });

  describe('GET /api/v1/collector/status', () => {
    it('should return collector status', () => {
      collectorService.getStatus.mockResolvedValue({
        enabled: true,
        isRunning: false,
        lastRun: '2026-01-01T00:00:00Z',
        startHour: 0,
        endHour: 23,
      });

      return request(app.getHttpServer())
        .get('/api/v1/collector/status')
        .expect(200)
        .expect((res) => {
          expect(res.body.enabled).toBe(true);
        });
    });
  });

  describe('POST /api/v1/collector/enable', () => {
    it('should enable collector', () => {
      collectorService.setEnabled.mockResolvedValue(undefined);

      return request(app.getHttpServer())
        .post('/api/v1/collector/enable')
        .expect(201);
    });
  });

  describe('POST /api/v1/collector/disable', () => {
    it('should disable collector', () => {
      collectorService.setEnabled.mockResolvedValue(undefined);

      return request(app.getHttpServer())
        .post('/api/v1/collector/disable')
        .expect(201);
    });
  });

  describe('POST /api/v1/collector/trigger', () => {
    it('should trigger collection', () => {
      collectorService.triggerNow.mockResolvedValue(undefined);

      return request(app.getHttpServer())
        .post('/api/v1/collector/trigger')
        .expect(201);
    });
  });
});
