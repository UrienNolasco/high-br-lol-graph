import { Test, TestingModule } from '@nestjs/testing';
import { PlayerMatchesService } from './player-matches.service';
import { MatchRepository } from '../repositories/match.repository';
import { PinoLogger } from 'nestjs-pino';

describe('PlayerMatchesService', () => {
  let service: PlayerMatchesService;
  let matchRepo: jest.Mocked<
    Pick<
      MatchRepository,
      'findCursorMatches' | 'findPagedMatches' | 'findByMatchId'
    >
  >;

  const matchRow = {
    matchId: 'BR1_1',
    championId: 1,
    championName: 'Annie',
    role: 'MID',
    lane: 'MIDDLE',
    kills: 5,
    deaths: 3,
    assists: 10,
    kda: 5,
    goldEarned: 12000,
    totalDamage: 25000,
    visionScore: 30,
    win: true,
    csGraph: [0, 100, 200],
    match: {
      gameCreation: BigInt(1700000000000),
      gameDuration: 1800,
      queueId: 420,
    },
  };

  beforeEach(async () => {
    matchRepo = {
      findCursorMatches: jest.fn(),
      findPagedMatches: jest.fn(),
      findByMatchId: jest.fn(),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PlayerMatchesService,
        { provide: MatchRepository, useValue: matchRepo },
        {
          provide: PinoLogger,
          useValue: { setContext: jest.fn(), info: jest.fn() },
        },
      ],
    }).compile();

    service = module.get<PlayerMatchesService>(PlayerMatchesService);
  });

  describe('getMatches', () => {
    it('should return cursor-paginated matches', async () => {
      matchRepo.findCursorMatches.mockResolvedValue([
        matchRow,
        matchRow,
        matchRow,
      ] as any);

      const result = await service.getMatches('p1', { limit: 2 } as any);

      expect(result.matches).toHaveLength(2);
      expect(result.hasMore).toBe(true);
      expect(result.matches[0].matchId).toBe('BR1_1');
      expect(result.matches[0].cspm).toBeGreaterThan(0);
    });

    it('should handle cursor parameter', async () => {
      matchRepo.findByMatchId.mockResolvedValue({
        gameCreation: BigInt(999),
      } as any);
      matchRepo.findCursorMatches.mockResolvedValue([matchRow] as any);

      const result = await service.getMatches('p1', {
        limit: 20,
        cursor: 'BR1_OLD',
      } as any);

      expect(matchRepo.findByMatchId).toHaveBeenCalledWith('BR1_OLD');
      expect(result.matches).toHaveLength(1);
    });

    it('should return hasMore=false when matches.length <= limit', async () => {
      matchRepo.findCursorMatches.mockResolvedValue([matchRow] as any);

      const result = await service.getMatches('p1', { limit: 20 } as any);

      expect(result.hasMore).toBe(false);
    });
  });

  describe('getMatchesByPage', () => {
    it('should return page-based matches', async () => {
      matchRepo.findPagedMatches.mockResolvedValue([matchRow, matchRow] as any);

      const result = await service.getMatchesByPage('p1', {
        page: 2,
        limit: 10,
      } as any);

      expect(result.matches).toHaveLength(2);
    });

    it('should calculate skip correctly', async () => {
      matchRepo.findPagedMatches.mockResolvedValue([]);

      await service.getMatchesByPage('p1', { page: 3, limit: 10 } as any);

      expect(matchRepo.findPagedMatches).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        20,
        10,
      );
    });
  });
});
