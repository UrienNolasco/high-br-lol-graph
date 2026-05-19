import { Module, INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PlayersController } from './players.controller';
import { PlayerSearchService } from './services/player-search.service';
import { PlayerProfileService } from './services/player-profile.service';
import { PlayerStatsService } from './services/player-stats.service';
import { PlayerMatchesService } from './services/player-matches.service';
import { SyncOrchestratorService } from './services/sync-orchestrator.service';
import { SyncStatusService } from './services/sync-status.service';
import { createTestingApp } from '../../../test/helpers/app.builder';

@Module({
  controllers: [PlayersController],
  providers: [
    { provide: PlayerSearchService, useValue: {} },
    { provide: PlayerProfileService, useValue: {} },
    { provide: PlayerStatsService, useValue: {} },
    { provide: PlayerMatchesService, useValue: {} },
    { provide: SyncOrchestratorService, useValue: {} },
    { provide: SyncStatusService, useValue: {} },
  ],
})
class TestPlayersModule {}

describe('PlayersController (e2e)', () => {
  let app: INestApplication;
  const searchSvc = { search: jest.fn() };
  const profileSvc = { getProfile: jest.fn(), getUpdateStatus: jest.fn() };
  const statsSvc = {
    getSummary: jest.fn(),
    getChampions: jest.fn(),
    getRoleDistribution: jest.fn(),
    getActivity: jest.fn(),
  };
  const matchesSvc = { getMatches: jest.fn(), getMatchesByPage: jest.fn() };
  const syncOrchestrator = { startDeepSync: jest.fn() };
  const syncStatus = { getStatus: jest.fn() };
  const puuid = 'test-puuid-12345';

  beforeAll(async () => {
    app = await createTestingApp(TestPlayersModule, {
      overrides: [
        { provide: PlayerSearchService, useValue: searchSvc },
        { provide: PlayerProfileService, useValue: profileSvc },
        { provide: PlayerStatsService, useValue: statsSvc },
        { provide: PlayerMatchesService, useValue: matchesSvc },
        { provide: SyncOrchestratorService, useValue: syncOrchestrator },
        { provide: SyncStatusService, useValue: syncStatus },
      ],
    });
  });

  afterAll(async () => {
    await app.close();
  });

  describe('GET /api/v1/players/:puuid', () => {
    it('should return player profile', () => {
      profileSvc.getProfile.mockResolvedValue({
        puuid,
        gameName: 'TestPlayer',
        tagLine: 'BR1',
      });

      return request(app.getHttpServer())
        .get(`/api/v1/players/${puuid}`)
        .expect(200)
        .expect((res) => {
          expect(res.body.puuid).toBe(puuid);
          expect(res.body.gameName).toBe('TestPlayer');
        });
    });
  });

  describe('GET /api/v1/players/:puuid/status', () => {
    it('should return player update status', () => {
      profileSvc.getUpdateStatus.mockResolvedValue({ puuid, status: 'idle' });

      return request(app.getHttpServer())
        .get(`/api/v1/players/${puuid}/status`)
        .expect(200)
        .expect((res) => {
          expect(res.body.puuid).toBe(puuid);
        });
    });
  });

  describe('GET /api/v1/players/:puuid/summary', () => {
    it('should return player summary', () => {
      statsSvc.getSummary.mockResolvedValue({
        puuid,
        totalGames: 100,
        wins: 55,
        losses: 45,
      });

      return request(app.getHttpServer())
        .get(`/api/v1/players/${puuid}/summary`)
        .expect(200)
        .expect((res) => {
          expect(res.body.totalGames).toBe(100);
        });
    });
  });

  describe('GET /api/v1/players/:puuid/champions', () => {
    it('should return player champions', () => {
      statsSvc.getChampions.mockResolvedValue({
        puuid,
        champions: [],
        total: 0,
      });

      return request(app.getHttpServer())
        .get(`/api/v1/players/${puuid}/champions`)
        .expect(200);
    });
  });

  describe('GET /api/v1/players/:puuid/roles', () => {
    it('should return role distribution', () => {
      statsSvc.getRoleDistribution.mockResolvedValue({
        puuid,
        roles: { MID: 50 },
      });

      return request(app.getHttpServer())
        .get(`/api/v1/players/${puuid}/roles`)
        .expect(200)
        .expect((res) => {
          expect(res.body.roles).toBeDefined();
        });
    });
  });

  describe('GET /api/v1/players/:puuid/activity', () => {
    it('should return player activity', () => {
      statsSvc.getActivity.mockResolvedValue({ puuid, activity: [] });

      return request(app.getHttpServer())
        .get(`/api/v1/players/${puuid}/activity`)
        .expect(200);
    });
  });

  describe('GET /api/v1/players/:puuid/matches', () => {
    it('should return player matches', () => {
      matchesSvc.getMatches.mockResolvedValue({
        matches: [],
        nextCursor: null,
        hasMore: false,
      });

      return request(app.getHttpServer())
        .get(`/api/v1/players/${puuid}/matches`)
        .expect(200);
    });
  });

  describe('POST /api/v1/players/search', () => {
    it('should search player by gameName and tagLine', () => {
      searchSvc.search.mockResolvedValue({
        puuid,
        gameName: 'TestPlayer',
        tagLine: 'BR1',
      });

      return request(app.getHttpServer())
        .post('/api/v1/players/search')
        .send({ gameName: 'TestPlayer', tagLine: 'BR1' })
        .expect(201)
        .expect((res) => {
          expect(res.body.puuid).toBe(puuid);
        });
    });

    it('should return 400 if body is empty', () => {
      return request(app.getHttpServer())
        .post('/api/v1/players/search')
        .send({})
        .expect(400);
    });

    it('should return 400 if gameName is missing', () => {
      return request(app.getHttpServer())
        .post('/api/v1/players/search')
        .send({ tagLine: 'BR1' })
        .expect(400);
    });
  });

  describe('POST /api/v1/players/:puuid/sync', () => {
    it('should trigger sync', () => {
      syncOrchestrator.startDeepSync.mockResolvedValue({
        message: 'Sync started',
        puuid,
      });

      return request(app.getHttpServer())
        .post(`/api/v1/players/${puuid}/sync`)
        .expect(201)
        .expect((res) => {
          expect(res.body.message).toBe('Sync started');
        });
    });
  });

  describe('GET /api/v1/players/:puuid/sync-status', () => {
    it('should return sync status', () => {
      syncStatus.getStatus.mockResolvedValue({
        puuid,
        status: 'idle',
        progress: 0,
      });

      return request(app.getHttpServer())
        .get(`/api/v1/players/${puuid}/sync-status`)
        .expect(200)
        .expect((res) => {
          expect(res.body.puuid).toBe(puuid);
        });
    });
  });
});
