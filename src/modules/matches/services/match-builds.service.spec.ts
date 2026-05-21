import { MatchBuildsService } from './match-builds.service';

describe('MatchBuildsService', () => {
  let service: MatchBuildsService;
  const mockRepo = { findParticipantsBuilds: jest.fn() };

  beforeEach(() => {
    service = new MatchBuildsService(mockRepo as any);
  });

  it('should return builds for all participants', async () => {
    mockRepo.findParticipantsBuilds.mockResolvedValue([
      { puuid: 'p1', championId: 1, championName: 'A', itemTimeline: [] },
    ]);

    const result = await service.getBuilds('BR1_1');

    expect(result.matchId).toBe('BR1_1');
    expect(result.builds).toHaveLength(1);
    expect(result.builds[0].itemTimeline).toEqual([]);
    expect(result.builds[0].finalBuild).toEqual([]);
  });

  it('should throw NotFoundException when no participants', async () => {
    mockRepo.findParticipantsBuilds.mockResolvedValue([]);

    await expect(service.getBuilds('BR1_1')).rejects.toThrow('not found');
  });
});
