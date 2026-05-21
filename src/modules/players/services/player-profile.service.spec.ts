import { Test, TestingModule } from '@nestjs/testing';
import { PlayerProfileService } from './player-profile.service';
import { PlayerRepository } from '../repositories/player.repository';
import { MatchRepository } from '../repositories/match.repository';
import { RiotService } from '../../../core/riot/riot.service';
import { PinoLogger } from 'nestjs-pino';

describe('PlayerProfileService', () => {
  let service: PlayerProfileService;
  let playerRepo: jest.Mocked<PlayerRepository>;
  let matchRepo: jest.Mocked<MatchRepository>;
  let riotService: jest.Mocked<RiotService>;

  beforeEach(async () => {
    playerRepo = { findByPuuid: jest.fn(), upsert: jest.fn() } as any;
    matchRepo = { countMatchesByIds: jest.fn() } as any;
    riotService = { getMatchIdsByPuuid: jest.fn() } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PlayerProfileService,
        { provide: PlayerRepository, useValue: playerRepo },
        { provide: MatchRepository, useValue: matchRepo },
        { provide: RiotService, useValue: riotService },
        {
          provide: PinoLogger,
          useValue: {
            setContext: jest.fn(),
            info: jest.fn(),
            error: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<PlayerProfileService>(PlayerProfileService);
  });

  describe('getProfile', () => {
    it('should return player profile', async () => {
      playerRepo.findByPuuid.mockResolvedValue({
        puuid: 'p1',
        gameName: 'Test',
        tagLine: 'BR1',
        region: 'br1',
        profileIconId: 1,
        summonerLevel: 30,
        tier: 'GOLD',
        rank: 'II',
        leaguePoints: 50,
        rankedWins: 100,
        rankedLosses: 90,
        lastUpdated: new Date(),
        createdAt: new Date(),
      } as any);

      const result = await service.getProfile('p1');

      expect(result.puuid).toBe('p1');
      expect(result.gameName).toBe('Test');
      expect(result.tier).toBe('GOLD');
    });

    it('should throw NotFoundException if user not found', async () => {
      playerRepo.findByPuuid.mockResolvedValue(null);
      await expect(service.getProfile('p1')).rejects.toThrow(
        'Player with PUUID p1 not found',
      );
    });
  });

  describe('getUpdateStatus', () => {
    it('should return IDLE when all matches processed', async () => {
      playerRepo.findByPuuid.mockResolvedValue({} as any);
      riotService.getMatchIdsByPuuid.mockResolvedValue(['M1']);
      matchRepo.countMatchesByIds.mockResolvedValue(1);

      const result = await service.getUpdateStatus('p1');
      expect(result.status).toBe('IDLE');
    });

    it('should return UPDATING when some matches not processed', async () => {
      playerRepo.findByPuuid.mockResolvedValue({} as any);
      riotService.getMatchIdsByPuuid.mockResolvedValue(['M1', 'M2']);
      matchRepo.countMatchesByIds.mockResolvedValue(1);

      const result = await service.getUpdateStatus('p1');
      expect(result.status).toBe('UPDATING');
    });

    it('should throw NotFoundException if user not found', async () => {
      playerRepo.findByPuuid.mockResolvedValue(null);
      await expect(service.getUpdateStatus('p1')).rejects.toThrow(
        'Player with PUUID p1 not found',
      );
    });
  });
});
