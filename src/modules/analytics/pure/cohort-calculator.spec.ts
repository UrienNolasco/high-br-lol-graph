import { decodeComparisonTimeline } from './comparison-timeline.adapter';
import { gzipSync, gunzipSync } from 'node:zlib';
import { calculateCohort } from './cohort-calculator';

import { comparisonFixture, timelineFixture } from './cohort.fixture';

describe('H01/H02 common cohort calculation', () => {
  it('uses final CS and mean of per-match rates, with independent checkpoint denominators', () => {
    const a = comparisonFixture(),
      b = { ...comparisonFixture('m2', 600), totalCs: 0, totalDamage: 1000 };
    const result = calculateCohort(
      [a, b],
      new Map([['m1', decodeComparisonTimeline(timelineFixture(920000))]]),
    );
    expect(result.stats.avgCspm).toBe(5);
    expect(result.stats.avgDpm).toBe(550);
    expect(result.stats.gamesPlayed).toBe(2);
    expect(result.laningPhase).toMatchObject({
      avgCsd15: 15,
      avgGd15: 200,
      avgXpd15: 500,
      soloKills15: null,
      soloDeaths15: null,
      soloKills15Reason: 'not_calculated',
      soloDeaths15Reason: 'not_calculated',
      samples: { cs: { validN: 1, totalN: 2, coverage: 0.5 } },
    });
    expect(result.laningPhase.evidence[0]).toMatchObject({
      timestampMs: 920000,
      offsetMs: 20000,
      opponentPuuid: 'enemy',
    });
    expect(result.laningPhase.evidence[1].reason).toBe('short_match');
    expect(result.csGraph.find((p) => p.minute === 15)).toMatchObject({
      value: 100,
      validN: 1,
      totalN: 2,
    });
  });
  it.each(['missing_opponent', 'ambiguous_role'])(
    'excludes %s without excluding summary/timeline',
    (reason) => {
      const p = comparisonFixture();
      p.match.participants =
        reason === 'missing_opponent'
          ? [p.match.participants[0]]
          : [
              ...p.match.participants,
              { puuid: 'other', teamId: 200, role: 'MID' },
            ];
      const r = calculateCohort(
        [p],
        new Map([['m1', decodeComparisonTimeline(timelineFixture())]]),
      );
      expect(r.stats.gamesPlayed).toBe(1);
      expect(r.laningPhase.avgCsd15).toBeNull();
      expect(r.laningPhase.evidence[0].reason).toBe(reason);
      expect(r.csGraph[15]).toMatchObject({ value: 100, validN: 1 });
    },
  );
  it('does not replace missing fields with zeros or borrow fields from another frame', () => {
    const r = calculateCohort(
      [comparisonFixture()],
      new Map([
        [
          'm1',
          decodeComparisonTimeline(
            timelineFixture(900000, { minionsKilled: null, xp: null }),
          ),
        ],
      ]),
    );
    expect(r.laningPhase.samples.cs.validN).toBe(0);
    expect(r.laningPhase.samples.gold.validN).toBe(1);
    expect(r.laningPhase.samples.xp.validN).toBe(0);
    expect(r.csGraph[15]).toMatchObject({
      value: null,
      validN: 0,
      reason: 'no_valid_samples',
    });
  });
  it('keeps missing/corrupt timelines absent and summary valid', () => {
    expect(decodeComparisonTimeline(Buffer.from('bad')).reason).toBe(
      'invalid_timeline',
    );
    const r = calculateCohort([comparisonFixture()], new Map());
    expect(r.stats.avgCspm).toBe(10);
    expect(r.laningPhase.evidence[0].reason).toBe('missing_timeline');
    expect(r.goldGraph[15].validN).toBe(0);
  });
  it('zero duration and empty cohort yield no fabricated zeros or winner inputs', () => {
    const r = calculateCohort([comparisonFixture('m1', 0)], new Map());
    expect(r.stats.avgCspm).toBeNull();
    expect(r.stats.samples.avgCspm.validN).toBe(0);
    const empty = calculateCohort([], new Map());
    expect(empty.stats.winRate).toBeNull();
    expect(empty.csGraph).toEqual([]);
  });
  it('uses timestamps, rejects out-of-tolerance frames and admits validated GAME_END', () => {
    const p = comparisonFixture('m1', 899);
    const raw = JSON.parse(gunzipSync(timelineFixture(900100)).toString());
    raw.info.frames[0].events = [
      { type: 'GAME_END', timestamp: 900100, winningTeam: 100 },
    ];
    const valid = decodeComparisonTimeline(gzipSync(JSON.stringify(raw)));
    expect(
      calculateCohort([p], new Map([['m1', valid]])).laningPhase.samples.cs
        .validN,
    ).toBe(1);
    expect(
      calculateCohort(
        [comparisonFixture()],
        new Map([['m1', decodeComparisonTimeline(timelineFixture(970000))]]),
      ).laningPhase.evidence[0].reason,
    ).toBe('missing_frame');
  });
});
