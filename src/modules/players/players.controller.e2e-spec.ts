import { Module, INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PlayersController } from './players.controller';
import { PlayersService } from './players.service';
import { SyncService } from './sync.service';
import { createTestingApp } from '../../../test/helpers/app.builder';
import { mockPlayersService, mockSyncService } from '../../../test/helpers/shared-mocks';

@Module({
  controllers: [PlayersController],
  providers: [
    { provide: PlayersService, useValue: {} },
    { provide: SyncService, useValue: {} },
  ],
})
class TestPlayersModule {}

describe('PlayersController (e2e)', () => {
  let app: INestApplication;
  const playersService = mockPlayersService();
  const syncService = mockSyncService();
  const puuid = 'test-puuid-12345';

  beforeAll(async () => {
    app = await createTestingApp(TestPlayersModule, {
      overrides: [
        { provide: PlayersService, useValue: playersService },
        { provide: SyncService, useValue: syncService },
      ],
    });
  });

  afterAll(async () => {
    await app.close();
  });

  describe('GET /api/v1/players/:puuid', () => {
    it('should return player profile', () => {
      playersService.getPlayerProfile.mockResolvedValue({
        puuid,
        gameName: 'TestPlayer',
        tagLine: 'BR1',
        profileIconId: 1234,
        summonerLevel: 100,
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
      playersService.getPlayerUpdateStatus.mockResolvedValue({
        puuid,
        status: 'idle',
      });

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
      playersService.getPlayerSummary.mockResolvedValue({
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
      playersService.getPlayerChampions.mockResolvedValue({
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
      playersService.getPlayerRoleDistribution.mockResolvedValue({
        puuid,
        roles: { MID: 50, TOP: 30, JUNGLE: 20 },
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
      playersService.getPlayerActivity.mockResolvedValue({
        puuid,
        activity: [],
      });

      return request(app.getHttpServer())
        .get(`/api/v1/players/${puuid}/activity`)
        .expect(200);
    });
  });

  describe('GET /api/v1/players/:puuid/matches', () => {
    it('should return player matches', () => {
      playersService.getPlayerMatches.mockResolvedValue({
        data: [],
        meta: { total: 0, page: 1, limit: 20 },
      });

      return request(app.getHttpServer())
        .get(`/api/v1/players/${puuid}/matches`)
        .expect(200);
    });
  });

  describe('POST /api/v1/players/search', () => {
    it('should search player by gameName and tagLine', () => {
      playersService.searchPlayer.mockResolvedValue({
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
      syncService.triggerDeepSync.mockResolvedValue({
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
      syncService.getSyncStatus.mockResolvedValue({
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
