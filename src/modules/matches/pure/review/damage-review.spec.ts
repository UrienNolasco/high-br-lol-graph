import type {
  MatchReviewContext,
  ReviewKill,
} from '../../contracts/match-review';
import type { SnapshotFrame } from '../../contracts/normalized-snapshots';
import { calculateDamageReview } from './damage-review';

function fixture(): MatchReviewContext {
  const participants = Array.from({ length: 10 }, (_, index) => ({
    puuid: `p${index + 1}`,
    teamId: index < 5 ? 100 : 200,
    role: 'TOP',
    championName: `Champion${index + 1}`,
    kills: 0,
    deaths: 0,
    assists: 0,
    finalStats: {
      projectionVersion: 1,
      values: { totalDamageDealtToChampions: index === 0 ? 600 : 300 },
    },
  }));
  const frames: SnapshotFrame[] = [0, 60000, 120000, 180000].map(
    (timestamp, frameIndex) => ({
      frameIndex,
      timestamp,
      participantFrames: Object.fromEntries(
        participants.map((p, index) => [
          String(index + 1),
          {
            participantId: index + 1,
            puuid: p.puuid,
            totalGold: null,
            currentGold: null,
            xp: null,
            level: null,
            minionsKilled: null,
            jungleMinionsKilled: null,
            position: null,
            championStats: null,
            additionalFields: {},
            missingFields: [],
            damageStats: {
              totalDamageDoneToChampions:
                index === 0 ? [0, 100, 400, 600][frameIndex] : frameIndex * 100,
              physicalDamageDoneToChampions: 9000,
            },
          },
        ]),
      ),
    }),
  );
  return {
    input: {
      matchId: 'TEST',
      gameDuration: 180,
      gameVersion: '16.19',
      queueId: 420,
      mapId: 11,
      participants,
      projection: {
        projectionVersion: 1,
        frameIntervalMs: 60000,
        observedEndMs: 180000,
        frames,
      },
      events: [],
      processing: {
        status: 'COMPLETED',
        processingVersion: 2,
        completedAt: new Date('2026-10-13T00:00:00Z'),
      },
    },
    sourceReason: null,
    snapshotReason: null,
    combatReason: null,
    processedAt: '2026-10-13T00:00:00.000Z',
    processingVersion: 2,
    endMs: 180000,
    frames,
    kills: [],
    participantIds: new Map(participants.map((p, i) => [i + 1, p.puuid])),
  };
}
function kill(timestampMs: number, victimPuuid = 'p6'): ReviewKill {
  return {
    eventId: `TEST:1:${timestampMs}`,
    timestampMs,
    frameIndex: 1,
    eventIndex: timestampMs,
    killerPuuid: 'p1',
    victimPuuid,
    assistingPuuids: [],
    assistanceComplete: true,
    payload: {},
  };
}
function setCounter(
  context: MatchReviewContext,
  frame: number,
  participant: number,
  value: number | null,
): void {
  context.frames[frame].participantFrames[
    String(participant)
  ].damageStats!.totalDamageDoneToChampions = value;
}

describe('calculateDamageReview', () => {
  it('uses the primary damage counter, actual frame IDs and trusted processing provenance', () => {
    const result = calculateDamageReview(fixture(), 'p1');
    expect(result).toMatchObject({
      available: true,
      complete: true,
      metricVersion: 1,
      processingVersion: 2,
      processedAt: '2026-10-13T00:00:00.000Z',
      matchId: 'TEST',
      puuid: 'p1',
    });
    expect(result.intervals[1]).toMatchObject({
      startFrameIndex: 1,
      endFrameIndex: 2,
      startMs: 60000,
      endMs: 120000,
      personalDamage: { value: 300 },
      globalDamage: { value: 1200 },
      personalRate: { value: 300 },
    });
    expect(result.intervals[1].personalDamage.evidence).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          frameIndex: 1,
          timestampMs: 60000,
          value: 100,
        }),
        expect.objectContaining({
          frameIndex: 2,
          timestampMs: 120000,
          value: 400,
        }),
      ]),
    );
    expect(result.totalDamage.value).toBe(600);
    expect(result.personalPeak?.startMs).toBe(60000);
  });

  it('uses a real elapsed duration instead of treating each frame as exactly one minute', () => {
    const context = fixture();
    context.frames[1].timestamp = 60021;
    const result = calculateDamageReview(context, 'p1');
    expect(result.intervals[0].durationMs).toBe(60021);
    expect(result.intervals[0].personalRate.value).toBeCloseTo(
      (100 * 60000) / 60021,
      10,
    );
  });

  it('ranks all comparable intervals and separately selects the largest eligible interval without deaths', () => {
    const context = fixture();
    context.kills = [kill(120000)];
    const result = calculateDamageReview(context, 'p1');
    expect(result.personalPeak?.startMs).toBe(60000);
    expect(result.personalPeak?.noDeaths).toBe(false);
    expect(result.personalPeakWithoutDeaths?.startMs).toBe(120000);
    expect(result.personalPeakWithoutDeaths?.personalRank).toBe(2);
    expect(result.globalPeakWithoutDeaths?.globalRank).toBe(2);
    expect(result.damageWithoutDeaths.value).toBe(300);
    expect(result.fractionWithoutDeaths.value).toBe(0.5);
    expect(result.intervals[1].shareOfFinalDamage.value).toBe(0.5);
  });

  it('excludes a death at the start boundary and includes one at the end boundary', () => {
    const context = fixture();
    context.kills = [kill(60000)];
    const [first, second] = calculateDamageReview(context, 'p1').intervals;
    expect(first).toMatchObject({
      noDeaths: false,
      deathCount: 1,
      bounds: '(]',
    });
    expect(first.deaths[0]).toMatchObject({
      eventId: 'TEST:1:60000',
      timestampMs: 60000,
    });
    expect(second).toMatchObject({
      noDeaths: true,
      deathCount: 0,
      previousDeath: { timestampMs: 60000 },
    });
  });

  it('reports the next map death and rejects the isolated-window reading with a 15-second margin', () => {
    const context = fixture();
    context.kills = [kill(134000, 'p3')];
    const row = calculateDamageReview(context, 'p1').intervals[1];
    expect(row).toMatchObject({
      noDeaths: true,
      nextDeathGapMs: 14000,
      nextDeath: { victimPuuid: 'p3', timestampMs: 134000 },
      marginNoDeaths: {
        '0': true,
        '15000': false,
        '30000': false,
        '60000': false,
      },
    });
  });

  it('returns unknown margins when their follow-up or preceding time falls outside the game', () => {
    const rows = calculateDamageReview(fixture(), 'p1').intervals;
    expect(rows[0].marginNoDeaths['15000']).toBeNull();
    expect(rows.at(-1)!.marginNoDeaths['15000']).toBeNull();
    expect(rows[1].marginNoDeaths['60000']).toBe(true);
  });

  it('preserves known zero damage and leaves shares of a zero final total unknown', () => {
    const context = fixture();
    context.frames.forEach((_, i) => setCounter(context, i, 1, 0));
    (
      context.input.participants[0].finalStats as any
    ).values.totalDamageDealtToChampions = 0;
    const result = calculateDamageReview(context, 'p1');
    expect(result.complete).toBe(true);
    expect(result.totalDamage.value).toBe(0);
    expect(result.intervals[0].personalDamage).toMatchObject({
      value: 0,
      origin: 'derived',
      reason: null,
    });
    expect(result.damageWithoutDeaths.value).toBe(0);
    expect(result.fractionWithoutDeaths).toMatchObject({
      value: null,
      reason: 'zero_denominator',
    });
    expect(result.intervals[0].shareOfFinalDamage.reason).toBe(
      'zero_denominator',
    );
    expect(result.personalPeak).toBeNull();
  });

  it('keeps valid intervals visible while refusing whole-game peaks and shares with a missing personal counter', () => {
    const context = fixture();
    setCounter(context, 1, 1, null);
    const result = calculateDamageReview(context, 'p1');
    expect(result).toMatchObject({
      available: true,
      complete: false,
      personalPeak: null,
      rankingReason: 'incomplete_damage_coverage',
    });
    expect(result.intervals[0].personalDamage.value).toBeNull();
    expect(result.intervals[2].personalDamage.value).toBe(200);
    expect(
      result.intervals.every(
        (r) => r.personalRank === null && r.shareOfFinalDamage.value === null,
      ),
    ).toBe(true);
    expect(result.totalDamage.value).toBeNull();
  });

  it('preserves personal increments when another participant is missing a counter, without inventing a global total', () => {
    const context = fixture();
    setCounter(context, 1, 2, null);
    const result = calculateDamageReview(context, 'p1');
    expect(result.intervals[0].personalDamage.value).toBe(100);
    expect(result.intervals[0].globalDamage.value).toBeNull();
    expect(result.complete).toBe(false);
  });

  it.each([NaN, Infinity, -1])(
    'does not turn an invalid counter (%s) into zero',
    (bad) => {
      const context = fixture();
      setCounter(context, 1, 1, bad);
      expect(
        calculateDamageReview(context, 'p1').intervals[0].personalDamage.value,
      ).toBeNull();
    },
  );

  it('rejects a counter regression and refuses retrospective whole-game ranking', () => {
    const context = fixture();
    setCounter(context, 2, 1, 50);
    const result = calculateDamageReview(context, 'p1');
    expect(result.intervals[1].personalDamage.reason).toBe(
      'counter_regression',
    );
    expect(result.complete).toBe(false);
    expect(result.personalPeak).toBeNull();
  });

  it.each(['extra', 'missing', 'duplicated', 'identity'])(
    'rejects a %s roster snapshot',
    (kind) => {
      const context = fixture();
      const snapshots = context.frames[1].participantFrames;
      if (kind === 'extra')
        snapshots['11'] = { ...snapshots['1'], participantId: 11 };
      if (kind === 'missing') delete snapshots['10'];
      if (kind === 'duplicated') snapshots['2'].participantId = 1;
      if (kind === 'identity') snapshots['2'].puuid = 'p1';
      const result = calculateDamageReview(context, 'p1');
      expect(result.intervals[0].personalDamage.reason).toBe(
        'invalid_frame_roster',
      );
      expect(result.complete).toBe(false);
    },
  );

  it('does not depend on participantFrames object keys or order', () => {
    const context = fixture();
    for (const frame of context.frames)
      frame.participantFrames = Object.fromEntries(
        Object.values(frame.participantFrames)
          .reverse()
          .map((p, i) => [`key-${i}`, p]),
      );
    expect(calculateDamageReview(context, 'p1').totalDamage.value).toBe(600);
  });

  it.each(['initial', 'final', 'boundary'])(
    'refuses full-game claims when %s coverage is inconsistent',
    (kind) => {
      const context = fixture();
      if (kind === 'initial') setCounter(context, 0, 1, 1);
      if (kind === 'final')
        (
          context.input.participants[9].finalStats as any
        ).values.totalDamageDealtToChampions = 299;
      if (kind === 'boundary') context.frames.at(-1)!.timestamp = 179000;
      const result = calculateDamageReview(context, 'p1');
      expect(result.available).toBe(true);
      expect(result.complete).toBe(false);
      expect(result.personalPeak).toBeNull();
      expect(result.totalDamage.value).toBeNull();
    },
  );

  it('rejects a gap over 90 seconds without discarding other observed intervals', () => {
    const context = fixture();
    context.frames[1].timestamp = 20000;
    const result = calculateDamageReview(context, 'p1');
    expect(result.intervals[1].personalDamage.reason).toBe('gapped_window');
    expect(result.intervals[2].personalDamage.value).toBe(200);
    expect(result.personalPeak).toBeNull();
  });

  it('includes a partial final interval in the total but excludes it from minute ranks', () => {
    const context = fixture();
    context.frames.at(-1)!.timestamp = 121370;
    context.endMs = 121370;
    const result = calculateDamageReview(context, 'p1');
    expect(result.complete).toBe(true);
    expect(result.totalDamage.value).toBe(600);
    expect(result.intervals.at(-1)).toMatchObject({
      durationMs: 1370,
      comparableMinute: false,
      personalRank: null,
      personalDamage: { value: 200 },
    });
    expect(result.personalPeak?.startMs).toBe(60000);
  });

  it('keeps damage-only observations when combat coverage is unknown and does not claim zero deaths', () => {
    const context = fixture();
    context.combatReason = 'kill_death_summary_mismatch';
    const result = calculateDamageReview(context, 'p1');
    expect(result.complete).toBe(true);
    expect(result.personalPeak).not.toBeNull();
    expect(result.intervals[0]).toMatchObject({
      noDeaths: null,
      deathCount: null,
      nextDeath: null,
    });
    expect(result.damageWithoutDeaths.reason).toBe(
      'kill_death_summary_mismatch',
    );
    expect(result.personalPeakWithoutDeaths).toBeNull();
    expect(result.globalPeakWithoutDeaths).toBeNull();
  });

  it.each(['sourceReason', 'snapshotReason'] as const)(
    'does not produce observations when %s rejects the source',
    (field) => {
      const context = fixture();
      context[field] = 'unsupported_version';
      expect(calculateDamageReview(context, 'p1')).toMatchObject({
        available: false,
        reason: 'unsupported_version',
        intervals: [],
        totalDamage: { value: null },
      });
    },
  );

  it('preserves literal snapshot deltas with an unknown observed end, without full-game or death claims', () => {
    const context = fixture();
    context.endMs = null;
    context.combatReason = 'missing_or_ambiguous_game_end';
    const result = calculateDamageReview(context, 'p1');
    expect(result.available).toBe(true);
    expect(result.complete).toBe(false);
    expect(result.intervals[0].personalDamage.value).toBe(100);
    expect(result.intervals[0].noDeaths).toBeNull();
    expect(result.totalDamage.value).toBeNull();
    expect(result.personalPeak).toBeNull();
  });

  it('includes the 90-second coverage boundary and both 45–75 second rank boundaries', () => {
    const context = fixture();
    context.frames[1].timestamp = 30000;
    expect(calculateDamageReview(context, 'p1').complete).toBe(true);
    context.frames[1].timestamp = 45000;
    const result = calculateDamageReview(context, 'p1');
    expect(result.intervals[0].comparableMinute).toBe(true);
    expect(result.intervals[1].comparableMinute).toBe(true);
  });

  it('does not infer a participant absent from the match', () => {
    expect(calculateDamageReview(fixture(), 'absent')).toMatchObject({
      available: false,
      reason: 'missing_participant',
      intervals: [],
    });
  });

  it('refuses totals without a supported final-stat source', () => {
    const context = fixture();
    (context.input.participants[0].finalStats as any).projectionVersion = 999;
    const result = calculateDamageReview(context, 'p1');
    expect(result.complete).toBe(false);
    expect(result.totalDamage.value).toBeNull();
    expect(result.intervals[0].personalDamage.value).toBe(100);
  });
});
