import { Test, TestingModule } from '@nestjs/testing';
import { SyncStatusService } from './sync-status.service';
import { MatchRepository } from '../repositories/match.repository';
import { SyncService } from './sync.service';
import { SyncStatus } from '../dto/sync-response.dto';
import { PinoLogger } from 'nestjs-pino';

describe('SyncStatusService', () => {
  let service: SyncStatusService;
  let matchRepo: jest.Mocked<Pick<MatchRepository, 'countMatchesByIds'>>;
  let redis: jest.Mocked<Pick<SyncService, 'hgetall' | 'smembers' | 'hset'>>;

  beforeEach(async () => {
    matchRepo = { countMatchesByIds: jest.fn() } as any;
    redis = {
      hgetall: jest.fn(),
      smembers: jest.fn(),
      hset: jest.fn(),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SyncStatusService,
        { provide: MatchRepository, useValue: matchRepo },
        { provide: SyncService, useValue: redis },
        { provide: PinoLogger, useValue: { setContext: jest.fn(), info: jest.fn() } },
      ],
    }).compile();

    service = module.get<SyncStatusService>(SyncStatusService);
  });

  it('should return IDLE when no state in Redis', async () => {
    redis.hgetall.mockResolvedValue({});

    const result = await service.getStatus('p1');

    expect(result.status).toBe(SyncStatus.IDLE);
    expect(result.matchesProcessed).toBe(0);
    expect(result.message).toBe('Nenhum sync em andamento');
  });

  it('should return DONE when all matches processed', async () => {
    redis.hgetall.mockResolvedValue({ state: SyncStatus.SYNCING, matchesTotal: '10', startedAt: '2026-01-01' });
    redis.smembers.mockResolvedValue(['M1', 'M2', 'M3', 'M4', 'M5', 'M6', 'M7', 'M8', 'M9', 'M10']);
    matchRepo.countMatchesByIds.mockResolvedValue(10);

    const result = await service.getStatus('p1');

    expect(result.status).toBe(SyncStatus.DONE);
    expect(result.matchesProcessed).toBe(10);
    expect(redis.hset).toHaveBeenCalledWith('sync:p1:status', 'state', SyncStatus.DONE);
  });

  it('should return SYNCING when still processing', async () => {
    redis.hgetall.mockResolvedValue({ state: SyncStatus.SYNCING, matchesTotal: '10', startedAt: '2026-01-01' });
    redis.smembers.mockResolvedValue(['M1', 'M2', 'M3']);
    matchRepo.countMatchesByIds.mockResolvedValue(3);

    const result = await service.getStatus('p1');

    expect(result.status).toBe(SyncStatus.SYNCING);
    expect(result.matchesProcessed).toBe(3);
    expect(result.matchesTotal).toBe(10);
  });

  it('should return null startedAt if not in hash', async () => {
    redis.hgetall.mockResolvedValue({ state: SyncStatus.IDLE, matchesTotal: '0' });
    redis.smembers.mockResolvedValue([]);
    matchRepo.countMatchesByIds.mockResolvedValue(0);

    const result = await service.getStatus('p1');

    expect(result.startedAt).toBeNull();
  });
});
