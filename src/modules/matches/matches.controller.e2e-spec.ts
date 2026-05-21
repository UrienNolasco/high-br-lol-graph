import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { MatchesModule } from './matches.module';
import { MatchDetailService } from './services/match-detail.service';
import { MatchGoldTimelineService } from './services/match-gold-timeline.service';
import { MatchTimelineEventsService } from './services/match-timeline-events.service';
import { MatchBuildsService } from './services/match-builds.service';
import { MatchPerformanceService } from './services/match-performance.service';
import { PrismaService } from '../../core/prisma/prisma.service';
import { createTestingApp } from '../../../test/helpers/app.builder';
import { mockPrismaService } from '../../../test/helpers/shared-mocks';

describe('MatchesController (e2e)', () => {
  let app: INestApplication;
  const matchDetail = { getMatchDetails: jest.fn() };
  const matchGoldTimeline = { getGoldTimeline: jest.fn() };
  const matchTimelineEvents = { getTimelineEvents: jest.fn() };
  const matchBuilds = { getBuilds: jest.fn() };
  const matchPerformance = { getPerformanceComparison: jest.fn() };
  const matchId = 'BR1_3200579475';

  beforeAll(async () => {
    app = await createTestingApp(MatchesModule, {
      overrides: [
        { provide: MatchDetailService, useValue: matchDetail },
        { provide: MatchGoldTimelineService, useValue: matchGoldTimeline },
        { provide: MatchTimelineEventsService, useValue: matchTimelineEvents },
        { provide: MatchBuildsService, useValue: matchBuilds },
        { provide: MatchPerformanceService, useValue: matchPerformance },
        { provide: PrismaService, useValue: mockPrismaService() },
      ],
    });
  });

  afterAll(async () => {
    await app.close();
  });

  describe('GET /api/v1/matches/:matchId', () => {
    it('should return match details', () => {
      matchDetail.getMatchDetails.mockResolvedValue({
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
      matchGoldTimeline.getGoldTimeline.mockResolvedValue({ frames: [] });

      return request(app.getHttpServer())
        .get(`/api/v1/matches/${matchId}/timeline/gold`)
        .expect(200);
    });
  });

  describe('GET /api/v1/matches/:matchId/timeline/events', () => {
    it('should return timeline events', () => {
      matchTimelineEvents.getTimelineEvents.mockResolvedValue({ events: [] });

      return request(app.getHttpServer())
        .get(`/api/v1/matches/${matchId}/timeline/events`)
        .expect(200);
    });
  });

  describe('GET /api/v1/matches/:matchId/builds', () => {
    it('should return builds', () => {
      matchBuilds.getBuilds.mockResolvedValue({ builds: [] });

      return request(app.getHttpServer())
        .get(`/api/v1/matches/${matchId}/builds`)
        .expect(200);
    });
  });

  describe('GET /api/v1/matches/:matchId/performance/:puuid', () => {
    it('should return performance comparison', () => {
      matchPerformance.getPerformanceComparison.mockResolvedValue({
        player: { puuid: 'test-puuid', performance: {} },
        teamAverage: {},
      });

      return request(app.getHttpServer())
        .get(`/api/v1/matches/${matchId}/performance/test-puuid`)
        .expect(200);
    });
  });
});
