import { MatchGoldTimelineService } from './match-gold-timeline.service';

const losingGoldWinner = () => ({
  mapId: 11,
  gameVersion: '16.2.741.8224',
  teams: [
    { teamId: 100, win: true },
    { teamId: 200, win: false },
  ],
  participants: [100, 200].flatMap((teamId) =>
    Array.from({ length: 5 }, () => ({
      teamId,
      goldGraph: teamId === 100 ? [500, 1000] : [500, 2000],
    })),
  ),
});

describe('MatchGoldTimelineService', () => {
  const repo = { findGoldTimeline: jest.fn() };
  const service = new MatchGoldTimelineService(repo as any);
  beforeEach(() => jest.clearAllMocks());

  it('returns winner from summary even when winning team finishes with less gold', async () => {
    repo.findGoldTimeline.mockResolvedValue(losingGoldWinner());
    const result = await service.getGoldTimeline('BR1_1');
    expect(result.winner).toBe('blueTeam');
    expect(result.goldDifference[1].difference).toBe(-5000);
    expect(result.observedSwing?.swing).toBe(5000);
    expect(result.throwPoint).toEqual(result.observedSwing);
    expect(result.evidence).toMatchObject({
      winnerSource: 'MatchTeam.win',
      validAdjacentPairs: 1,
    });
  });

  it('does not infer winner from tied gold or contradictory outcomes', async () => {
    const match = losingGoldWinner();
    match.participants.forEach((p) => (p.goldGraph = [500]));
    repo.findGoldTimeline.mockResolvedValue(match);
    expect((await service.getGoldTimeline('BR1_1')).winner).toBe('blueTeam');
    match.teams[1].win = true;
    const result = await service.getGoldTimeline('BR1_1');
    expect(result).toMatchObject({
      winner: null,
      winnerReason: 'invalid_value',
      maxAdvantage: { team: null, difference: 0 },
    });
  });

  it('keeps existing matches with no participants or empty timelines available', async () => {
    const match = losingGoldWinner();
    repo.findGoldTimeline.mockResolvedValue(match);
    for (const participants of [
      match.participants.map((p) => ({ ...p, goldGraph: [] })),
      [],
    ]) {
      match.participants = participants;
      expect(await service.getGoldTimeline('BR1_1')).toMatchObject({
        winner: 'blueTeam',
        goldDifference: [],
        maxAdvantage: null,
        observedSwing: null,
        throwPoint: null,
        reason: 'missing_frame',
        coverage: { validSamples: 0, totalSamples: 0, coverage: null },
      });
    }
  });

  it('reports partial coverage and skips invalid pairs, without fabricating a swing', async () => {
    const match = losingGoldWinner();
    match.participants[0].goldGraph = [500];
    repo.findGoldTimeline.mockResolvedValue(match);
    expect(await service.getGoldTimeline('BR1_1')).toMatchObject({
      observedSwing: null,
      observedSwingReason: 'missing_frame',
      coverage: { validSamples: 1, totalSamples: 2, coverage: 0.5 },
    });
  });

  it('distinguishes evaluated absence from missing pairs and unsupported maps', async () => {
    const match = losingGoldWinner();
    match.participants.forEach((p) => (p.goldGraph = [500, 700]));
    repo.findGoldTimeline.mockResolvedValue(match);
    expect((await service.getGoldTimeline('BR1_1')).observedSwingReason).toBe(
      'not_observed',
    );
    match.mapId = 30;
    expect(await service.getGoldTimeline('BR1_1')).toMatchObject({
      winner: 'blueTeam',
      goldDifference: [],
      reason: 'unsupported_version',
    });
  });

  it('returns 404 only when match itself does not exist', async () => {
    repo.findGoldTimeline.mockResolvedValue(null);
    await expect(service.getGoldTimeline('BR1_1')).rejects.toThrow('not found');
  });
});
