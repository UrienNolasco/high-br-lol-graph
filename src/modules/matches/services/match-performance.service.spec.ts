import { MatchPerformanceService } from './match-performance.service';

describe('MatchPerformanceService', () => {
  let service: MatchPerformanceService;
  const mockRepo = { findParticipantsForPerformance: jest.fn() };

  beforeEach(() => {
    service = new MatchPerformanceService(mockRepo as any);
  });

  it('should compute performance comparison', async () => {
    const player = {
      puuid: 'p1',
      championId: 1,
      championName: 'A',
      role: 'MID',
      teamId: 100,
      totalDamage: 36000,
      goldEarned: 18000,
      csGraph: [10, 20, 30],
      visionScore: 30,
      damageTaken: 20000,
      kda: 3.0,
      match: { gameDuration: 1800 },
    };
    const opponent = {
      ...player,
      puuid: 'p2',
      teamId: 200,
      championId: 2,
      championName: 'B',
    };

    mockRepo.findParticipantsForPerformance.mockResolvedValue([
      player,
      opponent,
    ]);

    const result = await service.getPerformanceComparison('BR1_1', 'p1');

    expect(result.matchId).toBe('BR1_1');
    expect(result.puuid).toBe('p1');
    expect(result.player.dpm).toBe(1200);
    expect(result.opponent).toBeTruthy();
    expect(result.comparison).toBeTruthy();
  });

  it('should return null opponent when no lane opponent', async () => {
    mockRepo.findParticipantsForPerformance.mockResolvedValue([
      {
        puuid: 'p1',
        championId: 1,
        championName: 'A',
        role: 'MID',
        teamId: 100,
        totalDamage: 1000,
        goldEarned: 1000,
        csGraph: [10],
        visionScore: 10,
        damageTaken: 1000,
        kda: 1.0,
        match: { gameDuration: 1800 },
      },
    ]);

    const result = await service.getPerformanceComparison('BR1_1', 'p1');

    expect(result.opponent).toBeNull();
    expect(result.comparison).toBeNull();
  });

  it('should throw when match not found', async () => {
    mockRepo.findParticipantsForPerformance.mockResolvedValue([]);

    await expect(
      service.getPerformanceComparison('BR1_1', 'p1'),
    ).rejects.toThrow('not found');
  });

  it('should throw when player not in match', async () => {
    mockRepo.findParticipantsForPerformance.mockResolvedValue([
      {
        puuid: 'other',
        championId: 1,
        championName: 'A',
        role: 'MID',
        teamId: 100,
        totalDamage: 1000,
        goldEarned: 1000,
        csGraph: [10],
        visionScore: 10,
        damageTaken: 1000,
        kda: 1.0,
        match: { gameDuration: 1800 },
      },
    ]);

    await expect(
      service.getPerformanceComparison('BR1_1', 'p1'),
    ).rejects.toThrow('Player p1 not found');
  });
});
