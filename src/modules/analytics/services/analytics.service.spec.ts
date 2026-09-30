import { gunzipSync } from 'node:zlib';
import { projectTimelineSnapshots } from '../../../../test/fixtures/match-processing';
import { AnalyticsService } from './analytics.service';
import { comparisonFixture, timelineFixture } from '../pure/cohort.fixture';

describe('AnalyticsService unified cohort', () => {
  const repo = { findUserByPuuid: jest.fn(), findComparisonCohort: jest.fn() };
  const service = new AnalyticsService(repo as any);
  beforeEach(() => {
    jest.clearAllMocks();
    repo.findUserByPuuid.mockResolvedValue({ gameName: 'Player' });
    repo.findComparisonCohort.mockResolvedValue({
      matches: [comparisonFixture()],
      projections: [
        {
          matchId: 'm1',
          ...projectTimelineSnapshots(
            JSON.parse(gunzipSync(timelineFixture()).toString()),
            new Map([
              [1, 'hero'],
              [6, 'enemy'],
            ]),
          ),
        },
      ],
      eligibleN: 30,
      returnedN: 1,
      limit: 1,
      truncated: true,
    });
  });
  it('fetches one cohort per subject and shares rows for summary, lane and timeline', async () => {
    const filters = {
      championId: 1,
      role: 'MID',
      patch: '16.2',
      queueId: 440,
      startDate: 0,
      endDate: 1000,
      limit: 1,
    };
    const r = await service.comparePlayerPerformance(
      'hero',
      'villain',
      filters,
    );
    expect(repo.findComparisonCohort).toHaveBeenCalledTimes(2);
    expect(repo.findComparisonCohort).toHaveBeenCalledWith('hero', {
      ...filters,
      role: 'MIDDLE',
    });
    expect(r.hero.cohort).toMatchObject({
      matchIds: ['m1'],
      eligibleN: 30,
      returnedN: 1,
      truncated: true,
    });
    expect(r.hero.stats.gamesPlayed).toBe(1);
    expect(r.hero.laningPhase.avgCsd15).toBe(15);
    expect(r.timelineComparison.csGraph.hero[15]).toMatchObject({
      value: 100,
      validN: 1,
    });
  });
  it('keeps known player with empty filters result available without fabricated winrate', async () => {
    repo.findComparisonCohort.mockResolvedValue({
      matches: [],
      projections: [],
      eligibleN: 0,
      returnedN: 0,
      limit: 100,
      truncated: false,
    });
    const r = await service.comparePlayerPerformance('hero', 'villain', {});
    expect(r.hero.stats.gamesPlayed).toBe(0);
    expect(r.hero.stats.winRate).toBeNull();
    expect(r.insights.winner).toBeNull();
  });
  it('rejects reversed period before querying', async () => {
    await expect(
      service.comparePlayerPerformance('h', 'v', { startDate: 2, endDate: 1 }),
    ).rejects.toThrow('startDate');
    expect(repo.findComparisonCohort).not.toHaveBeenCalled();
  });
  it('reports unknown users', async () => {
    repo.findUserByPuuid.mockResolvedValueOnce(null);
    await expect(
      service.comparePlayerPerformance('h', 'v', {}),
    ).rejects.toThrow('não encontrado');
  });
});
