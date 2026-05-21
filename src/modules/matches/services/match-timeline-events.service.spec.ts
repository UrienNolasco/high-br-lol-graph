import { MatchTimelineEventsService } from './match-timeline-events.service';

describe('MatchTimelineEventsService', () => {
  let service: MatchTimelineEventsService;
  const mockRepo = {
    findParticipantsEvents: jest.fn(),
    findTeamsObjectives: jest.fn(),
  };

  beforeEach(() => {
    service = new MatchTimelineEventsService(mockRepo as any);
  });

  it('should return timeline events', async () => {
    mockRepo.findParticipantsEvents.mockResolvedValue([
      {
        puuid: 'p1',
        championId: 1,
        killPositions: [],
        deathPositions: [],
        wardPositions: [],
      },
    ]);
    mockRepo.findTeamsObjectives.mockResolvedValue([]);

    const result = await service.getTimelineEvents('BR1_1');

    expect(result.matchId).toBe('BR1_1');
    expect(result.events.kills).toEqual([]);
    expect(result.events.deaths).toEqual([]);
    expect(result.events.wards).toEqual([]);
    expect(result.events.objectives).toEqual([]);
  });

  it('should throw NotFoundException when no participants', async () => {
    mockRepo.findParticipantsEvents.mockResolvedValue([]);

    await expect(service.getTimelineEvents('BR1_1')).rejects.toThrow(
      'not found',
    );
  });
});
