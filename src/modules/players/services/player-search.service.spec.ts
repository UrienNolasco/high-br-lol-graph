import { Test, TestingModule } from '@nestjs/testing';
import { PlayerSearchService } from './player-search.service';
import { PlayerRepository } from '../repositories/player.repository';
import { MatchRepository } from '../repositories/match.repository';
import { RiotService } from '../../../core/riot/riot.service';
import { QueueService } from '../../../core/queue/queue.service';
import { PinoLogger } from 'nestjs-pino';

describe('PlayerSearchService', () => {
  let service: PlayerSearchService;
  let playerRepo: jest.Mocked<PlayerRepository>;
  let matchRepo: jest.Mocked<MatchRepository>;
  let riotService: jest.Mocked<RiotService>;
  let queueService: jest.Mocked<QueueService>;

  beforeEach(async () => {
    playerRepo = { findByPuuid: jest.fn(), upsert: jest.fn() } as any;
    matchRepo = {
      findExistingMatchIds: jest.fn(),
      findByMatchId: jest.fn(),
      findCursorMatches: jest.fn(),
      findPagedMatches: jest.fn(),
      countMatches: jest.fn(),
      countMatchesByIds: jest.fn(),
    } as any;
    riotService = {
      getAccountByRiotId: jest.fn(),
      getSummonerByPuuid: jest.fn(),
      getRankedStatsByPuuid: jest.fn(),
      getMatchIdsByPuuid: jest.fn(),
    } as any;
    queueService = {
      publishUserRequestedMatch: jest.fn(),
      publishDeepSyncMatch: jest.fn(),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PlayerSearchService,
        { provide: PlayerRepository, useValue: playerRepo },
        { provide: MatchRepository, useValue: matchRepo },
        { provide: RiotService, useValue: riotService },
        { provide: QueueService, useValue: queueService },
        {
          provide: PinoLogger,
          useValue: {
            setContext: jest.fn(),
            info: jest.fn(),
            error: jest.fn(),
            warn: jest.fn(),
            debug: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<PlayerSearchService>(PlayerSearchService);
  });

  it('should search and enqueue new matches', async () => {
    const dto = { gameName: 'TestPlayer', tagLine: 'BR1' };
    riotService.getAccountByRiotId.mockResolvedValue({
      puuid: 'puuid-123',
    } as any);
    riotService.getSummonerByPuuid.mockResolvedValue({
      profileIconId: 1,
      summonerLevel: 30,
      id: 'summ1',
    } as any);
    riotService.getRankedStatsByPuuid.mockResolvedValue([
      {
        queueType: 'RANKED_SOLO_5x5',
        tier: 'GOLD',
        rank: 'II',
        leaguePoints: 50,
        wins: 100,
        losses: 90,
      },
    ]);
    riotService.getMatchIdsByPuuid.mockResolvedValue(['MATCH_1', 'MATCH_2']);
    matchRepo.findExistingMatchIds.mockResolvedValue(new Set(['MATCH_1']));
    playerRepo.upsert.mockResolvedValue({} as any);

    const result = await service.search(dto);

    expect(result.puuid).toBe('puuid-123');
    expect(result.matchesEnqueued).toBe(1);
    expect(queueService.publishUserRequestedMatch).toHaveBeenCalledWith(
      'MATCH_2',
    );
  });

  it('should handle 404 from Riot API as NotFoundException', async () => {
    const dto = { gameName: 'NotFound', tagLine: 'BR1' };
    riotService.getAccountByRiotId.mockRejectedValue({
      response: { status: 404 },
    });

    await expect(service.search(dto)).rejects.toThrow(
      'Player NotFound#BR1 not found',
    );
  });
});
