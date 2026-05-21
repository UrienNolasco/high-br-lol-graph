import { MatchGoldTimelineService } from './match-gold-timeline.service';

describe('MatchGoldTimelineService', () => {
  let service: MatchGoldTimelineService;
  const mockRepo = { findParticipantsGold: jest.fn() };

  beforeEach(() => {
    service = new MatchGoldTimelineService(mockRepo as any);
  });

  it('should compute gold timeline', async () => {
    mockRepo.findParticipantsGold.mockResolvedValue([
      { teamId: 100, goldGraph: [500, 800] },
      { teamId: 200, goldGraph: [500, 700] },
    ]);

    const result = await service.getGoldTimeline('BR1_1');

    expect(result.matchId).toBe('BR1_1');
    expect(result.goldDifference).toHaveLength(2);
    expect(result.winner).toBe('blueTeam');
    expect(result.maxAdvantage).toBeDefined();
  });

  it('should throw NotFoundException when no participants', async () => {
    mockRepo.findParticipantsGold.mockResolvedValue([]);

    await expect(service.getGoldTimeline('BR1_1')).rejects.toThrow('not found');
  });
});
