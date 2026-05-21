import { MatchDetailService } from './match-detail.service';

describe('MatchDetailService', () => {
  let service: MatchDetailService;
  const mockMatchRepo = { findMatchWithDetails: jest.fn() };

  beforeEach(() => {
    service = new MatchDetailService(mockMatchRepo as any);
  });

  it('should return match with gameCreation as string', async () => {
    mockMatchRepo.findMatchWithDetails.mockResolvedValue({
      matchId: 'BR1_1',
      gameCreation: BigInt(1700000000000),
    });

    const result = await service.getMatchDetails('BR1_1');

    expect(result).toBeTruthy();
    expect(result!.gameCreation).toBe('1700000000000');
  });

  it('should return null when match not found', async () => {
    mockMatchRepo.findMatchWithDetails.mockResolvedValue(null);

    const result = await service.getMatchDetails('BR1_1');

    expect(result).toBeNull();
  });
});
