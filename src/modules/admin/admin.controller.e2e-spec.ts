import { Module, INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AdminController } from './admin.controller';
import { RateLimiterService } from '../../core/riot/rate-limiter.service';
import { CollectorService } from '../collector/collector.service';
import { createTestingApp } from '../../../test/helpers/app.builder';
import { mockRateLimiterService, mockCollectorService } from '../../../test/helpers/shared-mocks';

@Module({
  controllers: [AdminController],
  providers: [
    { provide: RateLimiterService, useValue: {} },
    { provide: CollectorService, useValue: {} },
  ],
})
class TestAdminModule {}

describe('AdminController (e2e)', () => {
  let app: INestApplication;
  const rateLimiterService = mockRateLimiterService();
  const collectorService = mockCollectorService();

  beforeAll(async () => {
    app = await createTestingApp(TestAdminModule, {
      overrides: [
        { provide: RateLimiterService, useValue: rateLimiterService },
        { provide: CollectorService, useValue: collectorService },
      ],
    });
  });

  afterAll(async () => {
    await app.close();
  });

  describe('GET /api/v1/admin/rate-limit', () => {
    it('should return rate limit status', () => {
      rateLimiterService.getStatus.mockResolvedValue({
        requestsInWindow: 5,
        maxRequests: 100,
        canProceed: true,
      });

      return request(app.getHttpServer())
        .get('/api/v1/admin/rate-limit')
        .expect(200)
        .expect((res) => {
          expect(res.body.requestsInWindow).toBe(5);
          expect(res.body.maxRequests).toBe(100);
          expect(res.body.canProceed).toBe(true);
        });
    });
  });

  describe('POST /api/v1/admin/rate-limit/reset', () => {
    it('should reset rate limit', () => {
      rateLimiterService.clear.mockResolvedValue(undefined);

      return request(app.getHttpServer())
        .post('/api/v1/admin/rate-limit/reset')
        .expect(201);
    });
  });

  describe('GET /api/v1/admin/collector', () => {
    it('should return collector status', () => {
      collectorService.getStatus.mockResolvedValue({
        enabled: true,
        isRunning: false,
        lastRun: '2026-01-01T00:00:00Z',
        startHour: 0,
        endHour: 23,
      });

      return request(app.getHttpServer())
        .get('/api/v1/admin/collector')
        .expect(200)
        .expect((res) => {
          expect(res.body.enabled).toBe(true);
        });
    });
  });

  describe('POST /api/v1/admin/collector/enable', () => {
    it('should enable collector', () => {
      collectorService.setEnabled.mockResolvedValue(undefined);

      return request(app.getHttpServer())
        .post('/api/v1/admin/collector/enable')
        .expect(201);
    });
  });

  describe('POST /api/v1/admin/collector/disable', () => {
    it('should disable collector', () => {
      collectorService.setEnabled.mockResolvedValue(undefined);

      return request(app.getHttpServer())
        .post('/api/v1/admin/collector/disable')
        .expect(201);
    });
  });

  describe('POST /api/v1/admin/collector/trigger', () => {
    it('should trigger collection', () => {
      collectorService.triggerNow.mockResolvedValue(undefined);

      return request(app.getHttpServer())
        .post('/api/v1/admin/collector/trigger')
        .expect(201);
    });
  });
});
