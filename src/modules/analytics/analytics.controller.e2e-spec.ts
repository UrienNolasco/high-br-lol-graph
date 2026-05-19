import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AnalyticsModule } from './analytics.module';
import { AnalyticsService } from './analytics.service';
import { PrismaService } from '../../core/prisma/prisma.service';
import { createTestingApp } from '../../../test/helpers/app.builder';
import { mockAnalyticsService, mockPrismaService } from '../../../test/helpers/shared-mocks';

describe('AnalyticsController (e2e)', () => {
  let app: INestApplication;
  const analyticsService = mockAnalyticsService();

  beforeAll(async () => {
    app = await createTestingApp(AnalyticsModule, {
      overrides: [
        { provide: AnalyticsService, useValue: analyticsService },
        { provide: PrismaService, useValue: mockPrismaService() },
      ],
    });
  });

  afterAll(async () => {
    await app.close();
  });

  describe('GET /api/v1/analytics/compare', () => {
    it('should return comparison data', () => {
      analyticsService.comparePlayerPerformance.mockResolvedValue({
        hero: { puuid: 'hero-puuid', summary: { totalGames: 100 } },
        villain: { puuid: 'villain-puuid', summary: { totalGames: 80 } },
        comparison: { winRateDiff: 5 },
      });

      return request(app.getHttpServer())
        .get('/api/v1/analytics/compare?heroPuuid=hero&villainPuuid=villain')
        .expect(200)
        .expect((res) => {
          expect(res.body.hero.puuid).toBe('hero-puuid');
          expect(res.body.villain.puuid).toBe('villain-puuid');
        });
    });

    it('should return 400 if heroPuuid is missing', () => {
      return request(app.getHttpServer())
        .get('/api/v1/analytics/compare?villainPuuid=villain')
        .expect(400);
    });

    it('should return 400 if villainPuuid is missing', () => {
      return request(app.getHttpServer())
        .get('/api/v1/analytics/compare?heroPuuid=hero')
        .expect(400);
    });

    it('should accept optional filters', () => {
      analyticsService.comparePlayerPerformance.mockResolvedValue({
        hero: { puuid: 'hero-puuid', summary: {} },
        villain: { puuid: 'villain-puuid', summary: {} },
        comparison: {},
      });

      return request(app.getHttpServer())
        .get('/api/v1/analytics/compare?heroPuuid=hero&villainPuuid=villain&role=MID&championId=1&patch=15.23')
        .expect(200);
    });
  });
});
