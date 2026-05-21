import { Test, TestingModule } from '@nestjs/testing';
import { ProcessedMatchesService } from './processed-matches.service';
import { MatchCountRepository } from '../repositories/match-count.repository';

describe('ProcessedMatchesService', () => {
  let service: ProcessedMatchesService;
  let repo: jest.Mocked<
    Pick<MatchCountRepository, 'countByPatch' | 'countTotal'>
  >;

  beforeEach(async () => {
    repo = { countByPatch: jest.fn(), countTotal: jest.fn() } as any;
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProcessedMatchesService,
        { provide: MatchCountRepository, useValue: repo },
      ],
    }).compile();
    service = module.get<ProcessedMatchesService>(ProcessedMatchesService);
  });

  it('should return total count when no patch filter', async () => {
    repo.countTotal.mockResolvedValue(1000);
    const result = await service.getProcessedMatches();
    expect(result.count).toBe(1000);
  });

  it('should return patch-filtered count', async () => {
    repo.countByPatch.mockResolvedValue(500);
    const result = await service.getProcessedMatches('15.1');
    expect(result.count).toBe(500);
    expect(result.patch).toBe('15.1');
  });

  it('should return message when no data for patch', async () => {
    repo.countByPatch.mockResolvedValue(0);
    const result = await service.getProcessedMatches('99.99');
    expect(result.count).toBe(0);
    expect(result.message).toContain('Não há dados');
  });
});
