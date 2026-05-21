import { Test, TestingModule } from '@nestjs/testing';
import { SyncOrchestratorService } from './sync-orchestrator.service';
import { PlayerRepository } from '../repositories/player.repository';
import { MatchRepository } from '../repositories/match.repository';
import { RiotService } from '../../../core/riot/riot.service';
import { QueueService } from '../../../core/queue/queue.service';
import { SyncService } from './sync.service';
import { SyncStatus } from '../dto/sync-response.dto';
import { PinoLogger } from 'nestjs-pino';

describe('SyncOrchestratorService', () => {
  let service: SyncOrchestratorService;
  let playerRepo: jest.Mocked<PlayerRepository>;
  let matchRepo: jest.Mocked<MatchRepository>;
  let riotService: jest.Mocked<RiotService>;
  let queueService: jest.Mocked<QueueService>;
  let redis: jest.Mocked<SyncService>;

  beforeEach(async () => {
    playerRepo = { findByPuuid: jest.fn() } as any;
    matchRepo = { findExistingMatchIds: jest.fn() } as any;
    riotService = { getMatchIdsByPuuid: jest.fn() } as any;
    queueService = { publishDeepSyncMatch: jest.fn() } as any;
    redis = {
      hget: jest.fn(),
      hgetall: jest.fn(),
      hset: jest.fn(),
      pipeline: jest.fn(),
      sadd: jest.fn(),
      expire: jest.fn(),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SyncOrchestratorService,
        { provide: PlayerRepository, useValue: playerRepo },
        { provide: MatchRepository, useValue: matchRepo },
        { provide: RiotService, useValue: riotService },
        { provide: QueueService, useValue: queueService },
        { provide: SyncService, useValue: redis },
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

    service = module.get<SyncOrchestratorService>(SyncOrchestratorService);
  });

  it('should return SYNCING if already in progress', async () => {
    playerRepo.findByPuuid.mockResolvedValue({} as any);
    redis.hget.mockResolvedValue(SyncStatus.SYNCING);
    redis.hgetall.mockResolvedValue({ matchesTotal: '50' });

    const result = await service.startDeepSync('p1');

    expect(result.status).toBe(SyncStatus.SYNCING);
    expect(result.matchesEnqueued).toBe(0);
  });

  it('should return DONE if no riot matches found', async () => {
    playerRepo.findByPuuid.mockResolvedValue({} as any);
    redis.hget.mockResolvedValue(null);
    riotService.getMatchIdsByPuuid.mockResolvedValue([]);

    const result = await service.startDeepSync('p1');

    expect(result.status).toBe(SyncStatus.DONE);
    expect(result.matchesTotal).toBe(0);
  });

  it('should enqueue new matches and update Redis', async () => {
    const mockPipeline = {
      hset: jest.fn(),
      expire: jest.fn(),
      sadd: jest.fn(),
      exec: jest.fn().mockResolvedValue(undefined),
    } as any;
    redis.pipeline.mockReturnValue(mockPipeline);
    playerRepo.findByPuuid.mockResolvedValue({} as any);
    redis.hget.mockResolvedValue(null);
    riotService.getMatchIdsByPuuid.mockResolvedValue(['M1', 'M2', 'M3']);
    matchRepo.findExistingMatchIds.mockResolvedValue(new Set(['M1']));

    const result = await service.startDeepSync('p1');

    expect(result.matchesEnqueued).toBe(2);
    expect(result.matchesTotal).toBe(3);
    expect(queueService.publishDeepSyncMatch).toHaveBeenCalledTimes(2);
  });

  it('should throw NotFoundException if player not in DB', async () => {
    playerRepo.findByPuuid.mockResolvedValue(null);
    await expect(service.startDeepSync('p1')).rejects.toThrow(
      'Player p1 not found',
    );
  });
});
