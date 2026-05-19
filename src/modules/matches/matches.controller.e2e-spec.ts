import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { MatchesModule } from './matches.module';
import { MatchesService } from './matches.service';
import { PrismaService } from '../../core/prisma/prisma.service';
import { createTestingApp } from '../../../test/helpers/app.builder';
import { mockMatchesService, mockPrismaService } from '../../../test/helpers/shared-mocks';

describe('MatchesController (e2e)', () => {
  let app: INestApplication;
  const matchesService = mockMatchesService();
  const matchId = 'BR1_3200579475';

  beforeAll(async () => {
    app = await createTestingApp(MatchesModule, {
      overrides: [
        { provide: MatchesService, useValue: matchesService },
        { provide: PrismaService, useValue: mockPrismaService() },
      ],
    });
  });

  afterAll(async () => {
    await app.close();
  });

  describe('GET /api/v1/matches/:matchId', () => {
    it('should return match details', () => {
      matchesService.getMatchDetails.mockResolvedValue({
        matchId,
        participants: [],
      });

      return request(app.getHttpServer())
        .get(`/api/v1/matches/${matchId}`)
        .expect(200)
        .expect((res) => {
          expect(res.body.matchId).toBe(matchId);
        });
    });
  });

  describe('GET /api/v1/matches/:matchId/timeline/gold', () => {
    it('should return gold timeline', () => {
      matchesService.getMatchGoldTimeline.mockResolvedValue({ frames: [] });

      return request(app.getHttpServer())
        .get(`/api/v1/matches/${matchId}/timeline/gold`)
        .expect(200);
    });
  });

  describe('GET /api/v1/matches/:matchId/timeline/events', () => {
    it('should return timeline events', () => {
      matchesService.getMatchTimelineEvents.mockResolvedValue({ events: [] });

      return request(app.getHttpServer())
        .get(`/api/v1/matches/${matchId}/timeline/events`)
        .expect(200);
    });
  });

  describe('GET /api/v1/matches/:matchId/builds', () => {
    it('should return builds', () => {
      matchesService.getMatchBuilds.mockResolvedValue({ builds: [] });

      return request(app.getHttpServer())
        .get(`/api/v1/matches/${matchId}/builds`)
        .expect(200);
    });
  });

  describe('GET /api/v1/matches/:matchId/performance/:puuid', () => {
    it('should return performance comparison', () => {
      matchesService.getMatchPerformanceComparison.mockResolvedValue({
        player: { puuid: 'test-puuid', performance: {} },
        teamAverage: {},
      });

      return request(app.getHttpServer())
        .get(`/api/v1/matches/${matchId}/performance/test-puuid`)
        .expect(200);
    });
  });
});
